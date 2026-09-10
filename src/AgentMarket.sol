// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPassport} from "./IPassport.sol";

/// @title AgentMarket
/// @notice A minimal agent-to-agent task market. One agent (the buyer) posts a task
///         with escrowed payment; another agent (the worker) accepts it, delivers a
///         result hash, and gets paid on approval. Neither side is trusted:
///         every handshake is gated by the Passport protocol —
///           buyer  must hold a passport authorizing HIRE_AGENTS for the escrowed amount
///           worker must hold a passport authorizing PERFORM_WORK
///         The events are the communication channel: agents watch them the way
///         humans watch a job board.
contract AgentMarket {
    bytes32 public constant HIRE_AGENTS = keccak256("HIRE_AGENTS");
    bytes32 public constant PERFORM_WORK = keccak256("PERFORM_WORK");

    enum TaskStatus {
        Open,
        Accepted,
        Delivered,
        Completed,
        Cancelled
    }

    struct Task {
        uint256 buyerPassportId;
        address buyer;
        uint256 workerPassportId;
        address worker;
        string description;
        uint256 payment;
        uint64 deadline;
        bytes32 resultHash;
        TaskStatus status;
    }

    IPassport public immutable passport;

    uint256 public taskCount;
    mapping(uint256 => Task) public tasks;

    event TaskPosted(
        uint256 indexed taskId, uint256 indexed buyerPassportId, string description, uint256 payment, uint64 deadline
    );
    event TaskAccepted(uint256 indexed taskId, uint256 indexed workerPassportId, address indexed worker);
    event TaskDelivered(uint256 indexed taskId, bytes32 resultHash);
    event TaskCompleted(uint256 indexed taskId, address indexed worker, uint256 payment);
    event TaskCancelled(uint256 indexed taskId);

    error NotPassportAgent(uint256 passportId, address caller);
    error ZeroPayment();
    error TaskNotOpen(uint256 taskId);
    error TaskNotAccepted(uint256 taskId);
    error TaskNotDelivered(uint256 taskId);
    error NotBuyer(uint256 taskId, address caller);
    error NotWorker(uint256 taskId, address caller);
    error DeadlineNotPassed(uint256 taskId);
    error BuyerCannotWork(uint256 taskId);

    constructor(address passport_) {
        passport = IPassport(passport_);
    }

    /// @notice An agent posts a task and escrows the payment. Its passport must
    ///         authorize HIRE_AGENTS for the escrowed amount (per-tx + daily limits apply).
    function postTask(uint256 buyerPassportId, string calldata description, uint64 deadline)
        external
        payable
        returns (uint256 taskId)
    {
        if (msg.value == 0) revert ZeroPayment();
        if (passport.agentOf(buyerPassportId) != msg.sender) {
            revert NotPassportAgent(buyerPassportId, msg.sender);
        }
        passport.verifyAndSpend(buyerPassportId, HIRE_AGENTS, msg.value);

        taskId = ++taskCount;
        tasks[taskId] = Task({
            buyerPassportId: buyerPassportId,
            buyer: msg.sender,
            workerPassportId: 0,
            worker: address(0),
            description: description,
            payment: msg.value,
            deadline: deadline,
            resultHash: bytes32(0),
            status: TaskStatus.Open
        });

        emit TaskPosted(taskId, buyerPassportId, description, msg.value, deadline);
    }

    /// @notice A worker agent takes the task. Its passport must authorize PERFORM_WORK —
    ///         proof that its controller actually deployed it to do this kind of work.
    function acceptTask(uint256 taskId, uint256 workerPassportId) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Open) revert TaskNotOpen(taskId);
        if (msg.sender == t.buyer) revert BuyerCannotWork(taskId);
        if (passport.agentOf(workerPassportId) != msg.sender) {
            revert NotPassportAgent(workerPassportId, msg.sender);
        }
        // amount 0: verify identity, permission, validity and status — no spend.
        passport.verifyAndSpend(workerPassportId, PERFORM_WORK, 0);

        t.workerPassportId = workerPassportId;
        t.worker = msg.sender;
        t.status = TaskStatus.Accepted;

        emit TaskAccepted(taskId, workerPassportId, msg.sender);
    }

    /// @notice The worker commits the keccak256 hash of its deliverable on-chain.
    ///         The deliverable itself travels off-chain; the hash is the proof of delivery.
    function deliverTask(uint256 taskId, bytes32 resultHash) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Accepted) revert TaskNotAccepted(taskId);
        if (msg.sender != t.worker) revert NotWorker(taskId, msg.sender);

        t.resultHash = resultHash;
        t.status = TaskStatus.Delivered;

        emit TaskDelivered(taskId, resultHash);
    }

    /// @notice The buyer reviews the deliverable off-chain, verifies the hash matches,
    ///         then releases the escrowed payment to the worker.
    function approveTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (t.status != TaskStatus.Delivered) revert TaskNotDelivered(taskId);
        if (msg.sender != t.buyer) revert NotBuyer(taskId, msg.sender);

        t.status = TaskStatus.Completed;
        (bool ok,) = t.worker.call{value: t.payment}("");
        require(ok, "payment failed");

        emit TaskCompleted(taskId, t.worker, t.payment);
    }

    /// @notice The buyer withdraws the escrow if no worker took the task in time.
    function cancelTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (msg.sender != t.buyer) revert NotBuyer(taskId, msg.sender);
        if (t.status != TaskStatus.Open) revert TaskNotOpen(taskId);
        if (block.timestamp <= t.deadline) revert DeadlineNotPassed(taskId);

        t.status = TaskStatus.Cancelled;
        (bool ok,) = t.buyer.call{value: t.payment}("");
        require(ok, "refund failed");

        emit TaskCancelled(taskId);
    }

    receive() external payable {}
}
