import {BaseError,ContractFunctionRevertedError,type PublicClient} from 'viem';
import {agentPassportAbi} from './abis';
export type PassportInfo={agent:`0x${string}`;controller:`0x${string}`;purpose:string;parentId:bigint;depth:number;validFrom:bigint;validUntil:bigint;perTxLimit:bigint;dailyLimit:bigint;status:number;actionCount:bigint;lastActionHash:`0x${string}`};
export type PassportRecord=PassportInfo&{id:bigint};
// IDs are contiguous and never burned by this deployment. Use agentOf, not getLogs
// from genesis or Multicall3 (which is not configured on this chain).
export async function passportCount(client:PublicClient,address:`0x${string}`){
 const blockNumber=await client.getBlockNumber();
 const exists=async(id:bigint)=>{try{await client.readContract({address,abi:agentPassportAbi,functionName:'ownerOf',args:[id],blockNumber});return true;}catch(e){if(e instanceof BaseError){const cause=e.walk(x=>x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError;if(cause.data?.errorName==='ERC721NonexistentToken')return false;}throw e;}};
 let lo=0n,hi=1n;
 while(await exists(hi)){lo=hi;hi*=2n;if(hi>2n**64n)throw Error('Registry is beyond supported range.');}
 while(hi-lo>1n){const mid=(lo+hi)/2n;if(await exists(mid))lo=mid;else hi=mid;}
 return lo;
}
export async function fetchPassportIds(client:PublicClient,address:`0x${string}`){const count=await passportCount(client,address);if(count>1000n)throw Error('Use registry pages to browse this larger network.');return Array.from({length:Number(count)},(_,i)=>BigInt(i+1));}
export async function fetchPassports(client:PublicClient,address:`0x${string}`,ids:bigint[]){
 const out:PassportRecord[]=[];
 for(let i=0;i<ids.length;i+=6){const rows=await Promise.all(ids.slice(i,i+6).map(async id=>({...await client.readContract({address,abi:agentPassportAbi,functionName:'getPassport',args:[id]}),id})));out.push(...rows);}
 return out;
}
export function effectiveStatus(p:PassportInfo){if(p.status===2)return 'Revoked';if(p.status===1)return 'Suspended';const now=BigInt(Math.floor(Date.now()/1000));if(now<p.validFrom)return 'Not yet valid';if(now>p.validUntil)return 'Expired';return 'Active';}

export function normalizePassport(raw:unknown):PassportInfo {
 if(!Array.isArray(raw))return raw as PassportInfo;
 const keys=['agent','controller','purpose','parentId','depth','validFrom','validUntil','perTxLimit','dailyLimit','status','actionCount','lastActionHash'];
 return Object.fromEntries(keys.map((key,i)=>[key,raw[i]])) as PassportInfo;
}
