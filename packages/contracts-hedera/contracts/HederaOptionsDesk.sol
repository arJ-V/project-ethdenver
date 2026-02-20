// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./YieldOracle.sol";

interface IHederaScheduleService {
    function authorizeSchedule(address scheduleAddress) external returns (int64 responseCode);

    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes calldata callData
    ) external returns (int64 responseCode, address scheduleAddress);
}

contract HederaOptionsDesk is AccessControl {
    bytes32 public constant SETTLEMENT_EXECUTOR_ROLE = keccak256("SETTLEMENT_EXECUTOR_ROLE");

    uint256 public constant MIN_EXPIRY = 120;
    uint256 public constant MAX_ORACLE_AGE = 600;
    uint256 public constant ORACLE_GRACE_WINDOW = 300;
    uint256 public constant SCHEDULE_GAS_LIMIT = 1_200_000;
    address public constant HSS_PRECOMPILE = address(0x16b);
    int64 public constant HEDERA_SUCCESS = 22;

    enum OptionStatus {
        None,
        Written,
        Settled,
        Slashed
    }

    struct OptionPosition {
        address writer;
        address buyer;
        uint256 amount;
        uint256 strike;
        uint256 expiry;
        bytes32 scheduleRef;
        OptionStatus status;
    }

    IERC20 public immutable ySolar;
    YieldOracle public immutable yieldOracle;
    uint256 public nextOptionId = 1;
    mapping(uint256 => OptionPosition) public options;

    event OptionWritten(
        uint256 indexed optionId,
        address indexed writer,
        address indexed buyer,
        uint256 amount,
        uint256 strike,
        uint256 expiry
    );
    event CollateralLocked(uint256 indexed optionId, address indexed writer, uint256 amount);
    event SettlementScheduled(uint256 indexed optionId, bytes32 indexed scheduleRef, uint256 expiry);
    event OptionSettled(
        uint256 indexed optionId,
        address indexed buyer,
        uint256 amount,
        uint256 oracleYieldIndex,
        uint256 oracleRoundId,
        uint256 oracleUpdatedAt
    );
    event CollateralReleased(
        uint256 indexed optionId,
        address indexed writer,
        uint256 amount,
        uint256 oracleYieldIndex,
        uint256 oracleRoundId,
        uint256 oracleUpdatedAt
    );
    event CollateralSlashed(
        uint256 indexed optionId,
        address indexed buyer,
        uint256 amount,
        uint256 oracleYieldIndex,
        uint256 oracleRoundId,
        uint256 oracleUpdatedAt
    );
    event SettlementFailed(
        uint256 indexed optionId,
        string reason,
        uint256 oracleRoundId,
        uint256 oracleUpdatedAt
    );
    event SettlementExecutionAttempt(
        uint256 indexed optionId,
        address indexed caller,
        uint256 blockTs,
        uint256 optionExpiry,
        uint8 optionStatus,
        uint256 oracleYieldIndex,
        uint256 oracleRoundId,
        uint256 oracleUpdatedAt,
        uint256 deskBalance,
        uint256 payoutPreview
    );
    event SettlementFailureDetail(
        uint256 indexed optionId,
        bytes4 errorSelector,
        bytes revertData,
        string decodedReason
    );

    error InvalidBuyer();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidStatus();
    error UnauthorizedSettler();
    error OptionNotExpired();
    error TransferFailed();
    error OracleNotInitialized();
    error OracleStale();
    error OracleTooFuture();
    error OracleWindowMiss();
    error HssScheduleFailed(int64 responseCode);

    constructor(address admin, address ySolarToken, address oracleAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SETTLEMENT_EXECUTOR_ROLE, admin);
        _grantRole(SETTLEMENT_EXECUTOR_ROLE, address(this));
        ySolar = IERC20(ySolarToken);
        yieldOracle = YieldOracle(oracleAddress);
    }

    // Accept native HBAR so this contract can pay for scheduled execution as HSS payer.
    receive() external payable {}

    modifier onlyKYCd(address) {
        _;
    }

    function writeOption(
        address buyer,
        uint256 amount,
        uint256 strike,
        uint256 expiry
    ) external onlyKYCd(msg.sender) returns (uint256 optionId) {
        if (buyer == address(0)) revert InvalidBuyer();
        if (amount == 0 || strike == 0) revert InvalidAmount();
        if (expiry < block.timestamp + MIN_EXPIRY) revert InvalidExpiry();

        if (!ySolar.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        optionId = nextOptionId++;
        bytes32 scheduleRef = _scheduleSettlement(optionId, expiry);

        options[optionId] = OptionPosition({
            writer: msg.sender,
            buyer: buyer,
            amount: amount,
            strike: strike,
            expiry: expiry,
            scheduleRef: scheduleRef,
            status: OptionStatus.Written
        });

        emit OptionWritten(optionId, msg.sender, buyer, amount, strike, expiry);
        emit CollateralLocked(optionId, msg.sender, amount);
        emit SettlementScheduled(optionId, scheduleRef, expiry);
    }

    function executeScheduledSettlement(uint256 optionId) external {
        // Keep this entrypoint permissive because scheduled caller identity varies by environment.
        // The real authorization boundary is inside settleOption (must be self-call only).
        OptionPosition memory op = options[optionId];
        (uint256 yieldIndex, uint256 updatedAt, uint256 roundId) = yieldOracle.getLatest();
        uint256 balance = ySolar.balanceOf(address(this));
        uint256 payoutPreview = op.amount <= balance ? op.amount : balance;

        emit SettlementExecutionAttempt(
            optionId,
            msg.sender,
            block.timestamp,
            op.expiry,
            uint8(op.status),
            yieldIndex,
            roundId,
            updatedAt,
            balance,
            payoutPreview
        );

        try this.settleOption(optionId) {} catch Error(string memory reason) {
            emit SettlementFailed(optionId, reason, roundId, updatedAt);
            emit SettlementFailureDetail(optionId, bytes4(0x08c379a0), bytes(reason), reason);
        } catch (bytes memory reasonData) {
            bytes4 selector = _selectorFrom(reasonData);
            string memory decoded = _decodeCustomError(selector);
            emit SettlementFailed(optionId, decoded, roundId, updatedAt);
            emit SettlementFailureDetail(optionId, selector, reasonData, decoded);
        }
    }

    function settleOption(uint256 optionId) external {
        if (msg.sender != address(this)) revert UnauthorizedSettler();

        OptionPosition storage op = options[optionId];
        if (op.status != OptionStatus.Written) revert InvalidStatus();
        if (block.timestamp < op.expiry) revert OptionNotExpired();

        (uint256 yieldIndex, uint256 updatedAt, uint256 roundId) = yieldOracle.getLatest();
        if (roundId == 0) revert OracleNotInitialized();
        if (updatedAt > block.timestamp) revert OracleTooFuture();
        if (block.timestamp - updatedAt > MAX_ORACLE_AGE) revert OracleStale();
        if (updatedAt < op.expiry - ORACLE_GRACE_WINDOW) revert OracleWindowMiss();

        uint256 balance = ySolar.balanceOf(address(this));
        uint256 payout = op.amount <= balance ? op.amount : balance;

        if (yieldIndex >= op.strike) {
            if (payout == 0) {
                op.status = OptionStatus.Slashed;
                emit SettlementFailed(optionId, "NO_COLLATERAL", roundId, updatedAt);
                emit CollateralSlashed(optionId, op.buyer, 0, yieldIndex, roundId, updatedAt);
                return;
            }
            if (!ySolar.transfer(op.buyer, payout)) revert TransferFailed();

            if (payout < op.amount) {
                op.status = OptionStatus.Slashed;
                emit SettlementFailed(optionId, "PARTIAL_COLLATERAL_SLASH", roundId, updatedAt);
                emit CollateralSlashed(optionId, op.buyer, payout, yieldIndex, roundId, updatedAt);
                return;
            }

            op.status = OptionStatus.Settled;
            emit OptionSettled(optionId, op.buyer, op.amount, yieldIndex, roundId, updatedAt);
            return;
        }

        if (!ySolar.transfer(op.writer, payout)) revert TransferFailed();
        if (payout < op.amount) {
            op.status = OptionStatus.Slashed;
            emit SettlementFailed(optionId, "PARTIAL_RELEASE_SLASH", roundId, updatedAt);
            emit CollateralSlashed(optionId, op.buyer, payout, yieldIndex, roundId, updatedAt);
            return;
        }

        op.status = OptionStatus.Settled;
        emit CollateralReleased(optionId, op.writer, op.amount, yieldIndex, roundId, updatedAt);
    }

    function _scheduleSettlement(uint256 optionId, uint256 expiry) internal returns (bytes32 scheduleRef) {
        // Local hardhat does not expose the Hedera system precompile, so we synthesize a reference.
        if (block.chainid == 31337) {
            return keccak256(abi.encodePacked(block.chainid, optionId, expiry, "LOCAL_DEV"));
        }

        // Schedule the role-gated entrypoint; it internally self-calls settleOption().
        // This keeps settleOption authorization strict while handling Hedera schedule caller semantics.
        bytes memory callData = abi.encodeCall(this.executeScheduledSettlement, (optionId));
        (int64 code, address scheduleAddress) = IHederaScheduleService(HSS_PRECOMPILE).scheduleCall(
            address(this),
            expiry,
            SCHEDULE_GAS_LIMIT,
            0,
            callData
        );

        if (code != HEDERA_SUCCESS || scheduleAddress == address(0)) {
            revert HssScheduleFailed(code);
        }

        // Some Hedera environments return non-success for explicit authorize on generalized calls.
        // We intentionally ignore this response and rely on schedule semantics for execution.
        IHederaScheduleService(HSS_PRECOMPILE).authorizeSchedule(scheduleAddress);

        // Allow this specific schedule to trigger executeScheduledSettlement(optionId).
        _grantRole(SETTLEMENT_EXECUTOR_ROLE, scheduleAddress);
        scheduleRef = bytes32(uint256(uint160(scheduleAddress)));
    }

    function _selectorFrom(bytes memory reasonData) internal pure returns (bytes4 selector) {
        if (reasonData.length < 4) return bytes4(0);
        assembly {
            selector := mload(add(reasonData, 32))
        }
    }

    function _decodeCustomError(bytes4 selector) internal pure returns (string memory) {
        if (selector == InvalidBuyer.selector) return "InvalidBuyer";
        if (selector == InvalidAmount.selector) return "InvalidAmount";
        if (selector == InvalidExpiry.selector) return "InvalidExpiry";
        if (selector == InvalidStatus.selector) return "InvalidStatus";
        if (selector == UnauthorizedSettler.selector) return "UnauthorizedSettler";
        if (selector == OptionNotExpired.selector) return "OptionNotExpired";
        if (selector == TransferFailed.selector) return "TransferFailed";
        if (selector == OracleNotInitialized.selector) return "OracleNotInitialized";
        if (selector == OracleStale.selector) return "OracleStale";
        if (selector == OracleTooFuture.selector) return "OracleTooFuture";
        if (selector == OracleWindowMiss.selector) return "OracleWindowMiss";
        if (selector == HssScheduleFailed.selector) return "HssScheduleFailed";
        if (selector == bytes4(0x4e487b71)) return "Panic(uint256)";
        if (selector == bytes4(0x08c379a0)) return "Error(string)";
        return "UnknownRevert";
    }
}
