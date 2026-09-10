"use client";
import {useState} from 'react';
import {useReadContract} from 'wagmi';
import {agentPassportV2Abi} from '@/lib/abis';
import {useContracts} from '@/lib/hooks';
import {useTx} from '@/lib/tx';
import {actionId} from '@/lib/message';
import {TxStatus} from './TxStatus';
export function ConsumerApproval({id}:{id:bigint}){
 const {chainId,addresses}=useContracts();const tx=useTx();const [action,setAction]=useState('HIRE_AGENTS');
 const q=useReadContract({address:addresses.agentPassport,abi:agentPassportV2Abi,functionName:'consumerAllowed',args:[id,addresses.agentMarket,actionId(action)],chainId});
 return <section className="panel p-5 space-y-4"><h3 className="font-display text-2xl">Market authorization</h3><p className="text-sm text-dim">Approve the V2 Market to record spending for this action. The passport must also grant the action; all passport limits still apply. Transfers clear these approvals.</p><label className="block">Action<select className="input mt-2" value={action} onChange={e=>setAction(e.target.value)}><option>HIRE_AGENTS</option><option>PERFORM_WORK</option></select></label><p className="text-sm break-all">Consumer: {addresses.agentMarket}</p><p>{q.isPending?'Checking approval…':q.isError?'Approval could not be read.':q.data?'Approved':'Not approved'}</p><div className="flex gap-3"><button className="btn-gold" disabled={tx.sending||tx.confirming} onClick={()=>tx.send({address:addresses.agentPassport,abi:agentPassportV2Abi,functionName:'setConsumer',args:[id,addresses.agentMarket,actionId(action),true]})}>Approve market</button><button className="btn-ghost" disabled={tx.sending||tx.confirming} onClick={()=>tx.send({address:addresses.agentPassport,abi:agentPassportV2Abi,functionName:'setConsumer',args:[id,addresses.agentMarket,actionId(action),false]})}>Remove approval</button></div><TxStatus {...tx}/></section>;
}
