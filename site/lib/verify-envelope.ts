import {recoverMessageAddress,zeroAddress,type Address,type Hex} from 'viem';
import {canonicalMessage,actionId} from './message';
export const ACCESS_AUDIENCE='passport-web2-access';
export const ACCESS_ACTION=actionId('BOOK_TRAVEL');
type Dependencies={now:number;agentOf:(id:bigint)=>Promise<Address>;authorized:(id:bigint,action:Hex,amount:bigint)=>Promise<boolean>;consumeNonce:(key:string,expiry:number)=>Promise<boolean>};
export async function verifyEnvelope(body:unknown,deps:Dependencies){
 const deny=(reason:string)=>({ok:false as const,reason});
 if(!body||typeof body!=='object'||Array.isArray(body))return deny('Expected a signed JSON object.');
 const {signature,...fields}=body as Record<string,unknown>;
 if(typeof signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(signature))return deny('A valid signature is required.');
 if(typeof fields.passportId!=='string'||!/^[1-9]\d{0,76}$/.test(fields.passportId))return deny('Invalid passport ID.');
 if(fields.chainId!==4663||fields.audience!==ACCESS_AUDIENCE)return deny('Wrong chain or audience.');
 if(fields.action!==ACCESS_ACTION||fields.amountWei!=='0')return deny('This endpoint requires BOOK_TRAVEL with amountWei 0.');
 if(!Number.isSafeInteger(fields.deadline)||Number(fields.deadline)<=deps.now||Number(fields.deadline)>deps.now+300)return deny('Deadline must be within the next five minutes.');
 if(typeof fields.nonce!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(fields.nonce))return deny('Invalid nonce.');
 let signer:Address;try{signer=await recoverMessageAddress({message:canonicalMessage(fields),signature:signature as Hex});}catch{return deny('Invalid signature.');}
 const id=BigInt(fields.passportId);const agent=await deps.agentOf(id);
 if(agent===zeroAddress||agent.toLowerCase()!==signer.toLowerCase())return deny('The signer is not this passport’s agent.');
 if(!await deps.authorized(id,ACCESS_ACTION,0n))return deny('Passport does not currently authorize BOOK_TRAVEL.');
 if(!await deps.consumeNonce('4663:'+signer.toLowerCase()+':'+fields.nonce,Number(fields.deadline)))return deny('This nonce has already been used.');
 return {ok:true as const,agent,passportId:fields.passportId,chainId:4663,action:'BOOK_TRAVEL',amountWei:'0'};
}