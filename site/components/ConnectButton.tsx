"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shorten } from "./Badges";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [error, setError] = useState<string | null>(null);

  if (isConnected && address) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="font-mono text-xs tracking-wider border border-gold/60 text-gold px-3 py-1.5 hover:bg-gold hover:text-ink transition-colors"
        title="Disconnect"
      >
        {shorten(address)}
      </button>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={async () => {
          setError(null);
          try {
            if(!injected || !await injected.getProvider()) throw Error("Open this site in a wallet-enabled browser or your wallet’s browser to connect.");
            await connectAsync({connector:injected});
          } catch(e) { setError((e as Error).message); }
        }}
        className="font-mono text-xs uppercase tracking-[0.2em] border border-gold text-gold px-4 py-1.5 hover:bg-gold hover:text-ink transition-colors disabled:opacity-50"
      >
        {isPending ? "connecting…" : "connect"}
      </button>
      {error && <span className="mt-1 font-mono text-[10px] text-blood max-w-56 text-right">{error}</span>}
    </span>
  );
}
