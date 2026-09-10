import {env} from 'cloudflare:workers';
import {createPublicClient,type Hex} from 'viem';
import {agentPassportAbi} from '@/lib/abis';
import {agentStore} from '@/lib/agent-store';
import {contracts,robinhood} from '@/lib/config';
import {authorizeTrade,executeFields,receiptRecordsSpend,requestSwap,UNISWAP_PROVIDER} from '@/lib/trading';
import {unseal} from '@/lib/vault';
import {serverRobinhoodTransport} from '@/lib/server-rpc';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const client=createPublicClient({chain:robinhood,transport:serverRobinhoodTransport(10000)});

export async function POST(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return reply({error:'Sign in first.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin mismatch.'},403);
 try{
  const raw=await request.text();if(raw.length>5000)return reply({error:'Request too large.'},413);const x=JSON.parse(raw);const now=Math.floor(Date.now()/1000);
  if(typeof x.quoteId!=='string'||!/^[a-f0-9-]{36}$/.test(x.quoteId)||typeof x.spendTxHash!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(x.spendTxHash)||typeof x.nonce!=='string'||typeof x.deadline!=='number'||typeof x.signature!=='string'||!/^0x[a-fA-F0-9]{130}$/.test(x.signature))return reply({error:'Invalid signed execution request.'},400);
  const db=agentStore();const row=await db.prepare('SELECT * FROM trade_quotes WHERE id=? AND owner=?').bind(x.quoteId,owner).first();if(!row)return reply({error:'Quote not found.'},404);if(!['quoted','preparation_failed'].includes(String(row.status)))return reply({error:'This quote was already prepared. Request a fresh quote.'},409);if(Date.now()-Number(row.created_at)>180000)return reply({error:'Quote expired. Request a fresh quote.'},409);if(row.spend_tx_hash&&String(row.spend_tx_hash).toLowerCase()!==x.spendTxHash.toLowerCase())return reply({error:'This quote is bound to a different Passport spend transaction.'},409);
  const credential=await db.prepare('SELECT ciphertext FROM provider_credentials WHERE id=? AND owner=?').bind(owner+':'+UNISWAP_PROVIDER,owner).first();if(!credential)return reply({error:'Connect a Uniswap Trading API key first.'},400);
  const fields=executeFields(x.quoteId,String(row.passport_id),String(row.agent),String(row.token_out),String(row.amount_wei),x.spendTxHash,x.nonce,x.deadline);
  const agent=await authorizeTrade(fields,x.signature as Hex,'EXECUTE_TRADE',{now,agentOf:id=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'agentOf',args:[id]}),authorized:(id,action,amount)=>client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'verifyAuthority',args:[id,action,amount]}),consume:async(key,expiry)=>{const r=await db.prepare('INSERT OR IGNORE INTO used_nonces (nonce_key,expires_at) VALUES (?,?)').bind(key,expiry).run();return r.meta.changes===1;}});
  const receipt=await client.getTransactionReceipt({hash:x.spendTxHash as Hex});if(!receiptRecordsSpend(receipt,{passportId:String(row.passport_id),agent:String(row.agent),amountWei:String(row.amount_wei)}))return reply({error:'The transaction does not record this exact Passport spend.'},403);
  try{const reserved=await db.prepare("UPDATE trade_quotes SET status='preparing',spend_tx_hash=? WHERE id=? AND owner=? AND status IN ('quoted','preparation_failed')").bind(x.spendTxHash.toLowerCase(),x.quoteId,owner).run();if(reserved.meta.changes!==1)return reply({error:'This quote is already being prepared.'},409);}catch{return reply({error:'That Passport spend transaction is already bound to another quote.'},409);}
  const apiKey=await unseal((env as unknown as Record<string,string>).AGENT_VAULT_KEY??'',owner,UNISWAP_PROVIDER,String(credential.ciphertext));let transaction;try{transaction=await requestSwap(apiKey,JSON.parse(String(row.quote_json)),{agent,amountWei:String(row.amount_wei)});}catch(e){await db.prepare("UPDATE trade_quotes SET status='preparation_failed' WHERE id=? AND owner=?").bind(x.quoteId,owner).run();throw e;}
  await db.prepare("UPDATE trade_quotes SET status='prepared' WHERE id=? AND owner=? AND status='preparing'").bind(x.quoteId,owner).run();return reply({transaction,quote:{id:x.quoteId,tokenOut:String(row.token_out),amountWei:String(row.amount_wei),outputAmount:String(row.output_amount),routing:String(row.routing)}});
 }catch(e){const message=e instanceof Error?e.message:'';const safe=/^(Trade signature|Trade action|Sign with|Passport does|This signed|Uniswap|Trading provider)/.test(message)?message:'Swap preparation failed. Request a fresh quote before retrying.';return reply({error:safe},503);}
}
