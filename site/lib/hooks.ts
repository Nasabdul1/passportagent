"use client";

import { useCallback } from "react";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { addChainParams, contracts, type SupportedChainId } from "./config";
import { useSelectedChain } from "./chain-context";

/** Contract addresses for the currently selected network. */
export function useContracts() {
  const { chainId } = useSelectedChain();
  return { chainId, addresses: contracts[chainId] };
}

/**
 * Guards writes: reports whether the wallet is on the selected chain and
 * exposes switch/add helpers (wallet_switchEthereumChain, falling back to
 * wallet_addEthereumChain when the chain is unknown to the wallet).
 */
export function useChainGuard() {
  const { chainId: selected } = useSelectedChain();
  const { chain: walletChain, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const wrongChain = isConnected && walletChain?.id !== selected;

  const ensureChain = useCallback(async (): Promise<boolean> => {
    if (!isConnected) return false;
    if (walletChain?.id === selected) return true;
    try {
      await switchChainAsync({ chainId: selected });
      return true;
    } catch {
      // Chain unknown to the wallet — try adding it.
      try {
        if (!walletClient) return false;
        await walletClient.request({
          method: "wallet_addEthereumChain",
          params: [addChainParams(selected)],
        });
        await switchChainAsync({ chainId: selected });
        return true;
      } catch {
        return false;
      }
    }
  }, [isConnected, walletChain?.id, selected, switchChainAsync, walletClient]);

  const addToWallet = useCallback(
    async (chainId: SupportedChainId) => {
      if (!walletClient) throw new Error("Connect a wallet first");
      await walletClient.request({
        method: "wallet_addEthereumChain",
        params: [addChainParams(chainId)],
      });
    },
    [walletClient],
  );

  return { wrongChain, ensureChain, addToWallet };
}

