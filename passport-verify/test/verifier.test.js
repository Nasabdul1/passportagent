import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { createPassportVerifier } from "../src/verifier.js";
import { signAgentRequest, actionId, canonicalMessage } from "../src/message.js";

const AGENT_KEY = "0x812a94df8ffe4c0214d95a14ad409b3eea3d50d0fd8a31b5a9449c51188febcd";
const STRANGER_KEY = "0x3364e5477013ddab04684f00487d331aace81e2671acc72d5345c97bc4d48bff";
const agent = privateKeyToAccount(AGENT_KEY);
const stranger = privateKeyToAccount(STRANGER_KEY);

const mockClient = ({ agentAddress, authorized = true }) => ({
  readContract: async ({ functionName }) =>
    functionName === "agentOf" ? agentAddress : authorized,
});

const makeVerifier = (opts) =>
  createPassportVerifier({
    passportAddress: "0xa538a6d3e9caeb6c47deef4dd3c53d5507d8879d",
    client: mockClient({ agentAddress: agent.address, ...opts }),
  });

const validRequest = (over = {}) =>
  signAgentRequest({
    account: agent, passportId: 5, action: "BOOK_TRAVEL", amountWei: 1000n,
    fields: { destination: "LISBON" }, ...over,
  });

test("valid signed request passes", async () => {
  const v = makeVerifier();
  const res = await v.verify(await validRequest(), { action: "BOOK_TRAVEL" });
  assert.equal(res.ok, true);
  assert.equal(res.agent, agent.address);
});

test("stranger signing with someone else's passport is denied", async () => {
  const v = makeVerifier();
  const req = await signAgentRequest({ account: stranger, passportId: 5, action: "BOOK_TRAVEL" });
  const res = await v.verify(req, { action: "BOOK_TRAVEL" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /is not passport agent/);
});

test("unauthorized action is denied by the passport", async () => {
  const v = makeVerifier({ authorized: false });
  const res = await v.verify(await validRequest(), { action: "BOOK_TRAVEL" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /does not authorize/);
});

test("replayed nonce is denied", async () => {
  const v = makeVerifier();
  const req = await validRequest();
  assert.equal((await v.verify(req, { action: "BOOK_TRAVEL" })).ok, true);
  const replay = await v.verify(req, { action: "BOOK_TRAVEL" });
  assert.equal(replay.ok, false);
  assert.match(replay.reason, /replay/);
});

test("expired request is denied", async () => {
  const v = makeVerifier();
  const res = await v.verify(await validRequest({ ttlSeconds: -10 }), { action: "BOOK_TRAVEL" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /expired/);
});

test("tampering with the payload after signing is denied", async () => {
  const v = makeVerifier();
  const req = await validRequest();
  req.amountWei = "999999999999"; // inflated after signing
  const res = await v.verify(req, { action: "BOOK_TRAVEL" });
  assert.equal(res.ok, false);
});

test("action mismatch between service and signature is denied", async () => {
  const v = makeVerifier();
  const res = await v.verify(await validRequest(), { action: "WITHDRAW_FUNDS" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /action mismatch/);
});

test("missing signature is denied", async () => {
  const v = makeVerifier();
  const req = await validRequest();
  delete req.signature;
  const res = await v.verify(req, { action: "BOOK_TRAVEL" });
  assert.equal(res.ok, false);
  assert.match(res.reason, /signature/);
});

test("canonicalMessage is key-order independent", () => {
  assert.equal(
    canonicalMessage({ b: 2, a: 1 }),
    canonicalMessage({ a: 1, b: 2 }),
  );
});

test("actionId hashes strings and passes bytes32 through", () => {
  assert.equal(actionId("BOOK_TRAVEL").length, 66);
  const raw = "0x5fa9e2691b3dbd669ccf6b3d67fe6a59bfb4604769f11d78d6477c5ad42d3c03";
  assert.equal(actionId(raw), raw);
});
