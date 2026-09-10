"use client";
import {createContext,useContext,useRef,useState,type ReactNode} from 'react';
import {formatEther,type Abi} from 'viem';
import {chainById,explorerAddress} from '@/lib/config';
type Review={chainId:number;address:string;functionName:string;args:readonly unknown[];value:bigint;abi:Abi};
const Context=createContext<(r:Review)=>Promise<boolean>>(async()=>false);
export const useReview=()=>useContext(Context);
export function TransactionReviewProvider({children}:{children:ReactNode}){
 const [pending,setPending]=useState<Review|null>(null);const resolver=useRef<((ok:boolean)=>void)|null>(null);const dialog=useRef<HTMLDialogElement>(null);
 function finish(ok:boolean){dialog.current?.close();setPending(null);resolver.current?.(ok);resolver.current=null;}
 function request(r:Review){if(resolver.current)return Promise.resolve(false);setPending(r);return new Promise<boolean>(resolve=>{resolver.current=resolve;requestAnimationFrame(()=>dialog.current?.showModal());});}
 const definition=pending?.abi.find(x=>x.type==='function'&&x.name===pending.functionName);
 return <Context.Provider value={request}>{children}<dialog ref={dialog} onCancel={e=>{e.preventDefault();finish(false);}} className="review-dialog panel p-6 text-bone"><h2 className="font-display text-2xl">Review transaction</h2>{pending&&<><p className="mt-2 text-dim">{chainById(pending.chainId).name} · {'Mainnet — real ETH'}</p><dl className="review-fields"><dt>Action</dt><dd>{pending.functionName}</dd><dt>Contract</dt><dd><a className="text-gold break-all" href={explorerAddress(pending.chainId,pending.address)} target="_blank" rel="noreferrer">{pending.address}</a></dd><dt>ETH sent</dt><dd>{formatEther(pending.value)} ETH + wallet-estimated gas</dd>{pending.args.map((arg,i)=><div key={i}><dt>{definition?.type==='function'?definition.inputs[i]?.name??`Argument ${i+1}`:`Argument ${i+1}`}</dt><dd className="break-all">{Array.isArray(arg)?arg.map(String).join(', '):String(arg)}</dd></div>)}</dl>{pending.functionName==='revoke'&&<p className="text-blood">V2 revocation permanently disables this passport and its descendants. It cannot be undone.</p>}{pending.functionName==='approveTask'&&<p className="text-blood">Approval credits escrow to the worker’s withdrawal balance. Verify the delivered result first.</p>}{pending.functionName==='concede'&&<p className="text-blood">Conceding permanently awards all escrow to the other party.</p>}{pending.functionName==='resolve'&&<p className="text-blood">This split permanently settles the dispute. The remaining escrow is credited to the buyer.</p>}<div className="mt-6 flex flex-wrap gap-3"><button className="btn-ghost" onClick={()=>finish(false)}>Cancel</button><button className="btn-gold" onClick={()=>finish(true)}>Simulate & continue to wallet</button></div></>}</dialog></Context.Provider>;
}

