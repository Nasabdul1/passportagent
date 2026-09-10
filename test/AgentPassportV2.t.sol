// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {AgentPassportV2} from "../src/AgentPassportV2.sol";

contract AgentPassportV2Test is Test {
    AgentPassportV2 p;
    bytes32 constant ACTION = keccak256("WORK");
    address agent = address(0xA);
    address consumer = address(0xB);
    uint256 root;
    function setUp() public {
        p = new AgentPassportV2();
        bytes32[] memory actions = new bytes32[](1); actions[0] = ACTION;
        root = p.mint(agent, "root", uint64(block.timestamp), uint64(block.timestamp+30 days), 2 ether, 3 ether, actions);
        p.setConsumer(root, consumer, ACTION, true);
    }
    function child() internal returns(uint256 id) {
        bytes32[] memory actions = new bytes32[](1); actions[0] = ACTION;
        id = p.delegate(root, address(0xC), "child", actions, 2 ether, 3 ether, uint64(block.timestamp+1 days));
        p.setConsumer(id, consumer, ACTION, true);
    }
    function test_revokedCannotSuspendOrReactivate() public {
        p.revoke(root);
        vm.expectRevert(); p.suspend(root);
        vm.expectRevert(); p.reactivate(root);
        assertFalse(p.isActive(root));
    }
    function test_strangerCannotConsumeBudget() public {
        vm.prank(address(0xBAD)); vm.expectRevert(AgentPassportV2.UnauthorizedConsumer.selector);
        p.verifyAndSpend(root, ACTION, 1 ether);
        assertEq(p.spentToday(root), 0);
    }
    function test_approvalScopedToAction() public {
        vm.prank(consumer); vm.expectRevert(AgentPassportV2.UnauthorizedConsumer.selector);
        p.verifyAndSpend(root, keccak256("OTHER"), 0);
    }
    function test_transferInvalidatesApprovalEvenAfterReturn() public {
        p.transferFrom(address(this), address(0xD), root);
        vm.prank(address(0xD)); p.transferFrom(address(0xD), address(this), root);
        assertFalse(p.consumerAllowed(root, consumer, ACTION));
    }
    function test_childCannotRequestUnlimitedUnderBoundedParent() public {
        bytes32[] memory actions = new bytes32[](1); actions[0] = ACTION;
        vm.expectRevert(); p.delegate(root, agent, "bad", actions, 0, 0, uint64(block.timestamp+1 days));
    }
    function test_parentChangesImmediatelyConstrainChild() public {
        uint256 id = child();
        p.setLimits(root, 0.5 ether, 1 ether);
        assertFalse(p.verifyAuthority(id, ACTION, 1 ether));
        p.setPermission(root, ACTION, false);
        assertFalse(p.verifyAuthority(id, ACTION, 0));
        vm.expectRevert(); p.setPermission(id, ACTION, true);
        vm.expectRevert(); p.setLimits(id, 2 ether, 3 ether);
    }
    function test_childCannotBypassParentStatus() public {
        uint256 id = child(); p.suspend(root);
        assertFalse(p.isActive(id)); assertFalse(p.verifyAuthority(id, ACTION, 0));
        p.reactivate(root); assertTrue(p.isActive(id));
        p.revoke(root); assertFalse(p.isActive(id));
        vm.expectRevert(); p.reactivate(id);
    }
    function test_siblingSpendingSharesParentBudgetAndRollsBackOnFailure() public {
        uint256 a=child(); uint256 b=child();
        vm.prank(consumer); p.verifyAndSpend(a,ACTION,2 ether);
        assertEq(p.spentToday(root),2 ether);
        vm.prank(consumer); vm.expectRevert(); p.verifyAndSpend(b,ACTION,2 ether);
        assertEq(p.spentToday(b),0); assertEq(p.spentToday(root),2 ether);
        vm.warp(block.timestamp+1 days); assertEq(p.spentToday(root),0);
    }
    function testFuzz_noSpendBeyondParent(uint96 amount) public {
        uint256 id=child();
        amount=uint96(bound(amount,2 ether+1,100 ether));
        assertFalse(p.verifyAuthority(id,ACTION,amount));
        vm.prank(consumer); vm.expectRevert(); p.verifyAndSpend(id,ACTION,amount);
    }
    function test_permissionKeysEnumerableWithoutDuplicates() public {
        p.setPermission(root,ACTION,false); p.setPermission(root,ACTION,true);
        assertEq(p.permissionKeys(root).length,1);
    }
}
