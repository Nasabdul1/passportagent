# passport-verify

Web2 middleware for the **Agent Passport** protocol on Robinhood Chain. Let AI agents use your API with cryptographic identity and on-chain authority — no accounts, no API keys, no user database.

An agent calls your endpoint with a signed request + its passport id. You verify:

1. **Signature** — proves the caller controls the agent's wallet, and binds the exact payload (tamper one byte and it fails)
2. **Identity** — `agentOf(passportId)` on-chain must equal the signer
3. **Authority** — `verifyAuthority(passportId, action, amount)` on-chain: permission, spend limits, validity window, revocation — all enforced by the passport contract

All checks are read-only RPC calls (~100ms). You never send a transaction. Revoking a passport on-chain instantly cuts off the agent at every API using this middleware.

## Install

```bash
npm install passport-verify viem
```

## Server side (Express)

```js
import { createPassportVerifier, passportGate, ROBINHOOD_TESTNET } from "passport-verify";

const verifier = createPassportVerifier({
  passportAddress: "0xYourDeployedAgentPassport",
  chainId: ROBINHOOD_TESTNET, // or ROBINHOOD_MAINNET / custom rpcUrl
});

app.post(
  "/book",
  passportGate(verifier, { action: "BOOK_TRAVEL", getAmountWei: (req) => req.body.amountWei }),
  (req, res) => {
    // req.agent    — verified agent wallet address
    // req.passportId — the passport presented
    res.json({ status: "booked" });
  },
);
```

Denied requests get `403 { status: "denied", reason }` before touching your handler.

## Agent side

```js
import { privateKeyToAccount } from "viem/accounts";
import { signAgentRequest } from "passport-verify";

const account = privateKeyToAccount(process.env.AGENT_KEY);

const envelope = await signAgentRequest({
  account,
  passportId: 5,
  action: "BOOK_TRAVEL",
  amountWei: 1_000_000_000_000_000n, // 0.001 ETH
  fields: { destination: "LISBON" },  // your service's payload fields
});

await fetch("https://api.example.com/book", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(envelope),
});
```

Or send it in headers: `x-passport-request: <json fields>` + `x-passport-signature: 0x…`.

## Framework-free usage

```js
const result = await verifier.verify(req.body, { action: "BOOK_TRAVEL" });
if (!result.ok) return res.status(403).json({ status: "denied", reason: result.reason });
// result.agent is the verified agent address
```

## What the verifier enforces

| Check | Failure reason |
|---|---|
| Signature present and well-formed | `missing signature` / `malformed signature` |
| Request not expired (`deadline` field) | `request expired` |
| Nonce never seen before | `nonce already used (replay)` |
| Signed action matches what the service expects | `action mismatch` |
| Signed amount matches what the service charges | `amount mismatch` |
| Signer is the passport's agent | `signer … is not passport agent …` |
| Passport active, in validity window, has permission, within per-tx/daily limits, not revoked | `passport does not authorize …` |

## Note on settlement

Verification is read-only — it answers "may this agent do this *right now*?" but does not record spend on-chain. For paid actions, pair this with on-chain settlement (e.g. an escrow contract like `AgentMarket`, or a relayer that calls `verifyAndSpend`) so the passport's daily limits and audit trail stay accurate.
