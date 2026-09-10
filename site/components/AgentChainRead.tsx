"use client";
import {useState} from 'react';
import {useAccount,useSignMessage} from 'wagmi';
import {actionId,canonicalMessage} from '@/lib/message';
import {CHAIN_READ_AUDIENCE} from '@/lib/chain-read-gate';
export function AgentChainRead({passportId}:{passportId:string}){
 const {address}=useAccount();const {signMessageAsync}=useSignMessage();const [busy,setBusy]=useState(false);const [result,setResult]=useState('');
 async function run(){setBusy(true);setResult('');try{if(!/^[1-9]\d*$/.test(passportId))throw Error('Enter a passport ID first.');const fields={passportId,chainId:4663,audience:CHAIN_READ_AUDIENCE,action:actionId('READ_CHAIN'),amountWei:'0',nonce:crypto.randomUUID(),deadline:Math.floor(Date.now()/1000)+120};const signature=await signMessageAsync({message:canonicalMessage(fields)});const r=await fetch('/api/agents/chain-read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,signature})});const data=await r.json() as {error:string;result:{blockNumber:string;balanceWei:string}};if(!r.ok)throw Error(data.error);setResult(`Verified mainnet block ${data.result.blockNumber}. Agent balance: ${data.result.balanceWei} wei.`);}catch(e){setResult((e as Error).message);}finally{setBusy(false);}}
 return <section className="notice"><h3 className="font-display text-xl">Test a Passport-gated tool</h3><p className="mt-2">Read the agent wallet’s mainnet balance. Requires an active passport with READ_CHAIN permission and its agent wallet signature. This performs no trade and spends no ETH.</p><button className="btn-ghost mt-4" disabled={busy||!address} onClick={()=>void run()}>{busy?'Checking authority…':'Sign & run chain read'}</button>{!address&&<p className="text-sm mt-2">Connect the agent wallet to test.</p>}{result&&<p role="status" className="mt-3 break-all">{result}</p>}</section>;
}

