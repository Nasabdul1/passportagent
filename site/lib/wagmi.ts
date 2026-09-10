"use client";

import { http, createConfig } from "wagmi";
import { injected } from "@wagmi/core";
import { chains } from "./config";

export const wagmiConfig = createConfig({
  ssr: true,
  chains,
  connectors: [injected()],
  transports: {
    4663: http("https://rpc.mainnet.chain.robinhood.com"),
  },
});

