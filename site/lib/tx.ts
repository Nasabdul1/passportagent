"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConfig, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { getAccount, getPublicClient, simulateContract } from "wagmi/actions";
import { useQueryClient } from "@tanstack/react-query";
import { useChainGuard, useContracts } from "./hooks";
import { useReview } from "@/components/TransactionReview";
import { agentPassportAbi } from "./abis";
import { validateWrite } from "./validation";
type WriteParams = {address: `0x${string}`; abi: import("viem").Abi; functionName:string; args?:readonly unknown[]; value?:bigint};
export function useTx() {
 const config=useConfig(); const {address:account}=useAccount(); const {ensureChain}=useChainGuard();
 const {chainId,addresses}=useContracts(); const review=useReview(); const cache=useQueryClient();
 const {writeContractAsync}=useWriteContract();
 const [hash,setHash]=useState<`0x${string}`>(); const [txChainId,setTxChainId]=useState(chainId);
 const [error,setError]=useState<string|null>(null); const [sending,setSending]=useState(false); const locked=useRef(false);
 const receipt=useWaitForTransactionReceipt({hash,chainId:txChainId,query:{enabled:!!hash}});
 const confirmed=receipt.isSuccess && receipt.data.status==='success';
 useEffect(()=>{if(receipt.isSuccess || receipt.isError){locked.current=false;if(receipt.data?.status==='reverted')setError('Transaction reverted. No requested change was applied.');if(receipt.isError)setError('Confirmation could not be retrieved. Check the explorer before retrying.');if(receipt.data?.status==='success')void cache.invalidateQueries();}},[receipt.isSuccess,receipt.isError,receipt.data,cache]);
 async function send(params:WriteParams){
  if(locked.current)return false;locked.current=true;setSending(true);setError(null);setHash(undefined);
  let submitted=false;
  try{
   if(!account)throw Error('Connect your wallet first.');
   if(!Object.values(addresses).some(a=>a.toLowerCase()===params.address.toLowerCase()))throw Error('Unknown contract address.');
   validateWrite(params.functionName,params.args??[],params.value??0n);
   if(!await review({chainId,address:params.address,functionName:params.functionName,args:params.args??[],value:params.value??0n,abi:params.abi}))return false;
   if(!await ensureChain())throw Error('Switch to the selected network in your wallet to continue.');
   if(getAccount(config).address?.toLowerCase()!==account.toLowerCase())throw Error('Wallet account changed. Review the action again.');
   const client=getPublicClient(config,{chainId});if(!client)throw Error('Network is unavailable.');
   if(['suspend','reactivate','setLimits','setPermission','delegate'].includes(params.functionName)){
    const p=await client.readContract({address:addresses.agentPassport,abi:agentPassportAbi,functionName:'getPassport',args:[params.args![0] as bigint]});
    if(p.status===2)throw Error('This app does not permit changing a revoked passport.');
   }
   if(params.functionName==='delegate'){
    const a=params.args as readonly [bigint,string,string,readonly `0x${string}`[],bigint,bigint,bigint];
    const parent=await client.readContract({address:addresses.agentPassport,abi:agentPassportAbi,functionName:'getPassport',args:[a[0]]});
    if((parent.perTxLimit>0n&&(a[4]===0n||a[4]>parent.perTxLimit))||(parent.dailyLimit>0n&&(a[5]===0n||a[5]>parent.dailyLimit)))throw Error('Child limits must stay within the parent; zero means unlimited.');
    if(a[6]>parent.validUntil)throw Error('Child expiry must not exceed parent expiry.');
   }
   await simulateContract(config,{...params,account,chainId} as Parameters<typeof simulateContract>[1]);
   if(getAccount(config).address?.toLowerCase()!==account.toLowerCase()||getAccount(config).chainId!==chainId)throw Error('Wallet changed during simulation. Review and retry.');
   const h=await writeContractAsync({...params,account,chainId} as Parameters<typeof writeContractAsync>[0]);
   setTxChainId(chainId);setHash(h);submitted=true;return true;
  }catch(e){const err=e as {shortMessage?:string;message?:string};setError(err.shortMessage??err.message??'Transaction failed.');return false;}
  finally{setSending(false);if(!submitted)locked.current=false;}
 }
 return {send,hash,error,sending,txChainId,confirming:!!hash&&receipt.isPending,confirmed,reset:()=>{if(!locked.current){setHash(undefined);setError(null);}}};
}
