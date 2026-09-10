import { defineChain } from "viem";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export type SupportedChainId = 4663;
export const DEFAULT_CHAIN_ID: SupportedChainId = 4663;

export const chains = [robinhood] as const;

export const contracts: Record<
  SupportedChainId,
  {
    agentPassport: `0x${string}`;
    travelBooking: `0x${string}`;
    agentMarket: `0x${string}`;
  }
> = {
  4663: {
    agentPassport: "0x16366db87c756f7ba2d1947bcaa6c138032e0aa6",
    travelBooking: "0xE87a1Bd908935014fBDD07DEd3B9217860F41E8F",
    agentMarket: "0x4c8075291dad60e117240e8c0aa3c0a02278baef",
  },
};

/** Immutable V1 addresses retained only for the legacy travel demo and migration references. */
export const legacyContracts = {
  agentPassport: "0x44b6D2C7490c8E6060610F983c529c3c3910036f" as `0x${string}`,
  agentMarket: "0xEE70e02AE035659e2C10Afb2162e3094a9a65Bec" as `0x${string}`,
};

export function chainById(chainId: number) {
  return chains.find((c) => c.id === chainId) ?? robinhood;
}

export function explorerAddress(chainId: number, address: string) {
  return `${chainById(chainId).blockExplorers.default.url}/address/${address}`;
}

export function explorerTx(chainId: number, hash: string) {
  return `${chainById(chainId).blockExplorers.default.url}/tx/${hash}`;
}

/** wallet_addEthereumChain params for a supported chain. */
export function addChainParams(chainId: number) {
  const chain = chainById(chainId);
  return {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [chain.rpcUrls.default.http[0]],
    blockExplorerUrls: [chain.blockExplorers.default.url],
  };
}

export const passportStatusLabel = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;
export const taskStatusLabel = ["OPEN", "ACCEPTED", "DELIVERED", "DISPUTED", "SETTLED"] as const;

