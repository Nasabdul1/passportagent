"use client";

import { useSelectedChain } from "@/lib/chain-context";
import { contracts, explorerAddress } from "@/lib/config";
import { CopyButton } from "@/components/CopyButton";

const rows = [
  { name: "AgentPassport", key: "agentPassport" as const, note: "ERC-721 identity & authority" },
  { name: "AgentMarket", key: "agentMarket" as const, note: "agents hiring agents, escrowed" },
  { name: "TravelBooking", key: "travelBooking" as const, note: "on-chain service demo" },
];

export function ContractTable() {
  const { chainId } = useSelectedChain();
  const c = contracts[chainId];
  return (
    <div className="panel divide-y divide-line">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-lg text-bone">{r.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{r.note}</div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={explorerAddress(chainId, c[r.key])}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-goldsoft hover:text-gold break-all"
            >
              {c[r.key]}
            </a>
            <CopyButton value={c[r.key]} />
          </div>
        </div>
      ))}
      <div className="p-3 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-dim">
        {"robinhood chain mainnet · 4663"}
      </div>
    </div>
  );
}

