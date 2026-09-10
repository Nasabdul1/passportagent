import {env} from 'cloudflare:workers';
import {createPublicClient,getAddress,isAddress,type Hex} from 'viem';
import {agentPassportAbi} from '@/lib/abis';
import {agentStore} from '@/lib/agent-store';
import {contracts,robinhood} from '@/lib/config';
import {actionId} from '@/lib/message';
import {authorizeTrade,quoteFields,requestQuote,UNISWAP_PROVIDER} from '@/lib/trading';
import {unseal} from '@/lib/vault';
import {serverRobinhoodTransport} from '@/lib/server-rpc';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const client=createPublicClient({chain:robinhood,transport:serverRobinhoodTransport(10000)});

export async function GET(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return reply({error:'Sign in first.'},401);
 try{const db=agentStore();const [credential,quotes]=await Promise.all([db.prepare('SELECT updated_at FROM provider_credentials WHERE id=? AND owner=?').bind(owner+':'+UNISWAP_PROVIDER,owner).first(),db.prepare('SELECT id,passport_id,agent,token_out,amount_wei,slippage,routing,output_amount,status,created_at FROM trade_quotes WHERE owner=? ORDER BY created_at DESC LIMIT 10').bind(owner).all()]);return reply({connected:!!credential,quotes:quotes.results});}catch{return reply({error:'Trading history unavailable.'},503);}
}

export async function POST(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return reply({error:'Sign in first.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin mismatch.'},403);
 try{
  const raw=await request.text();if(raw.length>8000)return reply({error:'Request too large.'},413);const x=JSON.parse(raw);const now=Math.floor(Date.now()/1000);
  if(typeof x.passportId!=='string'||!/^[1-9]\d*$/.test(x.passportId)||typeof x.agent!=='string'||!isAddress(x.agent)||typeof x.tokenOut!=='string'||!isAddress(x.tokenOut)||typeof x.amountWei!=='string'||!/^\d+$/.test(x.amountWei)||BigInt(x.amountWei)<=0n||typeof x.slippage!=='number'||x.slippage<0.1||x.slippage>5||typeof x.nonce!=='string'||typeof x.deadline!=='number'||typeof x.signature!=='string'||!/^0x[a-fA-F0-9]{130}$/.test(x.signature))return reply({error:'Invalid signed quote request.'},400);
  const db=agentStore();const credential=await db.prepare('SELECT ciphertext FROM provider_credentials WHERE id=? AND owner=?').bind(owner+':'+UNISWAP_PROVIDER,owner).first();if(!credential)return reply({error:'Connect a Uniswap Trading API key first.'},400);
  const fields=quoteFields(x.passportId,x.agent,x.tokenOut,x.amountWei,x.slippage,x.nonce,x.deadline);
  const agent=await authorizeTrade(fields,x.signature as Hex,'PROPOSE_TRADE',{now,agentOf:id=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'agentOf',args:[id]}),authorized:(id,action,amount)=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'verifyAuthority',args:[id,action,amount]}),consume:async(key,expiry)=>{const r=await db.prepare('INSERT OR IGNORE INTO used_nonces (nonce_key,expires_at) VALUES (?,?)').bind(key,expiry).run();return r.meta.changes===1;}});
  const count=await db.prepare('SELECT count(*) AS n FROM trade_quotes WHERE owner=? AND created_at>?').bind(owner,Date.now()-3600000).first();if(Number(count?.n??0)>=30)return reply({error:'Quote limit reached: 30 per hour.'},429);
  const apiKey=await unseal((env as unknown as Record<string,string>).AGENT_VAULT_KEY??'',owner,UNISWAP_PROVIDER,String(credential.ciphertext));
  if(!await client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'verifyAuthority',args:[BigInt(x.passportId),actionId('PROPOSE_TRADE'),0n]}))return reply({error:'Passport authority changed before quoting.'},403);
  const quote=await requestQuote(apiKey,{tokenOut:x.tokenOut,amountWei:x.amountWei,agent,slippage:x.slippage});const id=crypto.randomUUID();const quoteJson=JSON.stringify(quote.quote);if(quoteJson.length>250000)throw Error('Trading provider response exceeded the storage limit.');
  await db.prepare("INSERT INTO trade_quotes (id,owner,passport_id,agent,token_out,amount_wei,slippage,routing,output_amount,quote_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'quoted',?)").bind(id,owner,x.passportId,getAddress(agent),getAddress(x.tokenOut),x.amountWei,x.slippage,quote.routing,quote.outputAmount,quoteJson,Date.now()).run();
  return reply({id,passportId:x.passportId,agent:getAddress(agent),tokenOut:getAddress(x.tokenOut),amountWei:x.amountWei,slippage:x.slippage,routing:quote.routing,outputAmount:quote.outputAmount,createdAt:Date.now()});
 }catch(e){const message=e instanceof Error?e.message:'';const safe=/^(Trade signature|Trade action|Sign with|Passport does|This signed|Uniswap|Only direct|Trading provider|Invalid Uniswap|Passport authority)/.test(message)?message:'Quote failed. Check the wallet, passport, provider key, and network before retrying.';return reply({error:safe},safe.startsWith('Uniswap found')?404:503);}
}
