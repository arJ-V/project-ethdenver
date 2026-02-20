// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract YieldOracle is AccessControl {
    bytes32 public constant ADMIN_ORACLE_ROLE = keccak256("ADMIN_ORACLE_ROLE");

    struct OracleRound {
        uint256 yieldIndex;
        uint256 updatedAt;
        uint256 roundId;
    }

    OracleRound private _latest;

    event YieldIndexUpdated(
        uint256 indexed roundId,
        uint256 indexed yieldIndex,
        uint256 indexed updatedAt
    );

    error ZeroYieldIndex();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ORACLE_ROLE, admin);
    }

    function pushYieldIndex(uint256 yieldIndex) external onlyRole(ADMIN_ORACLE_ROLE) {
        if (yieldIndex == 0) revert ZeroYieldIndex();
        _latest.roundId += 1;
        _latest.yieldIndex = yieldIndex;
        _latest.updatedAt = block.timestamp;
        emit YieldIndexUpdated(_latest.roundId, yieldIndex, _latest.updatedAt);
    }

    function getLatest()
        external
        view
        returns (uint256 yieldIndex, uint256 updatedAt, uint256 roundId)
    {
        return (_latest.yieldIndex, _latest.updatedAt, _latest.roundId);
    }
}
