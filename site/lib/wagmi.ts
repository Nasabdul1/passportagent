"use client";

import { createConfig } from "wagmi";
import { injected } from "@wagmi/core";
import { chains } from "./config";
import { robinhoodTransport } from "./rpc";

export const wagmiConfig = createConfig({
  ssr: true,
  chains,
  connectors: [injected()],
  transports: {
    4663: robinhoodTransport(),
  },
});

