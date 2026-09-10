// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPassport} from "../IPassport.sol";

/// @title TravelBooking
/// @notice Demo consumer of the Passport protocol — the "other system" from the
///         TRAVEL-042 story. An agent presents a passport id; this contract verifies
///         identity (caller must be the passport's agent) and authority (permission,
///         per-transaction and daily spend limits, validity window, status) on-chain
///         before executing the booking. No API keys, no trust — verification.
contract TravelBooking {
    bytes32 public constant BOOK_TRAVEL = keccak256("BOOK_TRAVEL");

    struct Booking {
        uint256 passportId;
        address agent;
        string destination;
        uint256 cost;
        uint64 bookedAt;
    }

    IPassport public immutable passport;

    uint256 public bookingCount;
    mapping(uint256 => Booking) public bookings;

    event TripBooked(
        uint256 indexed bookingId, uint256 indexed passportId, address indexed agent, string destination, uint256 cost
    );

    error NotPassportAgent(uint256 passportId, address caller);
    error ZeroCost();

    constructor(address passport_) {
        passport = IPassport(passport_);
    }

    /// @notice Book a trip. The caller must be the agent named on `passportId`, and the
    ///         passport must currently authorize BOOK_TRAVEL for `msg.value` wei.
    function bookTrip(uint256 passportId, string calldata destination) external payable returns (uint256 bookingId) {
        if (msg.value == 0) revert ZeroCost();

        // Identity: the caller must be the agent this passport was issued to.
        if (passport.agentOf(passportId) != msg.sender) {
            revert NotPassportAgent(passportId, msg.sender);
        }

        // Authority: permission, spend limits, validity window and status are all
        // enforced inside the passport. This also records the action on-chain.
        passport.verifyAndSpend(passportId, BOOK_TRAVEL, msg.value);

        bookingId = ++bookingCount;
        bookings[bookingId] = Booking({
            passportId: passportId,
            agent: msg.sender,
            destination: destination,
            cost: msg.value,
            bookedAt: uint64(block.timestamp)
        });

        emit TripBooked(bookingId, passportId, msg.sender, destination, msg.value);
    }

    receive() external payable {}
}
