// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ADIAssetVault is ERC721, AccessControl, Pausable {
    bytes32 public constant ASSET_ADMIN_ROLE = keccak256("ASSET_ADMIN_ROLE");

    uint256 public nextAssetId = 1;
    mapping(uint256 => bool) private _assetLocked;

    event AssetMinted(uint256 indexed assetId, address indexed owner);
    event AssetLocked(
        uint256 indexed assetId,
        address indexed owner,
        uint256 expectedYieldKWh,
        uint256 lockTs
    );
    event YieldMintRequested(
        uint256 indexed assetId,
        uint256 expectedYieldKWh,
        address indexed beneficiary
    );

    error AssetAlreadyLocked(uint256 assetId);
    error ZeroBeneficiary();
    error ZeroExpectedYield();

    constructor(address admin) ERC721("ADI Principal Asset", "ADIPA") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ASSET_ADMIN_ROLE, admin);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function mintAsset(address to) external onlyRole(ASSET_ADMIN_ROLE) returns (uint256 assetId) {
        assetId = nextAssetId++;
        _safeMint(to, assetId);
        emit AssetMinted(assetId, to);
    }

    function isAssetLocked(uint256 assetId) external view returns (bool) {
        return _assetLocked[assetId];
    }

    function lockAsset(
        uint256 assetId,
        uint256 expectedYieldKWh,
        address beneficiary
    ) external onlyRole(ASSET_ADMIN_ROLE) whenNotPaused {
        if (_assetLocked[assetId]) revert AssetAlreadyLocked(assetId);
        if (beneficiary == address(0)) revert ZeroBeneficiary();
        if (expectedYieldKWh == 0) revert ZeroExpectedYield();

        address owner = ownerOf(assetId);
        _transfer(owner, address(this), assetId);
        _assetLocked[assetId] = true;

        emit AssetLocked(assetId, owner, expectedYieldKWh, block.timestamp);
        emit YieldMintRequested(assetId, expectedYieldKWh, beneficiary);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
