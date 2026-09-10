// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPassport} from "../src/AgentPassport.sol";
import {TravelBooking} from "../src/demo/TravelBooking.sol";

/// @notice End-to-end: an agent presents its passport to a third-party system.
contract TravelBookingTest is Test {
    AgentPassport internal passport;
    TravelBooking internal booking;

    address internal acme = makeAddr("acme"); // the company controlling the passport
    address internal travel042 = makeAddr("travel042"); // the agent
    address internal subAgent = makeAddr("subAgent");
    address internal rando = makeAddr("rando");

    bytes32 internal constant BOOK_TRAVEL = keccak256("BOOK_TRAVEL");

    uint64 internal validFrom;
    uint64 internal validUntil;

    function setUp() public {
        passport = new AgentPassport();
        booking = new TravelBooking(address(passport));
        validFrom = uint64(block.timestamp);
        validUntil = uint64(block.timestamp + 365 days);

        vm.deal(travel042, 100 ether);
        vm.deal(subAgent, 100 ether);
        vm.deal(rando, 100 ether);
    }

    /// Mint the TRAVEL-042 passport: book travel allowed, $2k/tx, $10k/day.
    function _mintTravel042() internal returns (uint256 id) {
        bytes32[] memory actions = new bytes32[](1);
        actions[0] = BOOK_TRAVEL;
        vm.prank(acme);
        id = passport.mint(travel042, "Corporate travel management", validFrom, validUntil, 2 ether, 10 ether, actions);
    }

    function test_agentBooksTripWithinAuthority() public {
        uint256 id = _mintTravel042();

        vm.prank(travel042);
        uint256 bookingId = booking.bookTrip{value: 1.5 ether}(id, "LISBON");

        assertEq(bookingId, 1);
        (uint256 pid, address agent_, string memory dest, uint256 cost,) = booking.bookings(bookingId);
        assertEq(pid, id);
        assertEq(agent_, travel042);
        assertEq(dest, "LISBON");
        assertEq(cost, 1.5 ether);
        assertEq(address(booking).balance, 1.5 ether);
        assertEq(passport.spentToday(id), 1.5 ether);
        assertEq(passport.getPassport(id).actionCount, 1);
    }

    function test_revertsWhenCallerIsNotThePassportAgent() public {
        uint256 id = _mintTravel042();

        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(TravelBooking.NotPassportAgent.selector, id, rando));
        booking.bookTrip{value: 1 ether}(id, "LISBON");
    }

    function test_revertsOverPerTransactionLimit() public {
        uint256 id = _mintTravel042();

        vm.prank(travel042);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.ExceedsPerTxLimit.selector, id, 2.5 ether, 2 ether));
        booking.bookTrip{value: 2.5 ether}(id, "TOKYO");
    }

    function test_revertsWhenDailyLimitExhausted() public {
        uint256 id = _mintTravel042();

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(travel042);
            booking.bookTrip{value: 2 ether}(id, "NYC");
        }

        vm.prank(travel042);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.ExceedsDailyLimit.selector, id, 11 ether, 10 ether));
        booking.bookTrip{value: 1 ether}(id, "NYC");

        // The next UTC day the agent can book again.
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(travel042);
        booking.bookTrip{value: 2 ether}(id, "NYC");
        assertEq(passport.spentToday(id), 2 ether);
    }

    function test_revertsWhenActionNotPermitted() public {
        // Passport without BOOK_TRAVEL permission.
        bytes32[] memory actions = new bytes32[](1);
        actions[0] = keccak256("SEARCH_FLIGHTS");
        vm.prank(acme);
        uint256 id = passport.mint(travel042, "search only", validFrom, validUntil, 0, 0, actions);

        vm.prank(travel042);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.PermissionDenied.selector, id, BOOK_TRAVEL));
        booking.bookTrip{value: 1 ether}(id, "PARIS");
    }

    function test_revertsWhenPassportRevoked() public {
        uint256 id = _mintTravel042();

        vm.prank(acme);
        passport.revoke(id);

        vm.prank(travel042);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotActive.selector, id));
        booking.bookTrip{value: 1 ether}(id, "ROME");
    }

    function test_revertsWhenPassportExpired() public {
        uint256 id = _mintTravel042();
        vm.warp(validUntil + 1);

        vm.prank(travel042);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.Expired.selector, id));
        booking.bookTrip{value: 1 ether}(id, "ROME");
    }

    /// HUMAN -> TRAVEL-042 -> sub-agent: the sub-agent books within a narrower budget.
    function test_delegationChain_booksWithinNarrowerAuthority() public {
        uint256 parentId = _mintTravel042();

        bytes32[] memory actions = new bytes32[](1);
        actions[0] = BOOK_TRAVEL;
        vm.prank(acme);
        uint256 childId =
            passport.delegate(parentId, subAgent, "hotel-only sub-agent", actions, 0.5 ether, 1 ether, validUntil);

        vm.prank(subAgent);
        booking.bookTrip{value: 0.4 ether}(childId, "HOTEL");
        assertEq(passport.spentToday(childId), 0.4 ether);

        // 0.6 ether is within the parent's limits but above the child's per-tx cap.
        vm.prank(subAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.ExceedsPerTxLimit.selector, childId, 0.6 ether, 0.5 ether));
        booking.bookTrip{value: 0.6 ether}(childId, "HOTEL");

        // Revoking the parent kills the whole subtree.
        vm.prank(acme);
        passport.revoke(parentId);
        vm.prank(subAgent);
        vm.expectRevert(abi.encodeWithSelector(AgentPassport.NotActive.selector, childId));
        booking.bookTrip{value: 0.1 ether}(childId, "HOTEL");
    }
}
