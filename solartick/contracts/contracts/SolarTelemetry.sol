// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SolarTelemetry
 * @notice Emits solar farm telemetry as events; no on-chain storage (cheap tx).
 */
contract SolarTelemetry {
    event Telemetry(
        uint256 indexed siteId,
        uint256 timestamp,
        uint256 wattHours,
        uint256 batterySocBps
    );

    function publish(
        uint256 siteId,
        uint256 timestamp,
        uint256 wattHours,
        uint256 batterySocBps
    ) external {
        emit Telemetry(siteId, timestamp, wattHours, batterySocBps);
    }
}
