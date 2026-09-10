"use client";

import { useEffect, useState } from "react";

import { useAccount, usePublicClient } from "wagmi";
import { decodeEventLog, isAddress, keccak256, parseEther, toHex, type Address } from "viem";
import { agentPassportAbi } from "@/lib/abis";
import { useContracts } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import {isEthInput} from "@/lib/validation";
import {zeroAddress} from "viem";
import { TxStatus } from "@/components/TxStatus";

function toUnix(dt: string): bigint {
  return BigInt(Math.floor(new Date(dt).getTime() / 1000));
}

export default function MintPage() {

  const { chainId, addresses } = useContracts();
  const { address: wallet, isConnected } = useAccount();
  const client = usePublicClient({ chainId });
  const tx = useTx();

  const [agent, setAgent] = useState("");
  const [purpose, setPurpose] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [perTx, setPerTx] = useState("0.002");
  const [daily, setDaily] = useState("0.005");
  const [permInput, setPermInput] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [newId, setNewId] = useState<bigint | null>(null);

  // After confirmation, extract the new passport id from the PassportMinted log.
  useEffect(() => {
    if (!tx.confirmed || !tx.hash || !client || newId !== null) return;
    client
      .getTransactionReceipt({ hash: tx.hash })
      .then((receipt) => {
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: agentPassportAbi, data: log.data, topics: log.topics });
            if (decoded.eventName === "PassportMinted") {
              setNewId(decoded.args.passportId);
              return;
            }
          } catch {
            // not our event
          }
        }
      })
      .catch(() => {});
  }, [tx.confirmed, tx.hash, client, newId]);

  const addPerm = () => {
    const v = permInput.trim().toUpperCase().replace(/\s+/g, "_");
    if (v && !perms.includes(v)) setPerms([...perms, v]);
    setPermInput("");
  };

  const now = Math.floor(Date.now() / 1000);
  const valid =
    isAddress(agent) && agent.toLowerCase() !== zeroAddress &&
    purpose.trim().length > 0 &&
    from &&
    until &&
    toUnix(from) >= BigInt(now - 300) &&
    toUnix(until) > toUnix(from || "0") &&
    isEthInput(perTx) && isEthInput(daily) && Number(perTx) > 0 &&
    Number(daily) >= Number(perTx) &&
    perms.length > 0;

  async function submit() {
    if(!valid || !isConnected)return;
    setNewId(null);
    const ok = await tx.send({
      address: addresses.agentPassport,
      abi: agentPassportAbi,
      functionName: "mint",
      args: [
        agent as Address,
        purpose.trim(),
        toUnix(from),
        toUnix(until),
        parseEther(perTx),
        parseEther(daily),
        perms.map((a) => keccak256(toHex(a))),
      ],
    });
    void ok;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="gold-rule mb-6" />
      <h1 className="font-display text-4xl text-bone sm:text-5xl">Issue a Passport</h1>
      <p className="mt-3 text-dim">
        You are the <span className="text-bone">controller</span> — the accountable owner. The agent address is the wallet
        that will carry this identity. Everything you set here is checked by the deployed contract when a consuming service verifies an action.
      </p>
      <p className="notice mt-6">Integrating an external agent platform? The <a className="text-gold" href="/docs#agent-api">Passport API</a> prepares the exact mainnet issuance transaction for the controller to sign, then verifies the agent before each API action.</p>

      {!isConnected && (
        <div className="panel mt-8 p-5 text-center font-mono text-xs uppercase tracking-[0.25em] text-dim">
          connect a wallet (top right) to issue a passport
        </div>
      )}

      <div className={`mt-8 space-y-6 ${!isConnected ? "pointer-events-none opacity-40" : ""}`}>
        <div>
          <label className="label">agent address — who carries this identity</label>
          <input className="input" value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x…" />
          {agent && !isAddress(agent) && <p className="mt-1 font-mono text-[10px] text-blood">not a valid address</p>}
        </div>

        <div>
          <label className="label">purpose</label>
          <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="corporate travel management" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">valid from</label>
            <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">valid until</label>
            <input className="input" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">per-transaction limit (ETH)</label>
            <input className="input" value={perTx} onChange={(e) => setPerTx(e.target.value)} placeholder="0.002" />
          </div>
          <div>
            <label className="label">daily limit (ETH)</label>
            <input className="input" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="0.005" />
          </div>
        </div>

        <div>
          <label className="label">permissions — human strings, hashed on-chain</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={permInput}
              onChange={(e) => setPermInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPerm())}
              placeholder="BOOK_TRAVEL"
            />
            <button type="button" className="btn-ghost shrink-0" onClick={addPerm}>
              add
            </button>
          </div>
          {perms.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {perms.map((perm) => (
                <span key={perm} className="inline-flex items-center gap-2 border border-gold/50 bg-card px-2 py-1 font-mono text-[11px] text-gold">
                  {perm}
                  <button type="button" onClick={() => setPerms(perms.filter((x) => x !== perm))} className="text-dim hover:text-blood">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {perms.length > 0 && (
            <p className="mt-2 break-all font-mono text-[10px] text-dim">
              on-chain: {perms.map((a) => keccak256(toHex(a)).slice(0, 10) + "…").join(" ")}
            </p>
          )}
        </div>

        <button type="button" className="btn-gold w-full py-3" disabled={!isConnected || !valid || tx.sending || tx.confirming} onClick={submit}>
          {tx.sending ? "confirm in wallet…" : tx.confirming ? "sealing on-chain…" : "issue passport"}
        </button>
        <TxStatus {...tx} />
      </div>

      {newId !== null && (
        <div className="mt-8 border border-leaf/60 bg-card p-6 text-center">
          <div className="inline-block -rotate-6 animate-stampin rounded border-4 border-leaf px-6 py-2 font-mono text-xl uppercase tracking-[0.3em] text-leaf">
            issued
          </div>
          <p className="mt-4 font-mono text-sm text-bone">passport № {newId.toString()} is live</p>
          <div className="mt-4 flex justify-center gap-3">
            <a href={`/passport/${newId.toString()}`} className="btn-gold">
              open the document
            </a>
            <button type="button" className="btn-ghost" onClick={() => window.location.assign("/explore")}>
              registry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
