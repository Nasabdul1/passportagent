import {env} from 'cloudflare:workers';
import {createPublicClient,http} from 'viem';
import {robinhood,contracts} from '@/lib/config';
import {agentPassportAbi} from '@/lib/abis';
import {verifyEnvelope} from '@/lib/verify-envelope';
export const dynamic='force-dynamic';
const client=createPublicClient({chain:robinhood,transport:http(robinhood.rpcUrls.default.http[0],{timeout:12000,retryCount:1})});
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const respond=(data:unknown,status:number)=>new Response(JSON.stringify(data),{status,headers});
 try{
  if(Number(request.headers.get('content-length'))>16384)return respond({ok:false,reason:'Request too large.'},413);
  const raw=await request.text();if(raw.length>16384)return respond({ok:false,reason:'Request too large.'},413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return respond({ok:false,reason:'Invalid JSON.'},400);}
  const now=Math.floor(Date.now()/1000);
  const result=await verifyEnvelope(body,{
   now,
   agentOf:id=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'agentOf',args:[id]}),
   authorized:(id,action,amount)=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'verifyAuthority',args:[id,action,amount]}),
   consumeNonce:async(key,expiry)=>{
    const inserted=await env.DB.prepare('INSERT OR IGNORE INTO used_nonces (nonce_key, expires_at) VALUES (?, ?)').bind(key,expiry).run();
    await env.DB.prepare('DELETE FROM used_nonces WHERE nonce_key IN (SELECT nonce_key FROM used_nonces WHERE expires_at < ? LIMIT 100)').bind(now-60).run();
    return inserted.meta.changes===1;
   }
  });
  return respond(result,result.ok?200:403);
 }catch{return respond({ok:false,reason:'Verification service is unavailable. Try again shortly.'},503);}
}