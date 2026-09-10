// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {AgentPassportV2} from "../src/AgentPassportV2.sol";
import {AgentMarketV2} from "../src/AgentMarketV2.sol";
/// Run against the deployed mainnet bytecode with --fork-url. No broadcast occurs.
contract LiveV2ForkTest is Test {
 AgentPassportV2 p=AgentPassportV2(0x16366dB87c756f7ba2d1947bcAA6c138032E0AA6);
 AgentMarketV2 m=AgentMarketV2(0x4c8075291daD60E117240E8c0aA3c0A02278bAEF);
 address buyer; address worker; address arb; uint256 bid; uint256 wid;
 function setUp() public {if(block.chainid!=4663){vm.skip(true);return;}buyer=makeAddr("fork buyer");worker=makeAddr("fork worker");arb=makeAddr("fork arbitrator");vm.deal(buyer,1 ether);bytes32[] memory a=new bytes32[](1);a[0]=keccak256("HIRE_AGENTS");vm.startPrank(buyer);bid=p.mint(buyer,"fork buyer",uint64(block.timestamp),uint64(block.timestamp+30 days),0.01 ether,0.1 ether,a);p.setConsumer(bid,address(m),a[0],true);vm.stopPrank();a[0]=keccak256("PERFORM_WORK");vm.startPrank(worker);wid=p.mint(worker,"fork worker",uint64(block.timestamp),uint64(block.timestamp+30 days),0.01 ether,0.1 ether,a);p.setConsumer(wid,address(m),a[0],true);vm.stopPrank();assertEq(address(m.passport()),address(p));}
 function task() internal returns(uint256 id){vm.prank(buyer);id=m.postTask{value:0.000001 ether}(bid,"E2E fork task",uint64(block.timestamp+1 days),arb);vm.prank(worker);m.acceptTask(id,wid);}
 function testDeployedApprovalPayoutAndWithdrawal() public {uint256 id=task();vm.prank(worker);m.deliverTask(id,keccak256("completed result"));vm.prank(buyer);m.approveTask(id);assertEq(m.claimable(worker),0.000001 ether);vm.prank(worker);m.withdraw(payable(worker));assertEq(worker.balance,0.000001 ether);assertEq(m.claimable(worker),0);}
 function testDeployedDisputeSplitAndBothWithdrawals() public {uint256 id=task();vm.prank(worker);m.deliverTask(id,keccak256("result"));vm.prank(buyer);m.dispute(id,keccak256("evidence"));vm.prank(arb);m.resolve(id,0.0000004 ether);vm.prank(worker);m.withdraw(payable(worker));vm.prank(buyer);m.withdraw(payable(buyer));assertEq(worker.balance,0.0000004 ether);assertEq(buyer.balance,1 ether-0.0000004 ether);}
 function testDeployedTimeoutRefund() public {uint256 id=task();vm.warp(block.timestamp+1 days);vm.prank(buyer);m.cancelTask(id);vm.prank(buyer);m.withdraw(payable(buyer));assertEq(buyer.balance,1 ether);}
 function testDeployedRevocationAndConsumerEnforced() public {vm.prank(buyer);p.setConsumer(bid,address(m),keccak256("HIRE_AGENTS"),false);vm.prank(buyer);vm.expectRevert();m.postTask{value:1}(bid,"blocked",uint64(block.timestamp+1 days),arb);vm.prank(buyer);p.revoke(bid);assertFalse(p.isActive(bid));vm.prank(buyer);vm.expectRevert();p.reactivate(bid);}
}
