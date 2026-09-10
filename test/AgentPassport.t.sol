// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPassport} from "../src/AgentPassport.sol";
import {IPassport} from "../src/IPassport.sol";

contract AgentPassportTest is Test {
    AgentPassport internal passport;

    address internal controller = makeAddr("controller");
    address internal agent = makeAddr("agent");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant BOOK_TRAVEL = keccak256("BOOK_TRAVEL");
    bytes32 internal constant WITHDRAW = keccak256("WITHDRAW");

    uint64 internal validFrom;
    uint64 internal validUntil;

    function setUp() public {
        passport = new AgentPassport();
        validFrom = uint64(block.timestamp);
        validUntil = uint64(block.timestamp + 365 days);
    }

    function _actions() internal pure returns (bytes32[] memory a) {
        a = new bytes32[](2);
        a[0] = BOOK_TRAVEL;
        a[1] = keccak256("SEARCH_FLIGHTS");
    }

    function _mintDefault() internal returns (uint256) {
        vm.prank(controller);
        return passport.mint(
            agent, "Corporate travel management", validFrom, validUntil, 2_000 ether, 10_000 ether, _actions()
        );
    }

    // -----------------------------------------------------------------
    // Minting & identity
    // -----------------------------------------------------------------

    function test_mint_bindsIdentityAndAuthority() public {
        uint256 id = _mintDefault();

        assertEq(passport.ownerOf(id), controller);
        IPassport.PassportInfo memory info = passport.getPassport(id);
        assertEq(info.agent, agent);
        assertEq(info.controller, controller);
        assertEq(info.purpose, "Corporate travel management");
        assertEq(info.parentId, 0);
        assertEq(info.depth, 0);
        assertEq(info.validFrom, validFrom);
        assertEq(info.validUntil, validUntil);
        assertEq(info.perTxLimit, 2_000 ether);
        assertEq(info.dailyLimit, 10_000 ether);
        assertEq(uint8(info.status), uint8(IPassport.Status.Active));
        assertTrue(passport.hasPermission(id, BOOK_TRAVEL));
        assertFalse(passport.hasPermission(id, WITHDRAW));
        assertTrue(passport.isActive(id));
    }

    function test_mint_revertsOnBadValidityWindow() public {
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.InvalidValidityWindow.selector, validUntil, validFrom));
        passport.mint(agent, "bad", validUntil, validFrom, 0, 0, _actions());
    }

    function test_tokenIdsIncrementFromOne() public {
        uint256 first = _mintDefault();
        vm.prank(controller);
        uint256 second = passport.mint(agent, "second", validFrom, validUntil, 0, 0, _actions());
        assertEq(first, 1);
        assertEq(second, 2);
    }

    // -----------------------------------------------------------------
    // verifyAuthority / verifyAndSpend
    // -----------------------------------------------------------------

    function test_verifyAuthority_success() public {
        uint256 id = _mintDefault();
        assertTrue(passport.verifyAuthority(id, BOOK_TRAVEL, 1_500 ether));
    }

    function test_verifyAndSpend_recordsSpendAndHistory() public {
        uint256 id = _mintDefault();

        passport.verifyAndSpend(id, BOOK_TRAVEL, 1_000 ether);
        assertEq(passport.spentToday(id), 1_000 ether);

        passport.verifyAndSpend(id, BOOK_TRAVEL, 500 ether);
        assertEq(passport.spentToday(id), 1_500 ether);

        IPassport.PassportInfo memory info = passport.getPassport(id);
        assertEq(info.actionCount, 2);
        assertTrue(info.lastActionHash != bytes32(0));
    }

    function test_verifyAndSpend_revertsWithoutPermission() public {
        uint256 id = _mintDefault();
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.PermissionDenied.selector, id, WITHDRAW));
        passport.verifyAndSpend(id, WITHDRAW, 1 ether);
    }

    function test_verifyAndSpend_revertsOverPerTxLimit() public {
        uint256 id = _mintDefault();
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.ExceedsPerTxLimit.selector, id, 2_001 ether, 2_000 ether));
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_001 ether);
    }

    function test_verifyAndSpend_enforcesDailyLimitAcrossCalls() public {
        uint256 id = _mintDefault();

        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether);
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether);
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether);
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether);
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether); // 10,000 total — at the cap

        vm.expectRevert(
            abi.encodeWithSelector(AgentPassport.ExceedsDailyLimit.selector, id, 10_001 ether, 10_000 ether)
        );
        passport.verifyAndSpend(id, BOOK_TRAVEL, 1 ether);
    }

    function test_dailyLimit_resetsNextUtcDay() public {
        uint256 id = _mintDefault();
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether);
        assertEq(passport.spentToday(id), 2_000 ether);

        vm.warp(block.timestamp + 1 days + 1);
        assertEq(passport.spentToday(id), 0);
        passport.verifyAndSpend(id, BOOK_TRAVEL, 2_000 ether);
        assertEq(passport.spentToday(id), 2_000 ether);
    }

    // -----------------------------------------------------------------
    // Validity window
    // -----------------------------------------------------------------

    function test_verifyAndSpend_revertsBeforeValidFrom() public {
        vm.prank(controller);
        uint256 id = passport.mint(
            agent, "future", uint64(block.timestamp + 1 days), uint64(block.timestamp + 30 days), 0, 0, _actions()
        );
        assertFalse(passport.isActive(id));
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotYetValid.selector, id));
        passport.verifyAndSpend(id, BOOK_TRAVEL, 0);
    }

    function test_verifyAndSpend_revertsAfterExpiry() public {
        uint256 id = _mintDefault();
        vm.warp(validUntil + 1);
        assertFalse(passport.isActive(id));
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.Expired.selector, id));
        passport.verifyAndSpend(id, BOOK_TRAVEL, 0);
    }

    // -----------------------------------------------------------------
    // Status management
    // -----------------------------------------------------------------

    function test_suspend_blocksVerification_reactivateRestores() public {
        uint256 id = _mintDefault();

        vm.prank(controller);
        passport.suspend(id);
        assertFalse(passport.isActive(id));
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotActive.selector, id));
        passport.verifyAndSpend(id, BOOK_TRAVEL, 0);

        vm.prank(controller);
        passport.reactivate(id);
        assertTrue(passport.isActive(id));
        passport.verifyAndSpend(id, BOOK_TRAVEL, 1 ether);
    }

    function test_revoke_isTerminal() public {
        uint256 id = _mintDefault();

        vm.prank(controller);
        passport.revoke(id);
        assertFalse(passport.isActive(id));

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.AlreadyRevoked.selector, id));
        passport.reactivate(id);
    }

    function test_onlyControllerCanManage() public {
        uint256 id = _mintDefault();

        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotPassportController.selector, id, stranger));
        passport.suspend(id);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotPassportController.selector, id, stranger));
        passport.setPermission(id, WITHDRAW, true);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotPassportController.selector, id, stranger));
        passport.revoke(id);
        vm.stopPrank();
    }

    function test_setPermission_grantAndDeny() public {
        uint256 id = _mintDefault();

        vm.prank(controller);
        passport.setPermission(id, WITHDRAW, true);
        assertTrue(passport.verifyAuthority(id, WITHDRAW, 0));

        vm.prank(controller);
        passport.setPermission(id, BOOK_TRAVEL, false);
        assertFalse(passport.verifyAuthority(id, BOOK_TRAVEL, 0));
    }

    // -----------------------------------------------------------------
    // Delegation
    // -----------------------------------------------------------------

    function _delegateTo(address childAgent, uint256 perTx, uint256 daily, uint64 expiry)
        internal
        returns (uint256 parentId, uint256 childId)
    {
        parentId = _mintDefault();
        vm.prank(controller);
        childId = passport.delegate(parentId, childAgent, "sub-agent", _actions(), perTx, daily, expiry);
    }

    function test_delegate_createsBoundedChild() public {
        address childAgent = makeAddr("childAgent");
        (uint256 parentId, uint256 childId) = _delegateTo(childAgent, 500 ether, 1_000 ether, validUntil);

        IPassport.PassportInfo memory child = passport.getPassport(childId);
        assertEq(child.parentId, parentId);
        assertEq(child.depth, 1);
        assertEq(child.agent, childAgent);
        assertEq(child.controller, controller);
        assertEq(child.perTxLimit, 500 ether);
        assertTrue(passport.isActive(childId));

        uint256[] memory children = passport.getChildren(parentId);
        assertEq(children.length, 1);
        assertEq(children[0], childId);
    }

    function test_delegate_revertsOnNonSubsetPermission() public {
        uint256 parentId = _mintDefault();
        bytes32[] memory bad = new bytes32[](1);
        bad[0] = WITHDRAW;

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.PermissionNotSubset.selector, parentId, WITHDRAW));
        passport.delegate(parentId, makeAddr("c"), "x", bad, 0, 0, validUntil);
    }

    function test_delegate_revertsWhenLimitsExceedParent() public {
        uint256 parentId = _mintDefault();

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.LimitsExceedParent.selector, parentId));
        passport.delegate(parentId, makeAddr("c"), "x", _actions(), 3_000 ether, 1_000 ether, validUntil);

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.LimitsExceedParent.selector, parentId));
        passport.delegate(parentId, makeAddr("c"), "x", _actions(), 1_000 ether, 20_000 ether, validUntil);
    }

    function test_delegate_revertsWhenExpiryExceedsParent() public {
        uint256 parentId = _mintDefault();

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.ExpiryExceedsParent.selector, parentId));
        passport.delegate(parentId, makeAddr("c"), "x", _actions(), 1 ether, 1 ether, validUntil + 1);
    }

    function test_delegate_enforcesDepthCap() public {
        uint256 id = _mintDefault();
        bytes32[] memory actions = _actions();

        for (uint8 i = 0; i < 8; i++) {
            vm.prank(controller);
            id = passport.delegate(
                id, makeAddr(string.concat("d", vm.toString(i))), "x", actions, 1 ether, 1 ether, validUntil
            );
        }
        assertEq(passport.getPassport(id).depth, 8);

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.DelegationTooDeep.selector, id));
        passport.delegate(id, makeAddr("tooDeep"), "x", actions, 1 ether, 1 ether, validUntil);
    }

    function test_delegate_revertsWhenParentSuspended() public {
        uint256 parentId = _mintDefault();
        vm.prank(controller);
        passport.suspend(parentId);

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotActive.selector, parentId));
        passport.delegate(parentId, makeAddr("c"), "x", _actions(), 1 ether, 1 ether, validUntil);
    }

    function test_revoke_cascadesToDescendants() public {
        // controller -> agent -> agentB -> agentC
        (uint256 root, uint256 child) = _delegateTo(makeAddr("agentB"), 500 ether, 1_000 ether, validUntil);
        vm.prank(controller);
        uint256 grandchild =
            passport.delegate(child, makeAddr("agentC"), "leaf", _actions(), 100 ether, 200 ether, validUntil);

        vm.prank(controller);
        passport.revoke(root);

        assertFalse(passport.isActive(root));
        assertFalse(passport.isActive(child));
        assertFalse(passport.isActive(grandchild));

        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotActive.selector, grandchild));
        passport.verifyAndSpend(grandchild, BOOK_TRAVEL, 1 ether);
    }

    // -----------------------------------------------------------------
    // Ownership transfer
    // -----------------------------------------------------------------

    function test_transfer_movesControl() public {
        uint256 id = _mintDefault();
        address newController = makeAddr("newController");

        vm.prank(controller);
        passport.transferFrom(controller, newController, id);

        assertEq(passport.getPassport(id).controller, newController);

        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotPassportController.selector, id, controller));
        passport.suspend(id);

        vm.prank(newController);
        passport.suspend(id);
        assertFalse(passport.isActive(id));
    }
}
