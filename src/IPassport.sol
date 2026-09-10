// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPassport
/// @notice Verifier-facing interface for the Agent Passport protocol.
///         Any contract can integrate against this to ask:
///         Who are you? Who controls you? What are you allowed to do? Can you prove it?
interface IPassport {
    enum Status {
        Active,
        Suspended,
        Revoked
    }

    struct PassportInfo {
        address agent; // the autonomous operator this passport belongs to
        address controller; // the owner who issued / controls this passport
        string purpose; // human-readable statement of purpose
        uint256 parentId; // 0 for a root passport, else the delegating passport's id
        uint8 depth; // delegation depth (0 = root)
        uint64 validFrom;
        uint64 validUntil;
        uint256 perTxLimit; // max value per verified action, in wei (0 = unlimited)
        uint256 dailyLimit; // max value per UTC day, in wei (0 = unlimited)
        Status status;
        uint64 actionCount; // number of verified actions performed
        bytes32 lastActionHash; // rolling hash of the action log
    }

    /// @notice Read-only check: is this passport currently allowed to perform `action` worth `amount` wei?
    function verifyAuthority(uint256 passportId, bytes32 action, uint256 amount) external view returns (bool);

    /// @notice Verify authority AND record the action + spend against the passport's limits.
    ///         Reverts with a descriptive error when authority is not established.
    function verifyAndSpend(uint256 passportId, bytes32 action, uint256 amount) external;

    /// @notice True when the passport exists, is Active, and is inside its validity window.
    function isActive(uint256 passportId) external view returns (bool);

    function getPassport(uint256 passportId) external view returns (PassportInfo memory);

    function hasPermission(uint256 passportId, bytes32 action) external view returns (bool);

    function agentOf(uint256 passportId) external view returns (address);

    /// @notice Amount already spent against the daily limit for the current UTC day.
    function spentToday(uint256 passportId) external view returns (uint256);
}
