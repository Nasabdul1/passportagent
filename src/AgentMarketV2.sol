// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPassport} from "./IPassport.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Escrow with explicit work/review deadlines and a task-specific arbitrator.
/// Controllers must approve this consumer for HIRE_AGENTS / PERFORM_WORK in Passport V2.
contract AgentMarketV2 is ReentrancyGuard {
    enum Status { Open, Accepted, Delivered, Disputed, Settled }
    struct Task {
        address buyer; address worker; address arbitrator;
        uint256 buyerPassport; uint256 workerPassport; uint256 payment;
        uint64 deadline; uint64 reviewUntil; Status status;
        string description; bytes32 resultHash;
    }
    IPassport public immutable passport;
    uint256 public taskCount;
    uint256 public constant REVIEW_PERIOD = 3 days;
    mapping(uint256 => Task) public tasks;
    mapping(address => uint256) public claimable;
    event Posted(uint256 indexed id, address indexed buyer, address arbitrator, uint256 payment, uint64 deadline);
    event Accepted(uint256 indexed id, address indexed worker);
    event Delivered(uint256 indexed id, bytes32 resultHash, uint64 reviewUntil);
    event Disputed(uint256 indexed id, bytes32 evidenceHash);
    event Settled(uint256 indexed id, uint256 workerAmount, uint256 buyerAmount);
    event Withdrawn(address indexed owner, address indexed recipient, uint256 amount);
    error InvalidTask(); error Unauthorized(); error InvalidTerms(); error WrongState(); error TooEarly(); error TooLate();
    constructor(address passport_) { require(passport_ != address(0)); passport = IPassport(passport_); }
    function postTask(uint256 passportId, string calldata description, uint64 deadline, address arbitrator) external payable nonReentrant returns (uint256 id) {
        if (msg.value == 0 || bytes(description).length == 0 || bytes(description).length > 4096 || deadline <= block.timestamp || deadline > block.timestamp + 90 days || arbitrator == address(0) || arbitrator == msg.sender) revert InvalidTerms();
        if (passport.agentOf(passportId) != msg.sender) revert Unauthorized();
        passport.verifyAndSpend(passportId, keccak256("HIRE_AGENTS"), msg.value);
        id = ++taskCount;
        tasks[id] = Task(msg.sender, address(0), arbitrator, passportId, 0, msg.value, deadline, 0, Status.Open, description, 0);
        emit Posted(id,msg.sender,arbitrator,msg.value,deadline);
    }
    function acceptTask(uint256 id, uint256 passportId) external nonReentrant {
        Task storage t = _task(id);
        if(t.status != Status.Open) revert WrongState();
        if(block.timestamp >= t.deadline) revert TooLate();
        if(msg.sender == t.buyer || msg.sender == t.arbitrator || passport.agentOf(passportId) != msg.sender) revert Unauthorized();
        passport.verifyAndSpend(passportId, keccak256("PERFORM_WORK"), 0);
        t.worker = msg.sender; t.workerPassport = passportId; t.status = Status.Accepted;
        emit Accepted(id,msg.sender);
    }
    function deliverTask(uint256 id, bytes32 resultHash) external {
        Task storage t = _task(id);
        if(t.status != Status.Accepted) revert WrongState();
        if(msg.sender != t.worker) revert Unauthorized();
        if(block.timestamp >= t.deadline) revert TooLate();
        if(resultHash == 0) revert InvalidTerms();
        t.resultHash = resultHash; t.reviewUntil = uint64(block.timestamp + REVIEW_PERIOD); t.status = Status.Delivered;
        emit Delivered(id,resultHash,t.reviewUntil);
    }
    function cancelTask(uint256 id) external {
        Task storage t = _task(id);
        if(msg.sender != t.buyer) revert Unauthorized();
        if(t.status != Status.Open && t.status != Status.Accepted) revert WrongState();
        if(t.status == Status.Accepted && block.timestamp < t.deadline) revert TooEarly();
        _settle(id,t,0);
    }
    function approveTask(uint256 id) external {
        Task storage t = _task(id);
        if(msg.sender != t.buyer) revert Unauthorized();
        if(t.status != Status.Delivered) revert WrongState();
        _settle(id,t,t.payment);
    }
    function claimAfterReview(uint256 id) external {
        Task storage t = _task(id);
        if(t.status != Status.Delivered) revert WrongState();
        if(block.timestamp < t.reviewUntil) revert TooEarly();
        _settle(id,t,t.payment);
    }
    function dispute(uint256 id, bytes32 evidenceHash) external {
        Task storage t = _task(id);
        if(msg.sender != t.buyer) revert Unauthorized();
        if(t.status != Status.Delivered) revert WrongState();
        if(block.timestamp >= t.reviewUntil) revert TooLate();
        if(evidenceHash == 0) revert InvalidTerms();
        t.status = Status.Disputed; emit Disputed(id,evidenceHash);
    }
    function resolve(uint256 id, uint256 workerAmount) external {
        Task storage t = _task(id);
        if(msg.sender != t.arbitrator) revert Unauthorized();
        if(t.status != Status.Disputed || workerAmount > t.payment) revert InvalidTerms();
        _settle(id,t,workerAmount);
    }
    /// @notice Either party can concede during a dispute if the arbitrator is unavailable.
    function concede(uint256 id) external {
        Task storage t = _task(id);
        if(t.status != Status.Disputed) revert WrongState();
        if(msg.sender != t.buyer && msg.sender != t.worker) revert Unauthorized();
        _settle(id,t,msg.sender == t.buyer ? t.payment : 0);
    }
    function withdraw(address payable recipient) external nonReentrant {
        if(recipient == address(0)) revert InvalidTerms();
        uint256 amount = claimable[msg.sender];
        if(amount == 0) revert InvalidTerms();
        claimable[msg.sender] = 0;
        (bool ok,) = recipient.call{value:amount}(""); require(ok,"Withdrawal failed");
        emit Withdrawn(msg.sender,recipient,amount);
    }
    function _task(uint256 id) internal view returns (Task storage t) { if(id == 0 || id > taskCount) revert InvalidTask(); return tasks[id]; }
    function _settle(uint256 id, Task storage t, uint256 workerAmount) internal {
        t.status = Status.Settled;
        claimable[t.worker] += workerAmount; claimable[t.buyer] += t.payment-workerAmount;
        emit Settled(id,workerAmount,t.payment-workerAmount);
    }
}
