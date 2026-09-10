// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {AgentPassportV2} from "../src/AgentPassportV2.sol";
import {AgentMarketV2} from "../src/AgentMarketV2.sol";
contract AgentMarketV2Test is Test {
    AgentPassportV2 p; AgentMarketV2 m;
    address buyer=makeAddr("buyer"); address worker=makeAddr("worker"); address arb=makeAddr("arbitrator");
    uint256 buyerId; uint256 workerId; uint64 deadline;
    function setUp() public {
        p=new AgentPassportV2(); m=new AgentMarketV2(address(p)); vm.deal(buyer,10 ether);
        bytes32[] memory actions=new bytes32[](1); actions[0]=keccak256("HIRE_AGENTS");
        buyerId=p.mint(buyer,"buyer",uint64(block.timestamp),uint64(block.timestamp+30 days),2 ether,10 ether,actions);
        p.setConsumer(buyerId,address(m),actions[0],true);
        actions[0]=keccak256("PERFORM_WORK");
        workerId=p.mint(worker,"worker",uint64(block.timestamp),uint64(block.timestamp+30 days),0,0,actions);
        p.setConsumer(workerId,address(m),actions[0],true); deadline=uint64(block.timestamp+1 days);
    }
    function post() internal returns(uint256 id){vm.prank(buyer);return m.postTask{value:1 ether}(buyerId,"Research report",deadline,arb);}
    function deliver() internal returns(uint256 id){id=post();vm.prank(worker);m.acceptTask(id,workerId);vm.prank(worker);m.deliverTask(id,keccak256("report"));}
    function test_fullFlowAndNoDoubleWithdrawal() public {uint256 id=deliver();vm.prank(buyer);m.approveTask(id);assertEq(m.claimable(worker),1 ether);vm.prank(worker);m.withdraw(payable(worker));assertEq(worker.balance,1 ether);vm.prank(worker);vm.expectRevert();m.withdraw(payable(worker));}
    function test_acceptedTimeoutRefund() public {uint256 id=post();vm.prank(worker);m.acceptTask(id,workerId);vm.prank(buyer);vm.expectRevert();m.cancelTask(id);vm.warp(deadline);vm.prank(buyer);m.cancelTask(id);assertEq(m.claimable(buyer),1 ether);}
    function test_reviewTimeoutPaysWorker() public {uint256 id=deliver();vm.warp(block.timestamp+3 days);m.claimAfterReview(id);assertEq(m.claimable(worker),1 ether);}
    function test_disputeResolutionAndReplayRejection() public {uint256 id=deliver();vm.prank(buyer);m.dispute(id,keccak256("evidence"));vm.expectRevert();m.claimAfterReview(id);vm.prank(worker);vm.expectRevert();m.resolve(id,1 ether);vm.prank(arb);m.resolve(id,0.4 ether);assertEq(m.claimable(worker),0.4 ether);assertEq(m.claimable(buyer),0.6 ether);vm.prank(arb);vm.expectRevert();m.resolve(id,1 ether);}
    function test_expiredAcceptanceAndDeliveryRejected() public {uint256 id=post();vm.warp(deadline);vm.prank(worker);vm.expectRevert();m.acceptTask(id,workerId);}
    function test_invalidTaskCannotBeAccepted() public {vm.prank(worker);vm.expectRevert();m.acceptTask(0,workerId);}
    function test_noConsumerApprovalNoEscrow() public {p.setConsumer(buyerId,address(m),keccak256("HIRE_AGENTS"),false);vm.prank(buyer);vm.expectRevert();m.postTask{value:1 ether}(buyerId,"work",deadline,arb);assertEq(address(m).balance,0);}
    function test_disputeCanBeConceded() public {uint256 id=deliver();vm.prank(buyer);m.dispute(id,keccak256("evidence"));vm.prank(worker);m.concede(id);assertEq(m.claimable(buyer),1 ether);}
}
