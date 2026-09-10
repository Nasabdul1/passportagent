import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // wagmi's connectors barrel optionally references these SDKs (smart-account
    // / x402 payment features). We only use the injected connector, so stub them.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm": false,
      "@x402/svm": false,
      "@coinbase/cdp-sdk": false,
      "@base-org/account": false,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
