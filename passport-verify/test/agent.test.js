import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {recoverMessageAddress} from 'viem';
import {createAgentClient} from '../src/agent.js';
import {canonicalMessage} from '../src/message.js';
test('agent client binds chain, gateway audience and each request to a fresh signature',async()=>{
 const account=privateKeyToAccount(generatePrivateKey()),seen=[];
 const client=createAgentClient({account,siteUrl:'https://passport.example',fetcher:async(url,options)=>{
  assert.equal(String(url),'https://passport.example/api/agents/chain-read');assert.equal(options.redirect,'error');
  const body=JSON.parse(options.body);const {signature,...fields}=body;
  assert.equal(await recoverMessageAddress({message:canonicalMessage(fields),signature}),account.address);
  assert.equal(body.chainId,4663);assert.equal(body.audience,'passport-chain-read-v1');assert.equal(body.amountWei,'0');seen.push(body.nonce);
  return Response.json({ok:true});
 }});
 await client.readChain('1');await client.readChain('1');assert.notEqual(seen[0],seen[1]);
});
test('agent client rejects invalid IDs and propagates gateway denial',async()=>{
 let called=false;const account=privateKeyToAccount(generatePrivateKey());
 const client=createAgentClient({account,siteUrl:'https://passport.example',fetcher:async()=>{called=true;return Response.json({error:'Passport revoked'},{status:403});}});
 await assert.rejects(()=>client.readChain('-1'));assert.equal(called,false);
 await assert.rejects(()=>client.readChain('1'),/Passport revoked/);
 assert.throws(()=>createAgentClient({account,siteUrl:'http://passport.example'}));
});
