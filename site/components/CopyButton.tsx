"use client";

import { useState } from "react";

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy:", value);
        }
      }}
      className="font-mono text-[10px] uppercase tracking-widest border border-line px-2 py-1 text-dim hover:text-gold hover:border-gold transition-colors"
      title={value}
    >
      {copied ? "copied" : (label ?? "copy")}
    </button>
  );
}
