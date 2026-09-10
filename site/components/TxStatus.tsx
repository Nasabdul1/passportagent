"use client";

import { explorerTx } from "@/lib/config";
import { useSelectedChain } from "@/lib/chain-context";

export function TxStatus({
  hash,
  error,
  confirming,
  confirmed,
  txChainId,
}: {
  hash?: `0x${string}`;
  error?: string | null;
  confirming?: boolean;
  confirmed?: boolean;
  txChainId?: number;
}) {
  const { chainId } = useSelectedChain();
  return (
    <div className="space-y-1" role="status" aria-live="polite">
      {error && <p className="font-mono text-[11px] text-blood">{error}</p>}
      {confirming && (
        <p className="font-mono text-[11px] text-gold">confirming on-chain…</p>
      )}
      {confirmed && hash && (
        <p className="font-mono text-[11px] text-leaf">
          confirmed —{" "}
          <a href={explorerTx(txChainId ?? chainId, hash)} target="_blank" rel="noreferrer" className="underline hover:text-goldsoft">
            view tx
          </a>
        </p>
      )}
      {!confirmed && hash && !confirming && (
        <p className="font-mono text-[11px] text-dim">
          tx {hash.slice(0, 10)}…{" "}
          <a href={explorerTx(txChainId ?? chainId, hash)} target="_blank" rel="noreferrer" className="underline hover:text-gold">
            explorer
          </a>
        </p>
      )}
    </div>
  );
}
