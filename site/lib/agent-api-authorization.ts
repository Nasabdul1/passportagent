import {recoverMessageAddress,zeroAddress,type Address,type Hex} from 'viem';
import {canonicalMessage} from './message';
import {AGENT_API_AUDIENCE,PASSPORT_CHAIN_ID} from './passport-api';

type Dependencies={
 now:number;
 agentOf:(id:bigint)=>Promise<Address>;
 authorized:(id:bigint,action:Hex,amount:bigint)=>Promise<boolean>;
 consumeNonce:(key:string,expiry:number)=>Promise<boolean>;
};

export async function authorizeAgentApiRequest(body:unknown,deps:Dependencies){
 const deny=(reason:string)=>({ok:false as const,reason});
 if(!body||typeof body!=='object'||Array.isArray(body))return deny('Expected a signed JSON object.');
 const {signature,...fields}=body as Record<string,unknown>;
 if(typeof signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(signature))return deny('A valid agent-wallet signature is required.');
 if(typeof fields.passportId!=='string'||!/^[1-9]\d{0,76}$/.test(fields.passportId))return deny('Invalid passport ID.');
 if(fields.chainId!==PASSPORT_CHAIN_ID||fields.audience!==AGENT_API_AUDIENCE)return deny('Wrong chain or audience.');
 if(typeof fields.action!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(fields.action))return deny('action must be a bytes32 permission ID.');
 if(typeof fields.amountWei!=='string'||!/^\d{1,78}$/.test(fields.amountWei))return deny('amountWei must be a decimal string.');
 let amount:bigint;try{amount=BigInt(fields.amountWei);if(amount>=(1n<<256n))throw Error();}catch{return deny('Invalid amountWei.');}
 if(!Number.isSafeInteger(fields.deadline)||Number(fields.deadline)<=deps.now||Number(fields.deadline)>deps.now+300)return deny('Deadline must be within the next five minutes.');
 if(typeof fields.nonce!=='string'||!/^[a-zA-Z0-9_-]{16,128}$/.test(fields.nonce))return deny('Invalid nonce.');
 let signer:Address;try{signer=await recoverMessageAddress({message:canonicalMessage(fields),signature:signature as Hex});}catch{return deny('Invalid signature.');}
 const id=BigInt(fields.passportId);const action=fields.action as Hex;const agent=await deps.agentOf(id);
 if(agent===zeroAddress||agent.toLowerCase()!==signer.toLowerCase())return deny('The signer is not this passport’s agent.');
 if(!await deps.authorized(id,action,amount))return deny('Passport does not currently authorize this action and amount.');
 const nonceKey=`agent-api:${PASSPORT_CHAIN_ID}:${signer.toLowerCase()}:${fields.nonce}`;
 if(!await deps.consumeNonce(nonceKey,Number(fields.deadline)))return deny('This nonce has already been used.');
 return {ok:true as const,agent,passportId:fields.passportId,chainId:PASSPORT_CHAIN_ID,action,amountWei:fields.amountWei};
}

