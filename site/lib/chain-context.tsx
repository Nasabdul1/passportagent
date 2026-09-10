"use client";
import { type ReactNode } from "react";
import { DEFAULT_CHAIN_ID } from "./config";
export function ChainProvider({children}:{children:ReactNode}){return <>{children}</>;}
export function useSelectedChain(){return {chainId:DEFAULT_CHAIN_ID};}
