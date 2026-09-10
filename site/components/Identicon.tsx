import { keccak256, toHex } from "viem";

/**
 * Deterministic identicon ("blockie") derived from an address — pure CSS/divs.
 */
export function Identicon({ address, size = 96 }: { address: string; size?: number }) {
  const hash = keccak256(toHex(address.toLowerCase()));
  const bytes: number[] = [];
  for (let i = 2; i < 66; i += 2) bytes.push(parseInt(hash.slice(i, i + 2), 16));

  const hue = bytes[0];
  const fg = `hsl(${hue} 55% 55%)`;
  const bg = `hsl(${hue} 30% 12%)`;

  // 5x5 mirrored grid
  const cells: boolean[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      cells.push(bytes[(y * 3 + x + 1) % bytes.length] > 127);
    }
  }

  const cell = size / 5;
  const dots = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const mx = x < 3 ? x : 4 - x;
      if (cells[y * 3 + mx]) {
        dots.push(
          <div
            key={`${x}-${y}`}
            style={{
              position: "absolute",
              left: x * cell,
              top: y * cell,
              width: cell,
              height: cell,
              backgroundColor: fg,
            }}
          />,
        );
      }
    }
  }

  return (
    <div
      style={{ width: size, height: size, backgroundColor: bg, position: "relative", overflow: "hidden" }}
      aria-hidden
    >
      {dots}
    </div>
  );
}
