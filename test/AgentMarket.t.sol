// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPassport} from "../src/AgentPassport.sol";
import {AgentMarket} from "../src/AgentMarket.sol";

/// @notice Agent-to-agent flow: an orchestrator agent hires specialist agents,
///         with every handshake gated by passports.
contract AgentMarketTest is Test {
    AgentPassport internal passport;
    AgentMarket internal market;

    address internal alice = makeAddr("alice"); // controls the orchestrator
    address internal bob = makeAddr("bob"); // controls the specialists
    address internal orchestrator = makeAddr("orchestratorAgent");
    address internal researcher = makeAddr("researchAgent");
    address internal writer = makeAddr("writerAgent");
    address internal rando = makeAddr("rando");

    bytes32 internal constant HIRE_AGENTS = keccak256("HIRE_AGENTS");
    bytes32 internal constant PERFORM_WORK = keccak256("PERFORM_WORK");

    uint64 internal validFrom;
    uint64 internal validUntil;
    uint64 internal deadline;

    uint256 internal orchestratorPassport;
    uint256 internal researcherPassport;
    uint256 internal writerPassport;

    function setUp() public {
        passport = new AgentPassport();
        market = new AgentMarket(address(passport));
        validFrom = uint64(block.timestamp);
        validUntil = uint64(block.timestamp + 30 days);
        deadline = uint64(block.timestamp + 7 days);

        vm.deal(orchestrator, 10 ether);
        vm.deal(rando, 10 ether);

        // Alice's orchestrator may hire, within a budget.
        bytes32[] memory hirePerms = new bytes32[](1);
        hirePerms[0] = HIRE_AGENTS;
        vm.prank(alice);
        orchestratorPassport =
            passport.mint(orchestrator, "Task orchestration", validFrom, validUntil, 2 ether, 5 ether, hirePerms);

        // Bob's specialists may perform work.
        bytes32[] memory workPerms = new bytes32[](1);
        workPerms[0] = PERFORM_WORK;
        vm.prank(bob);
        researcherPassport = passport.mint(researcher, "Research", validFrom, validUntil, 0, 0, workPerms);
        vm.prank(bob);
        writerPassport = passport.mint(writer, "Writing", validFrom, validUntil, 0, 0, workPerms);
    }

    function _postTask() internal returns (uint256 taskId) {
        vm.prank(orchestrator);
        taskId = market.postTask{value: 1 ether}(orchestratorPassport, "Research DeFi yield trends", deadline);
    }

    function test_fullAgentToAgentFlow() public {
        uint256 taskId = _postTask();
        assertEq(address(market).balance, 1 ether);
        assertEq(passport.spentToday(orchestratorPassport), 1 ether);

        vm.prank(researcher);
        market.acceptTask(taskId, researcherPassport);

        bytes32 resultHash = keccak256("report: defi yields are...");
        vm.prank(researcher);
        market.deliverTask(taskId, resultHash);

        uint256 balBefore = researcher.balance;
        vm.prank(orchestrator);
        market.approveTask(taskId);

        assertEq(researcher.balance, balBefore + 1 ether);
        assertEq(address(market).balance, 0);

        (,, uint256 workerPassportId, address worker,,,, bytes32 storedHash,) = _task(taskId);
        assertEq(workerPassportId, researcherPassport);
        assertEq(worker, researcher);
        assertEq(storedHash, resultHash);
    }

    function _task(uint256 taskId)
        internal
        view
        returns (uint256, address, uint256, address, string memory, uint256, uint64, bytes32, AgentMarket.TaskStatus)
    {
        (
            uint256 buyerPassportId,
            address buyer,
            uint256 workerPassportId,
            address worker,
            string memory description,
            uint256 payment,
            uint64 taskDeadline,
            bytes32 resultHash,
            AgentMarket.TaskStatus status
        ) = market.tasks(taskId);
        return (
            buyerPassportId, buyer, workerPassportId, worker, description, payment, taskDeadline, resultHash, status
        );
    }

    function test_postTask_revertsOverBuyerBudget() public {
        vm.prank(orchestrator);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentPassport.ExceedsPerTxLimit.selector, orchestratorPassport, 3 ether, 2 ether
            )
        );
        market.postTask{value: 3 ether}(orchestratorPassport, "too expensive", deadline);
    }

    function test_postTask_revertsWithoutHirePermission() public {
        // The researcher has no HIRE_AGENTS permission.
        vm.deal(researcher, 1 ether);
        vm.prank(researcher);
        vm.expectRevert(
            abi.encodeWithSelector(AgentPassport.PermissionDenied.selector, researcherPassport, HIRE_AGENTS)
        );
        market.postTask{value: 0.5 ether}(researcherPassport, "hire someone", deadline);
    }

    function test_acceptTask_revertsForStrangerWithoutPassport() public {
        uint256 taskId = _postTask();
        vm.prank(rando);
        vm.expectRevert(
            abi.encodeWithSelector(AgentMarket.NotPassportAgent.selector, writerPassport, rando)
        );
        market.acceptTask(taskId, writerPassport);
    }

    function test_acceptTask_revertsWithoutWorkPermission() public {
        uint256 taskId = _postTask();
        // The orchestrator's passport allows hiring, not performing.
        vm.deal(address(0xbeef), 1 ether);
        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(AgentMarket.BuyerCannotWork.selector, taskId));
        market.acceptTask(taskId, orchestratorPassport);
    }

    function test_revokedWorkerCannotAccept() public {
        uint256 taskId = _postTask();
        vm.prank(bob);
        passport.revoke(researcherPassport);

        vm.prank(researcher);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotActive.selector, researcherPassport));
        market.acceptTask(taskId, researcherPassport);
    }

    function test_buyerCanReclaimEscrowAfterDeadline() public {
        uint256 taskId = _postTask();

        vm.prank(orchestrator);
        vm.expectRevert(abi.encodeWithSelector(AgentMarket.DeadlineNotPassed.selector, taskId));
        market.cancelTask(taskId);

        vm.warp(deadline + 1);
        uint256 balBefore = orchestrator.balance;
        vm.prank(orchestrator);
        market.cancelTask(taskId);
        assertEq(orchestrator.balance, balBefore + 1 ether);
    }

    function test_onlyBuyerCanApprove() public {
        uint256 taskId = _postTask();
        vm.prank(researcher);
        market.acceptTask(taskId, researcherPassport);
        vm.prank(researcher);
        market.deliverTask(taskId, keccak256("work"));

        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(AgentMarket.NotBuyer.selector, taskId, rando));
        market.approveTask(taskId);
    }
}
