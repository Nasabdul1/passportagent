// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IPassport} from "./IPassport.sol";

/// @title AgentPassport
/// @notice The identity and authority layer for autonomous agents.
///         Each passport is an ERC-721 token binding an agent address to a
///         controller, a purpose, a permission set, spend limits, a validity
///         window and a status. Passports can delegate bounded authority to
///         child passports, forming an auditable chain of authority.
contract AgentPassportV2 is ERC721, IPassport {
    mapping(uint256 => mapping(address => mapping(bytes32 => address))) private _consumerApprovals;
    mapping(uint256 => uint256) private _ownershipEpoch;
    mapping(uint256 => mapping(address => mapping(bytes32 => uint256))) private _approvalEpoch;
    mapping(uint256 => bytes32[]) private _permissionKeys;
    mapping(uint256 => mapping(bytes32 => bool)) private _knownPermission;
    event ConsumerApproval(uint256 indexed passportId, address indexed consumer, bytes32 indexed action, bool allowed);
    error UnauthorizedConsumer();
    error ZeroAgent();

    function setConsumer(uint256 id, address consumer, bytes32 action, bool allowed) external {
        _requireController(id);
        if (consumer == address(0)) revert ZeroAgent();
        _consumerApprovals[id][consumer][action] = allowed ? msg.sender : address(0);
        _approvalEpoch[id][consumer][action] = _ownershipEpoch[id];
        emit ConsumerApproval(id, consumer, action, allowed);
    }

    function consumerAllowed(uint256 id, address consumer, bytes32 action) public view returns (bool) {
        address approvedBy = _consumerApprovals[id][consumer][action];
        return approvedBy != address(0) && approvedBy == _ownerOf(id) && _approvalEpoch[id][consumer][action] == _ownershipEpoch[id];
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address previous = super._update(to, tokenId, auth);
        _ownershipEpoch[tokenId]++;
        return previous;
    }

    function permissionKeys(uint256 id) external view returns (bytes32[] memory) { return _permissionKeys[id]; }

    function _remember(uint256 id, bytes32 action) internal {
        if (!_knownPermission[id][action]) { _knownPermission[id][action] = true; _permissionKeys[id].push(action); }
    }
    uint256 public constant MAX_DELEGATION_DEPTH = 8;

    struct Passport {
        address agent;
        string purpose;
        uint256 parentId;
        uint8 depth;
        uint64 validFrom;
        uint64 validUntil;
        uint256 perTxLimit;
        uint256 dailyLimit;
        Status status;
        uint64 actionCount;
        bytes32 lastActionHash;
    }

    uint256 private _nextId = 1;

    mapping(uint256 => Passport) private _passports;
    mapping(uint256 => mapping(bytes32 => bool)) private _permissions;
    mapping(uint256 => uint256[]) private _children;
    mapping(uint256 => mapping(uint256 => uint256)) private _dailySpent; // passportId => day => amount

    event PassportMinted(
        uint256 indexed passportId, address indexed agent, address indexed controller, string purpose, uint256 parentId
    );
    event PermissionSet(uint256 indexed passportId, bytes32 indexed action, bool allowed);
    event LimitsSet(uint256 indexed passportId, uint256 perTxLimit, uint256 dailyLimit);
    event StatusChanged(uint256 indexed passportId, Status status);
    event ActionVerified(
        uint256 indexed passportId, address indexed consumer, bytes32 indexed action, uint256 amount, bytes32 actionHash
    );

    error PassportNotFound(uint256 passportId);
    error NotPassportController(uint256 passportId, address caller);
    error NotActive(uint256 passportId);
    error NotYetValid(uint256 passportId);
    error Expired(uint256 passportId);
    error PermissionDenied(uint256 passportId, bytes32 action);
    error ExceedsPerTxLimit(uint256 passportId, uint256 amount, uint256 limit);
    error ExceedsDailyLimit(uint256 passportId, uint256 amount, uint256 limit);
    error InvalidValidityWindow(uint64 validFrom, uint64 validUntil);
    error AlreadyRevoked(uint256 passportId);
    error DelegationTooDeep(uint256 parentId);
    error PermissionNotSubset(uint256 parentId, bytes32 action);
    error LimitsExceedParent(uint256 parentId);
    error ExpiryExceedsParent(uint256 parentId);

    constructor() ERC721("Agent Passport", "PASSPORT") {}

    // ---------------------------------------------------------------------
    // Issuance
    // ---------------------------------------------------------------------

    /// @notice Issue a root passport for `agent`. The caller becomes the controller.
    /// @param actions initial permitted action identifiers (e.g. keccak256("BOOK_TRAVEL")).
    ///        A limit of 0 means unlimited. `validUntil` must be after `validFrom`.
    function mint(
        address agent,
        string calldata purpose,
        uint64 validFrom,
        uint64 validUntil,
        uint256 perTxLimit,
        uint256 dailyLimit,
        bytes32[] calldata actions
    ) external returns (uint256 passportId) {
        if (agent == address(0)) revert ZeroAgent();
        if (validUntil <= validFrom) revert InvalidValidityWindow(validFrom, validUntil);

        passportId = _nextId++;
        Passport storage p = _passports[passportId];
        p.agent = agent;
        p.purpose = purpose;
        p.validFrom = validFrom;
        p.validUntil = validUntil;
        p.perTxLimit = perTxLimit;
        p.dailyLimit = dailyLimit;
        p.status = Status.Active;

        _mint(msg.sender, passportId);

        for (uint256 i = 0; i < actions.length; i++) {
            _remember(passportId, actions[i]);
            _permissions[passportId][actions[i]] = true;
            emit PermissionSet(passportId, actions[i], true);
        }

        emit PassportMinted(passportId, agent, msg.sender, purpose, 0);
    }

    // ---------------------------------------------------------------------
    // Delegation
    // ---------------------------------------------------------------------

    /// @notice Delegate a bounded subset of this passport's authority to a child agent.
    ///         Child permissions must be a subset of the parent's, child limits cannot
    ///         exceed the parent's, and the child cannot outlive the parent.
    function delegate(
        uint256 parentId,
        address childAgent,
        string calldata purpose,
        bytes32[] calldata actions,
        uint256 perTxLimit,
        uint256 dailyLimit,
        uint64 validUntil
    ) external returns (uint256 childId) {
        if (childAgent == address(0)) revert ZeroAgent();
        Passport storage parent = _passports[parentId];
        _requireController(parentId);
        _requireUsable(parentId);

        if (parent.depth + 1 > MAX_DELEGATION_DEPTH) revert DelegationTooDeep(parentId);
        if (validUntil > parent.validUntil) revert ExpiryExceedsParent(parentId);
        if (validUntil <= block.timestamp) revert InvalidValidityWindow(uint64(block.timestamp), validUntil);
        if (
            (parent.perTxLimit != 0 && (perTxLimit == 0 || perTxLimit > parent.perTxLimit))
                || (parent.dailyLimit != 0 && (dailyLimit == 0 || dailyLimit > parent.dailyLimit))
        ) revert LimitsExceedParent(parentId);

        for (uint256 i = 0; i < actions.length; i++) {
            if (!_hasPermission(parentId, actions[i])) revert PermissionNotSubset(parentId, actions[i]);
        }

        childId = _nextId++;
        Passport storage child = _passports[childId];
        child.agent = childAgent;
        child.purpose = purpose;
        child.parentId = parentId;
        child.depth = parent.depth + 1;
        child.validFrom = uint64(block.timestamp);
        child.validUntil = validUntil;
        child.perTxLimit = perTxLimit;
        child.dailyLimit = dailyLimit;
        child.status = Status.Active;

        _children[parentId].push(childId);
        _mint(msg.sender, childId);

        for (uint256 i = 0; i < actions.length; i++) {
            _remember(childId, actions[i]);
            _permissions[childId][actions[i]] = true;
            emit PermissionSet(childId, actions[i], true);
        }

        emit PassportMinted(childId, childAgent, msg.sender, purpose, parentId);
    }

    // ---------------------------------------------------------------------
    // Authority management (controller only)
    // ---------------------------------------------------------------------

    function setPermission(uint256 passportId, bytes32 action, bool allowed) external {
        _requireController(passportId);
        uint256 parent = _passports[passportId].parentId;
        if (allowed && parent != 0 && !_hasPermission(parent, action)) revert PermissionNotSubset(parent, action);
        _remember(passportId, action);
        _permissions[passportId][action] = allowed;
        emit PermissionSet(passportId, action, allowed);
    }

    function setLimits(uint256 passportId, uint256 perTxLimit, uint256 dailyLimit) external {
        _requireController(passportId);
        Passport storage p = _passports[passportId];
        for (uint256 id = p.parentId; id != 0; id = _passports[id].parentId) {
            Passport storage ancestor = _passports[id];
            if ((ancestor.perTxLimit != 0 && (perTxLimit == 0 || perTxLimit > ancestor.perTxLimit)) ||
                (ancestor.dailyLimit != 0 && (dailyLimit == 0 || dailyLimit > ancestor.dailyLimit))) revert LimitsExceedParent(id);
        }
        p.perTxLimit = perTxLimit;
        p.dailyLimit = dailyLimit;
        emit LimitsSet(passportId, perTxLimit, dailyLimit);
    }

    function suspend(uint256 passportId) external {
        _requireController(passportId);
        _passports[passportId].status = Status.Suspended;
        emit StatusChanged(passportId, Status.Suspended);
    }

    function reactivate(uint256 passportId) external {
        _requireController(passportId);
        Passport storage p = _passports[passportId];
        if (p.status == Status.Revoked) revert AlreadyRevoked(passportId);
        p.status = Status.Active;
        emit StatusChanged(passportId, Status.Active);
    }

    /// @notice Permanently revoke a passport and every passport delegated beneath it.
    function revoke(uint256 passportId) external {
        _requireController(passportId);
        _revokeTree(passportId);
    }

    // ---------------------------------------------------------------------
    // Verification
    // ---------------------------------------------------------------------

    /// @inheritdoc IPassport
    function verifyAuthority(uint256 passportId, bytes32 action, uint256 amount) external view returns (bool) {
        if (passportId == 0 || _passports[passportId].agent == address(0)) return false;
        for (uint256 id = passportId; id != 0; id = _passports[id].parentId) {
            Passport storage p = _passports[id];
            if (p.status != Status.Active || block.timestamp < p.validFrom || block.timestamp > p.validUntil) return false;
            if (!_permissions[id][action]) return false;
            if (p.perTxLimit != 0 && amount > p.perTxLimit) return false;
            uint256 spent = _dailySpent[id][_today()];
            if (p.dailyLimit != 0 && (spent > p.dailyLimit || amount > p.dailyLimit - spent)) return false;
        }
        return true;
    }

    /// @inheritdoc IPassport
    function verifyAndSpend(uint256 passportId, bytes32 action, uint256 amount) external {
        if (!consumerAllowed(passportId, msg.sender, action)) revert UnauthorizedConsumer();
        Passport storage p = _passports[passportId];
        _requireUsable(passportId);
        for (uint256 id = p.parentId; id != 0; id = _passports[id].parentId) {
            Passport storage ancestor = _passports[id];
            if (!_permissions[id][action]) revert PermissionDenied(id, action);
            if (ancestor.perTxLimit != 0 && amount > ancestor.perTxLimit) revert ExceedsPerTxLimit(id, amount, ancestor.perTxLimit);
            uint256 used = _dailySpent[id][_today()];
            if (ancestor.dailyLimit != 0 && (used > ancestor.dailyLimit || amount > ancestor.dailyLimit - used)) revert ExceedsDailyLimit(id, amount, ancestor.dailyLimit);
            _dailySpent[id][_today()] = used + amount;
        }
        if (p.agent == address(0)) revert PassportNotFound(passportId);
        if (p.status != Status.Active) revert NotActive(passportId);
        if (block.timestamp < p.validFrom) revert NotYetValid(passportId);
        if (block.timestamp > p.validUntil) revert Expired(passportId);
        if (!_permissions[passportId][action]) revert PermissionDenied(passportId, action);
        if (p.perTxLimit != 0 && amount > p.perTxLimit) revert ExceedsPerTxLimit(passportId, amount, p.perTxLimit);

        uint256 day = _today();
        uint256 spent = _dailySpent[passportId][day];
        if (p.dailyLimit != 0 && spent + amount > p.dailyLimit) {
            revert ExceedsDailyLimit(passportId, spent + amount, p.dailyLimit);
        }
        _dailySpent[passportId][day] = spent + amount;

        bytes32 actionHash = keccak256(
            abi.encode(p.lastActionHash, passportId, msg.sender, action, amount, block.timestamp, p.actionCount)
        );
        p.lastActionHash = actionHash;
        p.actionCount += 1;

        emit ActionVerified(passportId, msg.sender, action, amount, actionHash);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc IPassport
    function isActive(uint256 passportId) external view returns (bool) {
        if (_passports[passportId].agent == address(0)) return false;
        for (uint256 id = passportId; id != 0; id = _passports[id].parentId) {
            Passport storage p = _passports[id];
            if (p.status != Status.Active || block.timestamp < p.validFrom || block.timestamp > p.validUntil) return false;
        }
        return true;
    }

    /// @inheritdoc IPassport
    function getPassport(uint256 passportId) external view returns (PassportInfo memory) {
        Passport storage p = _passports[passportId];
        if (p.agent == address(0)) revert PassportNotFound(passportId);
        return PassportInfo({
            agent: p.agent,
            controller: ownerOf(passportId),
            purpose: p.purpose,
            parentId: p.parentId,
            depth: p.depth,
            validFrom: p.validFrom,
            validUntil: p.validUntil,
            perTxLimit: p.perTxLimit,
            dailyLimit: p.dailyLimit,
            status: p.status,
            actionCount: p.actionCount,
            lastActionHash: p.lastActionHash
        });
    }

    /// @inheritdoc IPassport
    function hasPermission(uint256 passportId, bytes32 action) external view returns (bool) {
        return _hasPermission(passportId, action);
    }

    function _hasPermission(uint256 id, bytes32 action) internal view returns (bool) {
        if (id == 0) return false;
        for (; id != 0; id = _passports[id].parentId) if (!_permissions[id][action]) return false;
        return true;
    }

    /// @inheritdoc IPassport
    function agentOf(uint256 passportId) external view returns (address) {
        return _passports[passportId].agent;
    }

    /// @inheritdoc IPassport
    function spentToday(uint256 passportId) external view returns (uint256) {
        return _dailySpent[passportId][_today()];
    }

    function getChildren(uint256 passportId) external view returns (uint256[] memory) {
        return _children[passportId];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _requireController(uint256 passportId) internal view {
        address owner = _ownerOf(passportId);
        if (owner == address(0)) revert PassportNotFound(passportId);
        if (owner != msg.sender) revert NotPassportController(passportId, msg.sender);
        for (uint256 id = passportId; id != 0; id = _passports[id].parentId)
            if (_passports[id].status == Status.Revoked) revert AlreadyRevoked(id);
    }

    function _requireUsable(uint256 passportId) internal view {
        if (_passports[passportId].agent == address(0)) revert PassportNotFound(passportId);
        for (uint256 id = passportId; id != 0; id = _passports[id].parentId) {
        Passport storage p = _passports[id];
        if (p.status != Status.Active) revert NotActive(id);
        if (block.timestamp < p.validFrom) revert NotYetValid(id);
        if (block.timestamp > p.validUntil) revert Expired(id);
        }
    }

    function _revokeTree(uint256 passportId) internal {
        Passport storage p = _passports[passportId];
        if (p.status != Status.Revoked) {
            p.status = Status.Revoked;
            emit StatusChanged(passportId, Status.Revoked);
        }
        // Descendants become unusable via bounded ancestor checks, without an unbounded write loop.
    }
}
