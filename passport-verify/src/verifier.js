import { createPublicClient, http, recoverMessageAddress } from "viem";
import { canonicalMessage, actionId } from "./message.js";

const PASSPORT_ABI = [
  {
    type: "function", name: "agentOf", stateMutability: "view",
    inputs: [{ name: "passportId", type: "uint256" }], outputs: [{ type: "address" }],
  },
  {
    type: "function", name: "verifyAuthority", stateMutability: "view",
    inputs: [
      { name: "passportId", type: "uint256" },
      { name: "action", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
];

const CHAINS = {
  4663: {
    id: 4663, name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  },
  46630: {
    id: 46630, name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  },
};

export const ROBINHOOD_MAINNET = 4663;
export const ROBINHOOD_TESTNET = 46630;

/**
 * Create a verifier for a deployed AgentPassport contract.
 *
 * @param {object} opts
 * @param {`0x${string}`} opts.passportAddress  AgentPassport contract address
 * @param {number} [opts.chainId]               4663 (mainnet) or 46630 (testnet, default)
 * @param {string} [opts.rpcUrl]                override the default public RPC
 * @param {object} [opts.client]                inject a viem public client (testing)
 * @param {number} [opts.maxNonceAgeSeconds]    nonce cache TTL (default 3600)
 */
export function createPassportVerifier({ passportAddress, chainId = ROBINHOOD_TESTNET, rpcUrl, client, maxNonceAgeSeconds = 3600 }) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`unsupported chainId ${chainId} (use 4663 or 46630)`);

  const publicClient = client ?? createPublicClient({
    chain,
    transport: http(rpcUrl ?? chain.rpcUrls.default.http[0]),
  });

  const usedNonces = new Map(); // nonce -> expiry timestamp (seconds)

  function sweepNonces(now) {
    for (const [nonce, expiry] of usedNonces) if (expiry < now) usedNonces.delete(nonce);
  }

  /**
   * Verify a signed agent request against its on-chain passport.
   *
   * @param {object} request  the full request envelope (fields + signature),
   *                          as produced by signAgentRequest
   * @param {object} check
   * @param {string} check.action               required action, e.g. "BOOK_TRAVEL"
   * @param {bigint|number|string} [check.amountWei]  required/expected amount (default: from request)
   * @returns {Promise<{ok: true, agent: `0x${string}`} | {ok: false, reason: string}>}
   */
  async function verify(request, { action, amountWei } = {}) {
    const { signature, ...fields } = request;
    if (!signature) return { ok: false, reason: "missing signature" };
    if (fields.passportId === undefined) return { ok: false, reason: "missing passportId" };

    // Web2 hygiene: expiry + replay protection.
    const now = Math.floor(Date.now() / 1000);
    if (!fields.deadline || now > Number(fields.deadline)) return { ok: false, reason: "request expired" };
    sweepNonces(now);
    if (!fields.nonce) return { ok: false, reason: "missing nonce" };
    if (usedNonces.has(fields.nonce)) return { ok: false, reason: "nonce already used (replay)" };

    // The action and amount a service checks must come from ITS OWN intent,
    // not blindly from the wire — but they must also match what was signed.
    const expectedAction = actionId(action);
    if (fields.action !== expectedAction) return { ok: false, reason: "action mismatch" };
    const amount = BigInt(amountWei ?? fields.amountWei ?? 0);
    if (fields.amountWei !== undefined && BigInt(fields.amountWei) !== amount)
      return { ok: false, reason: "amount mismatch" };

    // Check 1: signature must recover to the wallet that signed this exact payload.
    let signer;
    try {
      signer = await recoverMessageAddress({ message: canonicalMessage(fields), signature });
    } catch {
      return { ok: false, reason: "malformed signature" };
    }

    // Check 2: the signer must BE the agent named on the passport (identity).
    const passportId = BigInt(fields.passportId);
    let agent;
    try {
      agent = await publicClient.readContract({
        address: passportAddress, abi: PASSPORT_ABI, functionName: "agentOf", args: [passportId],
      });
    } catch {
      return { ok: false, reason: `passport ${passportId} not found` };
    }
    if (signer.toLowerCase() !== agent.toLowerCase())
      return { ok: false, reason: `signer ${signer} is not passport agent ${agent}` };

    // Check 3: the passport must currently authorize this action + amount (authority).
    const authorized = await publicClient.readContract({
      address: passportAddress, abi: PASSPORT_ABI, functionName: "verifyAuthority",
      args: [passportId, expectedAction, amount],
    });
    if (!authorized)
      return { ok: false, reason: `passport does not authorize action ${action} for amount ${amount}` };

    usedNonces.set(fields.nonce, now + maxNonceAgeSeconds);
    return { ok: true, agent };
  }

  return { verify };
}
