import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101211",
        paper: "#151915",
        card: "#1b201a",
        line: "#343d30",
        bone: "#f1f4ed",
        dim: "#a5af9d",
        gold: "#c5f86b",
        goldsoft: "#d9ffa1",
        blood: "#f58c80",
        leaf: "#a8d978",
      },
      fontFamily: {
        display: ["var(--font-display)", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        stampin: {
          "0%": { transform: "scale(2.2) rotate(-14deg)", opacity: "0" },
          "60%": { transform: "scale(0.95) rotate(-8deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(-8deg)", opacity: "1" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0) rotate(-4deg)" },
          "50%": { transform: "translateY(-10px) rotate(-3deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        stampin: "stampin 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both",
        floaty: "floaty 7s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
