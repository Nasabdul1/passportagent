import { passportStatusLabel, taskStatusLabel } from "@/lib/config";

const passportStyles = [
  "text-leaf border-leaf",
  "text-gold border-gold",
  "text-blood border-blood",
];

const taskStyles = [
  "text-leaf border-leaf",
  "text-gold border-gold",
  "text-goldsoft border-goldsoft",
  "text-dim border-dim",
  "text-blood border-blood",
];

export function PassportStatusBadge({ status }: { status: number }) {
  const i = Number(status);
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${passportStyles[i] ?? "text-dim border-dim"}`}
    >
      {passportStatusLabel[i] ?? `STATUS_${i}`}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: number }) {
  const i = Number(status);
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${taskStyles[i] ?? "text-dim border-dim"}`}
    >
      {taskStatusLabel[i] ?? `STATUS_${i}`}
    </span>
  );
}

export function shorten(address: string, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}
