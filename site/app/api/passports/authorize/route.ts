import {env} from 'cloudflare:workers';
import {createPublicClient} from 'viem';
import {agentPassportAbi} from '@/lib/abis';
import {contracts,robinhood} from '@/lib/config';
import {authorizeAgentApiRequest} from '@/lib/agent-api-authorization';
import {serverRobinhoodTransport} from '@/lib/server-rpc';
export const dynamic='force-dynamic';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const client=createPublicClient({chain:robinhood,transport:serverRobinhoodTransport()});
export function OPTIONS(){return new Response(null,{status:204,headers:cors});}
export async function POST(request:Request){
 try{const raw=await request.text();if(raw.length>16384)return reply({ok:false,reason:'Request too large.'},413);let body:unknown;try{body=JSON.parse(raw);}catch{return reply({ok:false,reason:'Invalid JSON.'},400);}const now=Math.floor(Date.now()/1000);const result=await authorizeAgentApiRequest(body,{now,agentOf:id=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'agentOf',args:[id]}),authorized:(id,action,amount)=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'verifyAuthority',args:[id,action,amount]}),consumeNonce:async(key,expiry)=>{const r=await env.DB.prepare('INSERT OR IGNORE INTO used_nonces (nonce_key,expires_at) VALUES (?,?)').bind(key,expiry).run();return r.meta.changes===1;}});return reply(result,result.ok?200:403);}
 catch{return reply({ok:false,reason:'Authorization service is unavailable. Try again shortly.'},503);}
}
