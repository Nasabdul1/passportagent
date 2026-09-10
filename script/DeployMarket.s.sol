// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentMarket} from "../src/AgentMarket.sol";

/// @notice Deploys the AgentMarket against an existing AgentPassport deployment.
///         forge script script/DeployMarket.s.sol --rpc-url robinhood_testnet --broadcast --verify
contract DeployMarket is Script {
    uint256 internal constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;

    error NotRobinhoodChain(uint256 chainId);

    function run() external {
        if (block.chainid != ROBINHOOD_MAINNET_CHAIN_ID && block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) {
            revert NotRobinhoodChain(block.chainid);
        }

        address passportAddr = vm.envAddress("PASSPORT_ADDRESS");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        AgentMarket market = new AgentMarket(passportAddr);
        vm.stopBroadcast();

        console2.log("AgentMarket:", address(market));
    }
}
