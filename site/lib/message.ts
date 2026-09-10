import { isHex, keccak256, toHex } from "viem";

/**
 * Canonical signed message: JSON with alphabetically sorted keys.
 * Mirrors passport-verify/src/message.js exactly — the agent (signing)
 * and this site (verifying) must both build messages through this shape.
 */
export function canonicalMessage(fields: Record<string, unknown>): string {
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
export function actionId(action: string): `0x${string}` {
  if (isHex(action) && action.length === 66) return action;
  return keccak256(toHex(action));
}
