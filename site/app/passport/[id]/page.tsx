"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { formatEther, isAddress, keccak256, parseEther, toHex, type Address } from "viem";
import {ConsumerApproval} from "@/components/ConsumerApproval";
import { agentPassportAbi } from "@/lib/abis";
import { useContracts } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { explorerAddress } from "@/lib/config";
import { normalizePassport } from "@/lib/passport";
import { Identicon } from "@/components/Identicon";
import { PassportStatusBadge, shorten } from "@/components/Badges";
import { TxStatus } from "@/components/TxStatus";
import {isEthInput} from "@/lib/validation";
import {PassportHistory} from "@/components/PassportHistory";
import { CopyButton } from "@/components/CopyButton";

function fmtDate(unix: bigint) {
  const n = Number(unix);
  if (!n) return "—";
  return new Date(n * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function Field({ label, children, mono = true }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`${mono ? "font-mono" : "font-sans"} text-xs text-bone break-all`}>{children}</div>
    </div>
  );
}

/** Lazy permission check against hasPermission. */
function PermissionCheck({ id }: { id: bigint }) {
  const { chainId, addresses } = useContracts();
  const client = usePublicClient({ chainId });
  const [input, setInput] = useState("BOOK_TRAVEL");
  const [result, setResult] = useState<{ action: string; hash: string; allowed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkError,setCheckError]=useState("");

  async function check() {
    if (!client || !input.trim()) return;
    setBusy(true);setCheckError("");
    try {
      const hash = keccak256(toHex(input.trim()));
      const allowed = (await client.readContract({
        address: addresses.agentPassport,
        abi: agentPassportAbi,
        functionName: "hasPermission",
        args: [id, hash],
      })) as boolean;
      setResult({ action: input.trim(), hash, allowed });
    } catch {
      setResult(null);
      setCheckError("Could not read permission. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="label">check a permission</div>
      <p className="mb-3 text-xs text-dim">
        Permissions are stored as keccak256 hashes — they can&rsquo;t be enumerated. Enter a human action string to check
        it against <span className="font-mono text-bone">hasPermission</span>.
      </p>
      <div className="flex gap-2">
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="BOOK_TRAVEL" />
        <button type="button" onClick={check} disabled={busy} className="btn-ghost shrink-0">
          {busy ? "…" : "check"}
        </button>
      </div>
      {checkError&&<p role="alert" className="text-blood">{checkError}</p>}
      {result && (
        <div className="mt-3 border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-bone">{result.action}</span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.25em] ${result.allowed ? "text-leaf" : "text-blood"}`}
            >
              {result.allowed ? "● permitted" : "○ not permitted"}
            </span>
          </div>
          {result.hash && <div className="mt-1 break-all font-mono text-[10px] text-dim">{result.hash}</div>}
        </div>
      )}
    </div>
  );
}

function SetPermissionPanel({ id, onDone }: { id: bigint; onDone: () => void }) {
  const { addresses } = useContracts();
  const tx = useTx();
  const [action, setAction] = useState("");
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    if (tx.confirmed) onDone();
  }, [tx.confirmed, onDone]);

  return (
    <div className="panel p-5">
      <div className="label">set permission</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="input"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="ACTION_NAME"
        />
        <button type="button" onClick={() => setAllowed(!allowed)} className="btn-ghost shrink-0">
          {allowed ? "→ allow" : "→ deny"}
        </button>
        <button
          type="button"
          className="btn-gold shrink-0"
          disabled={!action.trim() || tx.sending || tx.confirming}
          onClick={() =>
            tx.send({
              address: addresses.agentPassport,
              abi: agentPassportAbi,
              functionName: "setPermission",
              args: [id, keccak256(toHex(action.trim())), allowed],
            })
          }
        >
          set
        </button>
      </div>
      <div className="mt-2"><TxStatus {...tx} /></div>
    </div>
  );
}

function SetLimitsPanel({ id, onDone }: { id: bigint; onDone: () => void }) {
  const { addresses } = useContracts();
  const tx = useTx();
  const [perTx, setPerTx] = useState("");
  const [daily, setDaily] = useState("");

  useEffect(() => {
    if (tx.confirmed) onDone();
  }, [tx.confirmed, onDone]);

  return (
    <div className="panel p-5">
      <div className="label">set limits (ETH)</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input className="input" value={perTx} onChange={(e) => setPerTx(e.target.value)} placeholder="per-tx, e.g. 0.002" />
        <input className="input" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="daily, e.g. 0.005" />
        <button
          type="button"
          className="btn-gold shrink-0"
          disabled={!isEthInput(perTx) || !isEthInput(daily) || tx.sending || tx.confirming}
          onClick={() =>
            tx.send({
              address: addresses.agentPassport,
              abi: agentPassportAbi,
              functionName: "setLimits",
              args: [id, parseEther(perTx), parseEther(daily)],
            })
          }
        >
          set
        </button>
      </div>
      <div className="mt-2"><TxStatus {...tx} /></div>
    </div>
  );
}

function DelegatePanel({ id, parentValidUntil, onDone }: { id: bigint; parentValidUntil: bigint; onDone: () => void }) {
  const { addresses } = useContracts();
  const tx = useTx();
  const [childAgent, setChildAgent] = useState("");
  const [purpose, setPurpose] = useState("");
  const [actions, setActions] = useState("");
  const [perTx, setPerTx] = useState("");
  const [daily, setDaily] = useState("");
  const [until, setUntil] = useState("");

  useEffect(() => {
    if (tx.confirmed) onDone();
  }, [tx.confirmed, onDone]);

  const valid =
    isAddress(childAgent) &&
    purpose.trim().length > 0 &&
    actions.trim().length > 0 &&
    isEthInput(perTx) &&
    isEthInput(daily) &&
    until &&
    Math.floor(new Date(until).getTime() / 1000) > Math.floor(Date.now() / 1000);

  return (
    <div className="panel p-5">
      <div className="label">delegate a child passport</div>
      <p className="mb-3 text-xs text-dim">
        The child can only ever hold a subset: permissions must be a subset of this passport&rsquo;s, limits are capped by
        this passport&rsquo;s, and validity can&rsquo;t outlive it ({fmtDate(parentValidUntil)}).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" value={childAgent} onChange={(e) => setChildAgent(e.target.value)} placeholder="child agent address 0x…" />
        <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="purpose" />
        <input className="input sm:col-span-2" value={actions} onChange={(e) => setActions(e.target.value)} placeholder="permissions, comma separated: BOOK_TRAVEL, PERFORM_WORK" />
        <input className="input" value={perTx} onChange={(e) => setPerTx(e.target.value)} placeholder="per-tx limit (ETH)" />
        <input className="input" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="daily limit (ETH)" />
        <div className="sm:col-span-2">
          <label className="label">valid until</label>
          <input className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>
      <button
        type="button"
        className="btn-gold mt-4"
        disabled={!valid || tx.sending || tx.confirming}
        onClick={() =>
          tx.send({
            address: addresses.agentPassport,
            abi: agentPassportAbi,
            functionName: "delegate",
            args: [
              id,
              childAgent as Address,
              purpose.trim(),
              actions.split(",").map((a) => keccak256(toHex(a.trim()))),
              parseEther(perTx),
              parseEther(daily),
              BigInt(Math.floor(new Date(until).getTime() / 1000)),
            ],
          })
        }
      >
        delegate
      </button>
      <div className="mt-2"><TxStatus {...tx} /></div>
    </div>
  );
}

function StatusActions({ id, status, onDone }: { id: bigint; status: number; onDone: () => void }) {
  const { addresses } = useContracts();
  const tx = useTx();

  useEffect(() => {
    if (tx.confirmed) onDone();
  }, [tx.confirmed, onDone]);

  const call = (fn: "suspend" | "reactivate" | "revoke") =>
    tx.send({ address: addresses.agentPassport, abi: agentPassportAbi, functionName: fn, args: [id] });

  const busy = tx.sending || tx.confirming;
  return (
    <div className="panel p-5">
      <div className="label">status control</div>
      <div className="flex flex-wrap gap-3">
        {status === 0 && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => call("suspend")}>
            suspend
          </button>
        )}
        {status === 1 && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => call("reactivate")}>
            reactivate
          </button>
        )}
        {status !== 2 && (
          <button type="button" className="btn-danger" disabled={busy} onClick={() => call("revoke")}>
            Revoke passport & descendants
          </button>
        )}
        {status === 2 && <span className="font-mono text-xs text-dim">This passport is revoked.</span>}
      </div>
      <div className="mt-2"><TxStatus {...tx} /></div>
    </div>
  );
}

export default function PassportDetailPage() {
  const params = useParams<{ id: string }>();
  const { chainId, addresses } = useContracts();
  const { address: wallet } = useAccount();

  let id: bigint | null = null;
  try {
    if (/^\d+$/.test(params.id) && BigInt(params.id) > 0n) id = BigInt(params.id);
  } catch {
    id = null;
  }

  const base = { address: addresses.agentPassport, abi: agentPassportAbi, chainId } as const;
  const passport = useReadContract({ ...base, functionName: "getPassport", args: [id ?? 0n], query: { enabled: !!id, retry: false } });
  const owner = useReadContract({ ...base, functionName: "ownerOf", args: [id ?? 0n], query: { enabled: !!id, retry: false } });
  const spent = useReadContract({ ...base, functionName: "spentToday", args: [id ?? 0n], query: { enabled: !!id } });
  const children = useReadContract({ ...base, functionName: "getChildren", args: [id ?? 0n], query: { enabled: !!id } });

  const refetchAll = useCallback(() => {
    passport.refetch();
    spent.refetch();
    children.refetch();
    owner.refetch();
  }, [passport.refetch, spent.refetch, children.refetch, owner.refetch]);

  if (!id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-4xl text-bone">Invalid passport id</h1>
        <p className="mt-4 text-dim">Passport ids are positive integers, starting at 1.</p>
        <a href="/explore" className="btn-ghost mt-8">back to registry</a>
      </div>
    );
  }

  if (passport.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center font-mono text-xs uppercase tracking-[0.3em] text-dim">
        reading the chain…
      </div>
    );
  }

  if (passport.isError || !passport.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="font-display text-4xl text-bone">Unable to load passport № {params.id}</h1>
        <p className="mt-4 text-dim">The passport may not exist, or the network request failed.</p>
        <a href="/explore" className="btn-ghost mt-8">back to registry</a>
      </div>
    );
  }

  const p = normalizePassport(passport.data);
  const expired = Number(p.validUntil) * 1000 < Date.now();
  const isController = !!wallet && !!owner.data && wallet.toLowerCase() === (owner.data as string).toLowerCase();
  const spentToday = (spent.data as bigint | undefined) ?? 0n;
  const spentPct = p.dailyLimit > 0n ? Math.min(100, Number((spentToday * 10000n) / p.dailyLimit) / 100) : 0;
  const kids = (children.data as bigint[] | undefined) ?? [];
  const mrzName = (p.purpose || "AGENT").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/ /g, "<");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <a href="/explore" className="font-mono text-[10px] uppercase tracking-[0.25em] text-dim hover:text-gold">
        ← registry
      </a>

      {/* THE DOCUMENT */}
      <div className="mt-6 border border-gold/40 bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="guilloche flex items-center justify-between border-b border-gold/30 px-5 py-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-gold">
              Robinhood Chain · {"mainnet"}
            </div>
            <div className="font-display text-2xl tracking-[0.15em] text-bone">
              PASSPORT № {id.toString().padStart(6, "0")}
            </div>
          </div>
          <PassportStatusBadge status={p.status} />
        </div>

        <div className="flex flex-col gap-6 p-5 sm:flex-row">
          <div className="shrink-0">
            <div className="border border-line p-1.5">
              <Identicon address={p.agent} size={128} />
            </div>
            <div className="mt-1 text-center font-mono text-[9px] uppercase tracking-widest text-dim">
              agent identicon
            </div>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="agent">
                <a href={explorerAddress(chainId, p.agent)} target="_blank" rel="noreferrer" className="text-goldsoft hover:text-gold">
                  {p.agent}
                </a>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="controller">
                <span className="flex items-center gap-2">
                  {p.controller} <CopyButton value={p.controller} />
                </span>
              </Field>
            </div>
            <div className="sm:col-span-2"><Field label="purpose" mono={false}>{p.purpose || "—"}</Field></div>
            <Field label="valid from">{fmtDate(p.validFrom)}</Field>
            <Field label="valid until">
              <span className={expired ? "text-blood" : ""}>{fmtDate(p.validUntil)}{expired ? " — EXPIRED" : ""}</span>
            </Field>
            <Field label="depth">{p.depth}{p.parentId > 0n ? ` · child of #${p.parentId.toString()}` : " · root"}</Field>
            <Field label="actions recorded">{p.actionCount.toString()}</Field>
          </div>
        </div>

        <div className="mrz overflow-hidden whitespace-nowrap border-t border-gold/30 px-3 py-2 text-[10px] text-dim">
          P&lt;AGT&lt;{id.toString().padStart(6, "0")}&lt;&lt;{mrzName}&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* LIMITS */}
        <div className="panel p-5">
          <div className="label">boundaries</div>
          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <Field label="per-transaction limit">{p.perTxLimit===0n?"Unlimited":formatEther(p.perTxLimit)+" ETH"}</Field>
            <Field label="daily limit">{p.dailyLimit===0n?"Unlimited":formatEther(p.dailyLimit)+" ETH"}</Field>
          </div>
          <div className="mt-5">
            <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-dim">
              <span>spent today</span>
              <span>
                {formatEther(spentToday)} / {formatEther(p.dailyLimit)} ETH
              </span>
            </div>
            <div className="h-2 w-full border border-line bg-ink">
              <div
                className={`h-full transition-all ${spentPct > 90 ? "bg-blood" : spentPct > 60 ? "bg-gold" : "bg-leaf"}`}
                style={{ width: `${spentPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* LINEAGE + HISTORY */}
        <div className="panel p-5">
          <div className="label">chain of authority</div>
          <div className="space-y-3 font-mono text-xs">
            <div>
              <span className="text-dim">parent: </span>
              {p.parentId > 0n ? (
                <a href={`/passport/${p.parentId.toString()}`} className="text-goldsoft hover:text-gold">
                  passport № {p.parentId.toString()} ↑
                </a>
              ) : (
                <span className="text-bone">none — root passport</span>
              )}
            </div>
            <div>
              <span className="text-dim">children: </span>
              {kids.length === 0 ? (
                <span className="text-bone">none</span>
              ) : (
                <span className="inline-flex flex-wrap gap-2">
                  {kids.map((k) => (
                    <a key={k.toString()} href={`/passport/${k.toString()}`} className="border border-line px-2 py-0.5 text-goldsoft hover:border-gold hover:text-gold">
                      № {k.toString()} ↓
                    </a>
                  ))}
                </span>
              )}
            </div>
            <div className="border-t border-line pt-3">
              <div className="text-[9px] uppercase tracking-widest text-dim">last action hash</div>
              <div className="mt-1 break-all text-bone">{p.lastActionHash}</div>
            </div>
          </div>
        </div>

        <PermissionCheck id={id} />

        {/* VERIFY SHORTCUT */}
        <div className="panel flex flex-col justify-between p-5">
          <div>
            <div className="label">border control</div>
            <p className="text-sm text-dim">
              Present this passport at the border: check whether it currently authorizes an action for a given amount.
            </p>
          </div>
          <a href={`/verify?id=${id.toString()}`} className="btn-ghost mt-4 self-start">
            take to border control →
          </a>
        </div>
      </div>

      <PassportHistory id={id}/>
      {/* CONTROLLER CONSOLE */}
      {isController && p.status !== 2 && (
        <div className="mt-10">
          <div className="gold-rule mb-4" />
          <h2 className="font-display text-3xl text-bone">Controller console</h2>
          <p className="mt-2 mb-6 font-mono text-[11px] text-dim">
            connected wallet {shorten(wallet!)} holds this passport — management unlocked
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <StatusActions id={id} status={p.status} onDone={refetchAll} />
            <SetLimitsPanel id={id} onDone={refetchAll} />
            <SetPermissionPanel id={id} onDone={refetchAll} />
            <ConsumerApproval id={id}/>
            <DelegatePanel id={id} parentValidUntil={p.validUntil} onDone={refetchAll} />
          </div>
        </div>
      )}
      {wallet && !isController && owner.data && (
        <p className="mt-10 border border-line bg-paper p-4 text-center font-mono text-[11px] text-dim">
          connected wallet {shorten(wallet)} is not this passport&rsquo;s controller — management actions hidden
        </p>
      )}
    </div>
  );
}

