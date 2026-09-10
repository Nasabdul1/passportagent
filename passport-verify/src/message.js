import { keccak256, toHex, isHex } from "viem";

/**
 * Canonical signed message: JSON with alphabetically sorted keys.
 * Both the agent (signing) and the service (verifying) must use this —
 * always build messages through these helpers, never by hand.
 */
export function canonicalMessage(fields) {
  const sorted = Object.fromEntries(
    Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
  );
  return JSON.stringify(sorted);
}

/**
 * Normalize an action identifier to bytes32.
 * Accepts a human string ("BOOK_TRAVEL") or a 0x-prefixed bytes32 hex.
 */
export function actionId(action) {
  if (isHex(action) && action.length === 66) return action;
  return keccak256(toHex(action));
}

/**
 * Agent side: build the signed request envelope for a service call.
 *
 * @param {object} opts
 * @param {`0x${string}`} opts.privateKey  agent wallet key
 * @param {number|bigint} opts.passportId
 * @param {string} opts.action             e.g. "BOOK_TRAVEL"
 * @param {bigint|number|string} [opts.amountWei]
 * @param {object} [opts.fields]           service-specific payload fields
 * @param {number} [opts.ttlSeconds]       request validity (default 300s)
 */
export async function signAgentRequest({ account, passportId, action, amountWei = 0n, fields = {}, ttlSeconds = 300 }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...fields,
    action: actionId(action),
    amountWei: amountWei.toString(),
    deadline: now + ttlSeconds,
    nonce: `${now}-${Math.random().toString(36).slice(2)}`,
    passportId: passportId.toString(),
  };
  const signature = await account.signMessage({ message: canonicalMessage(payload) });
  return { ...payload, signature };
}
