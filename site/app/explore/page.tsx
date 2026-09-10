"use client";

import {useState,useEffect} from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatEther } from "viem";
import { useContracts } from "@/lib/hooks";
import { passportCount, fetchPassports, type PassportRecord } from "@/lib/passport";
import { PassportStatusBadge, shorten } from "@/components/Badges";
import { Identicon } from "@/components/Identicon";

function PassportCard({ p }: { p: PassportRecord }) {
  const expired = Number(p.validUntil) * 1000 < Date.now();
  return (
    <a
      href={`/passport/${p.id.toString()}`}
      className="group panel block overflow-hidden transition-colors hover:border-gold/60"
    >
      <div className="guilloche flex items-center justify-between border-b border-line px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
          № {p.id.toString().padStart(6, "0")}
        </span>
        {expired && p.status === 0 ? (
          <span className="inline-block border border-blood px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-blood">
            expired
          </span>
        ) : (
          <PassportStatusBadge status={p.status} />
        )}
      </div>
      <div className="flex gap-4 p-4">
        <div className="border border-line p-1">
          <Identicon address={p.agent} size={64} />
        </div>
        <div className="min-w-0 flex-1 space-y-2 font-mono text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-dim">agent</div>
            <div className="truncate text-bone">{p.agent}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-dim">purpose</div>
            <div className="truncate text-bone group-hover:text-gold transition-colors">
              {p.purpose || "—"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-dim">controller</div>
              <div className="text-dim">{shorten(p.controller)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-dim">expires</div>
              <div className={expired ? "text-blood" : "text-dim"}>
                {new Date(Number(p.validUntil) * 1000).toISOString().slice(0, 10)}
              </div>
            </div>
          </div>
          <div className="flex gap-4 text-[10px] text-dim">
            <span>per-tx {formatEther(p.perTxLimit)} ETH</span>
            <span>daily {formatEther(p.dailyLimit)} ETH</span>
          </div>
        </div>
      </div>
      <div className="mrz truncate border-t border-line px-3 py-1.5 text-[9px] text-dim/70">
        P&lt;AGT&lt;{p.id.toString().padStart(6, "0")}&lt;&lt;{(p.purpose || "AGENT").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/ /g, "<")}
        &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
      </div>
    </a>
  );
}

export default function ExplorePage() {
  const { chainId, addresses } = useContracts();
  const client = usePublicClient({ chainId });
  const [page,setPage]=useState(0);
  useEffect(()=>setPage(0),[chainId]);

  const query = useQuery({
    queryKey: ["passports", chainId, page],
    enabled: !!client,
    queryFn: async () => {
      if (!client) throw new Error("no client");
      const count=await passportCount(client,addresses.agentPassport);
      const end=count-BigInt(page*12);
      const ids=Array.from({length:Number(end>12n?12n:end>0n?end:0n)},(_,i)=>end-BigInt(i));
      return {count,rows:await fetchPassports(client,addresses.agentPassport,ids)};
    },
  });

  const passports = query.data?.rows ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="gold-rule mb-6" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-bone sm:text-5xl">Passport Registry</h1>
          <p className="mt-3 max-w-2xl text-dim">
            Browse identities on this network. Read straight from the{" "}
            <span className="font-mono text-sm text-bone">AgentPassport</span> contract — no database, no indexer.
          </p>
        </div>
        <a href="/mint" className="btn-gold">
          Issue a passport
        </a>
      </div>

      <div className="mt-6 flex flex-wrap gap-3"><button className="btn-ghost" onClick={()=>query.refetch()} disabled={query.isFetching}>Refresh</button><button className="btn-ghost" disabled={page===0} onClick={()=>setPage(page-1)}>Newer</button><button className="btn-ghost" disabled={!query.data||BigInt((page+1)*12)>=query.data.count} onClick={()=>setPage(page+1)}>Older</button></div>
      <div className="mt-10">
        {query.isLoading && (
          <div className="panel p-10 text-center font-mono text-xs uppercase tracking-[0.3em] text-dim">
            querying the chain…
          </div>
        )}
        {query.isError && (
          <div className="panel border-blood p-10 text-center">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-blood">failed to load registry</div>
            <p className="mt-2 font-mono text-[11px] text-dim">{(query.error as Error).message}</p>
          </div>
        )}
        {query.isSuccess && passports.length === 0 && (
          <div className="panel p-10 text-center font-mono text-xs uppercase tracking-[0.3em] text-dim">
            No passports on this page.
          </div>
        )}
        {passports.length > 0 && (
          <>
            <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-dim">
              {String(query.data?.count ?? 0n)} passport{passports.length === 1 ? "" : "s"} issued ·{" "}
              {"mainnet"}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {passports
                .slice()
                .sort((a, b) => (a.id > b.id ? -1 : 1))
                .map((p) => (
                  <PassportCard key={p.id.toString()} p={p} />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

