# PASSPORT

Passport is an identity and authority layer for autonomous agents on Robinhood Chain mainnet. A Passport binds an agent wallet to a controller, purpose, permission set, validity window, delegation tree, and ETH-denominated spending limits.

**Live app:** [passport-agent-identity.abdulnasirudeen0.chatgpt.site](https://passport-agent-identity.abdulnasirudeen0.chatgpt.site)

## What is included

- **AgentPassportV2:** ERC-721 agent identities, permanent revocation, bounded delegation, enumerable permissions, per-transaction and daily limits, and approved spending consumers.
- **AgentMarketV2:** escrowed agent work with deadlines, delivery review, cancellation, disputes, arbitrator settlement, concessions, and pull-based withdrawals.
- **Agent Studio:** encrypted model-provider credentials, saved agent configurations, signed one-time model runs, chain reads, and OpenAI fine-tuning job submission.
- **Trade Studio:** Passport-gated native-ETH quotes and reviewed Uniswap v2/v3/v4 swaps on Robinhood Chain.
- **Migration assistant:** explicit V1-to-V2 replacement while preserving parent relationships and refusing inactive legacy identities.
- **`passport-verify`:** reusable signed-request verification middleware for Node services.
- **Mainnet lifecycle tests:** payout, withdrawal, timeout refund, dispute settlement, permanent revocation, consumer approval, and delegation-limit coverage.

## Mainnet deployments

Robinhood Chain ID: `4663`

| Contract | Address |
| --- | --- |
| AgentPassportV2 | [`0x16366db87c756f7ba2d1947bcaa6c138032e0aa6`](https://robinhoodchain.blockscout.com/address/0x16366db87c756f7ba2d1947bcaa6c138032e0aa6) |
| AgentMarketV2 | [`0x4c8075291dad60e117240e8c0aa3c0a02278baef`](https://robinhoodchain.blockscout.com/address/0x4c8075291dad60e117240e8c0aa3c0a02278baef) |
| Legacy AgentPassport V1 | [`0x44b6D2C7490c8E6060610F983c529c3c3910036f`](https://robinhoodchain.blockscout.com/address/0x44b6D2C7490c8E6060610F983c529c3c3910036f) |
| Legacy TravelBooking | [`0xE87a1Bd908935014fBDD07DEd3B9217860F41E8F`](https://robinhoodchain.blockscout.com/address/0xE87a1Bd908935014fBDD07DEd3B9217860F41E8F) |

The current Uniswap Trading API integration pins swaps to Robinhood Chain Router 2.1.1 at `0x8876789976decbfcbbbe364623c63652db8c0904`.

## Repository layout

```text
src/                  Solidity contracts and interfaces
test/                 Foundry unit, security, and fork tests
script/               Mainnet deployment scripts
deployments/          Published deployment addresses and receipts
site/                 Vinext/React application and API routes
passport-verify/      Signed Web2 verification middleware
```

## Contracts

Install Foundry, clone with submodules, then run:

```bash
git clone --recurse-submodules https://github.com/Nasabdul1/passportagent.git
cd passportagent
forge build
forge test
```

Run the deployed-bytecode lifecycle tests against a local mainnet fork:

```bash
forge test --match-contract LiveV2ForkTest \
  --fork-url https://rpc.mainnet.chain.robinhood.com -vv
```

Deployment requires a funded Robinhood Chain mainnet key in a local `.env` file:

```bash
forge script script/DeployV2.s.sol \
  --rpc-url robinhood --broadcast
```

## Website

```bash
cd site
npm ci
npm run dev
```

Production needs a D1 database binding and a 32-byte `AGENT_VAULT_KEY` encoded as 64 hexadecimal characters. Provider credentials remain user-supplied and are encrypted before storage.

Validation:

```bash
npx tsc --noEmit
node --import tsx --test scripts/integration.test.ts
npm run build
```

## Authority model

`verifyAuthority` is read-only. Integrations that account for spending must use `verifyAndSpend` from an explicitly approved consumer. The market performs authorization and settlement atomically. Trade Studio currently records the Passport spend and submits the Uniswap swap as separate transactions, so a failed swap still leaves the amount recorded.

Never commit wallet private keys, model-provider keys, Uniswap API keys, or the production vault key.
