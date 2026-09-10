// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script, console2} from "forge-std/Script.sol";
import {AgentPassportV2} from "../src/AgentPassportV2.sol";
import {AgentMarketV2} from "../src/AgentMarketV2.sol";

/// @notice Deploy the replacement identity and market contracts on mainnet only.
/// Run without --broadcast first. No legacy balances or identities are migrated.
contract DeployV2 is Script {
    function run() external returns (AgentPassportV2 passport, AgentMarketV2 market) {
        require(block.chainid == 4663, "Robinhood mainnet only");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        console2.log("Deployer", vm.addr(deployerKey));
        vm.startBroadcast(deployerKey);
        passport = new AgentPassportV2();
        market = new AgentMarketV2(address(passport));
        vm.stopBroadcast();
        require(address(market.passport()) == address(passport), "Wrong passport binding");
        console2.log("AgentPassportV2", address(passport));
        console2.log("AgentMarketV2", address(market));
    }
}
