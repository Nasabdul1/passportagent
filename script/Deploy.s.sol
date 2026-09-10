// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentPassport} from "../src/AgentPassport.sol";
import {TravelBooking} from "../src/demo/TravelBooking.sol";

/// @notice Deploys the Passport protocol + demo to Robinhood Chain.
///         Testnet: forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
///         Mainnet: forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --verify
contract Deploy is Script {
    uint256 internal constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;

    error NotRobinhoodChain(uint256 chainId);

    function run() external {
        // Passport is built for Robinhood Chain — refuse to deploy anywhere else.
        if (block.chainid != ROBINHOOD_MAINNET_CHAIN_ID && block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) {
            revert NotRobinhoodChain(block.chainid);
        }

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        AgentPassport passport = new AgentPassport();
        TravelBooking booking = new TravelBooking(address(passport));

        vm.stopBroadcast();

        console2.log("Chain ID:", block.chainid);
        console2.log("AgentPassport:", address(passport));
        console2.log("TravelBooking:", address(booking));
    }
}
