import {actionId,canonicalMessage} from './message.js';
/** A signed, Passport-gated read adapter. No trading, credential storage, or autonomous loop. */
export function createAgentClient({account,siteUrl,fetcher=fetch}) {
 const origin=new URL(siteUrl);
 if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Use an HTTPS Passport site URL.');
 return {
  async readChain(passportId){
   const id=String(passportId);if(!/^[1-9]\d*$/.test(id)||BigInt(id)>=2n**256n)throw Error('Invalid passport ID.');
   const fields={passportId:id,chainId:4663,audience:'passport-chain-read-v1',action:actionId('READ_CHAIN'),amountWei:'0',nonce:crypto.randomUUID(),deadline:Math.floor(Date.now()/1000)+120};
   const signature=await account.signMessage({message:canonicalMessage(fields)});
   const response=await fetcher(new URL('/api/agents/chain-read',origin),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,signature}),redirect:'error',signal:AbortSignal.timeout(20000)});
   const data=await response.json();if(!response.ok)throw Error(data.error??'Passport gateway rejected the request.');return data;
  }
 };
}
