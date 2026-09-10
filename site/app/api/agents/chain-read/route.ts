import {createPublicClient} from 'viem';
import {robinhood,contracts} from '@/lib/config';
import {agentPassportAbi} from '@/lib/abis';
import {agentStore} from '@/lib/agent-store';
import {gatedChainRead} from '@/lib/chain-read-gate';
import {serverRobinhoodTransport} from '@/lib/server-rpc';
export const dynamic='force-dynamic';
const client=createPublicClient({chain:robinhood,transport:serverRobinhoodTransport(10000)});
export async function POST(request:Request){
 const reply=(data:unknown,status:number)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 try{
  const raw=await request.text();if(raw.length>4096)return reply({error:'Request too large.'},413);
  let input:unknown;try{input=JSON.parse(raw);}catch{return reply({error:'Invalid JSON.'},400);}
  const now=Math.floor(Date.now()/1000);
  const result=await gatedChainRead(input,{now,
   agentOf:id=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'agentOf',args:[id]}),
   authorized:(id,action)=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'verifyAuthority',args:[id,action,0n]}),
   consume:async(key,expiry)=>{const db=agentStore();const r=await db.prepare('INSERT OR IGNORE INTO used_nonces (nonce_key,expires_at) VALUES (?,?)').bind(key,expiry).run();await db.prepare('DELETE FROM used_nonces WHERE nonce_key IN (SELECT nonce_key FROM used_nonces WHERE expires_at < ? LIMIT 100)').bind(now-60).run();return r.meta.changes===1;},
   read:async agent=>{const blockNumber=await client.getBlockNumber();const balance=await client.getBalance({address:agent,blockNumber});return {chainId:4663,blockNumber:String(blockNumber),balanceWei:String(balance)};}
  });return reply(result,200);
 }catch(e){const message=e instanceof Error?e.message:'';const denied=/Signed request|Unexpected request|Invalid passport|Wrong chain|Request expired|Invalid nonce|Signature must|does not authorize|Request already used/.test(message);return reply({error:denied?message:'Chain read unavailable or signature invalid. No action was executed.'},denied?403:503);}
}
