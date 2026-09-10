import {recoverMessageAddress,zeroAddress,type Address,type Hex} from 'viem';
import {actionId,canonicalMessage} from './message';
export const CHAIN_READ_AUDIENCE='passport-chain-read-v1';
export type ChainReadDependencies={now:number;agentOf:(id:bigint)=>Promise<Address>;authorized:(id:bigint,action:Hex)=>Promise<boolean>;consume:(key:string,expiry:number)=>Promise<boolean>;read:(agent:Address)=>Promise<unknown>};
export async function gatedChainRead(input:unknown,d:ChainReadDependencies){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Signed request required.');
 const x=input as Record<string,unknown>;const keys=['passportId','chainId','audience','action','amountWei','nonce','deadline','signature'];
 if(Object.keys(x).length!==keys.length||Object.keys(x).some(k=>!keys.includes(k)))throw Error('Unexpected request fields.');
 if(typeof x.passportId!=='string'||!/^[1-9]\d{0,76}$/.test(x.passportId)||BigInt(x.passportId)>=2n**256n)throw Error('Invalid passport ID.');
 if(x.chainId!==4663||x.audience!==CHAIN_READ_AUDIENCE||x.action!==actionId('READ_CHAIN')||x.amountWei!=='0')throw Error('Wrong chain, audience, action, or amount.');
 if(!Number.isSafeInteger(x.deadline)||Number(x.deadline)<=d.now||Number(x.deadline)>d.now+120)throw Error('Request expired or deadline too distant.');
 if(typeof x.nonce!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(x.nonce)||typeof x.signature!=='string'||!/^0x[\da-fA-F]{130}$/.test(x.signature))throw Error('Invalid nonce or signature.');
 const {signature,...fields}=x;
 const signer=await recoverMessageAddress({message:canonicalMessage(fields),signature:signature as Hex});
 const id=BigInt(x.passportId),agent=await d.agentOf(id);
 if(agent===zeroAddress||agent.toLowerCase()!==signer.toLowerCase())throw Error('Signature must come from the named agent.');
 if(!await d.authorized(id,actionId('READ_CHAIN')))throw Error('Passport does not authorize READ_CHAIN.');
 if(!await d.consume(CHAIN_READ_AUDIENCE+':'+agent.toLowerCase()+':'+x.nonce,Number(x.deadline)))throw Error('Request already used.');
 return {ok:true,passportId:x.passportId,agent,result:await d.read(agent)};
}
