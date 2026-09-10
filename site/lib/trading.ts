import {decodeEventLog,getAddress,isAddress,keccak256,recoverMessageAddress,toHex,zeroAddress,type Address,type Hex,type TransactionReceipt} from 'viem';
import {agentPassportAbi} from './abis';
import {contracts} from './config';
import {actionId,canonicalMessage} from './message';

export const UNISWAP_PROVIDER='Uniswap Trading API';
export const NATIVE_TOKEN=zeroAddress;
export const UNISWAP_ROUTER=getAddress('0x8876789976decbfcbbbe364623c63652db8c0904');
const API='https://trade-api.gateway.uniswap.org/v1';

export function quoteFields(passportId:string,agent:string,tokenOut:string,amountWei:string,slippage:number,nonce:string,deadline:number){
 return {audience:'passport-trade-quote-v1',chainId:4663,passportContract:contracts[4663].agentPassport,passportId,agent:getAddress(agent),tokenIn:NATIVE_TOKEN,tokenOut:getAddress(tokenOut),amountWei,slippage,nonce,deadline,action:actionId('PROPOSE_TRADE')};
}
export function executeFields(quoteId:string,passportId:string,agent:string,tokenOut:string,amountWei:string,spendTxHash:string,nonce:string,deadline:number){
 return {audience:'passport-trade-execution-v1',chainId:4663,passportContract:contracts[4663].agentPassport,quoteId,passportId,agent:getAddress(agent),tokenIn:NATIVE_TOKEN,tokenOut:getAddress(tokenOut),amountWei,spendTxHash,nonce,deadline,action:actionId('EXECUTE_TRADE')};
}
export async function authorizeTrade(fields:ReturnType<typeof quoteFields>|ReturnType<typeof executeFields>,signature:Hex,expectedAction:'PROPOSE_TRADE'|'EXECUTE_TRADE',d:{now:number;agentOf:(id:bigint)=>Promise<Address>;authorized:(id:bigint,action:Hex,amount:bigint)=>Promise<boolean>;consume:(key:string,expiry:number)=>Promise<boolean>}){
 if(!/^[1-9]\d*$/.test(fields.passportId)||!/^\d+$/.test(fields.amountWei)||BigInt(fields.amountWei)<=0n||!/^[a-f0-9-]{36}$/.test(fields.nonce)||fields.deadline<=d.now||fields.deadline>d.now+120)throw Error('Trade signature expired or contains invalid fields.');
 if(fields.action!==actionId(expectedAction))throw Error('Trade action mismatch.');
 const signer=await recoverMessageAddress({message:canonicalMessage(fields),signature});
 const agent=await d.agentOf(BigInt(fields.passportId));
 if(signer.toLowerCase()!==agent.toLowerCase()||signer.toLowerCase()!==fields.agent.toLowerCase())throw Error('Sign with the agent wallet named by this passport.');
 if(!await d.authorized(BigInt(fields.passportId),actionId(expectedAction),0n))throw Error('Passport does not authorize '+expectedAction+' in its current state.');
 if(!await d.consume('trade:'+expectedAction+':'+agent.toLowerCase()+':'+fields.nonce,fields.deadline))throw Error('This signed trade request was already used.');
 return agent;
}

export function receiptRecordsSpend(receipt:TransactionReceipt,expected:{passportId:string;agent:string;amountWei:string}){
 if(receipt.status!=='success'||receipt.to?.toLowerCase()!==contracts[4663].agentPassport.toLowerCase()||receipt.from.toLowerCase()!==expected.agent.toLowerCase())return false;
 return receipt.logs.some(log=>{try{const decoded=decodeEventLog({abi:agentPassportAbi,data:log.data,topics:log.topics});if(decoded.eventName!=='ActionVerified')return false;const a=decoded.args as {passportId:bigint;consumer:string;action:Hex;amount:bigint};return a.passportId===BigInt(expected.passportId)&&a.consumer.toLowerCase()===expected.agent.toLowerCase()&&a.action===actionId('EXECUTE_TRADE')&&a.amount===BigInt(expected.amountWei);}catch{return false;}});
}

async function jsonResponse(response:Response){
 const raw=await response.text();
 if(raw.length>300000)throw Error('Trading provider response exceeded the size limit.');
 let data:any;try{data=JSON.parse(raw);}catch{throw Error('Trading provider returned an unreadable response.');}
 if(!response.ok){if(response.status===404)throw Error('Uniswap found no supported liquidity for this amount and token.');throw Error('Uniswap rejected the request (HTTP '+response.status+'). Check the API key, token, liquidity, and amount.');}
 return data;
}

export async function requestQuote(apiKey:string,input:{tokenOut:string;amountWei:string;agent:string;slippage:number},fetcher:typeof fetch=fetch){
 if(apiKey.length<10||!isAddress(input.tokenOut)||getAddress(input.tokenOut)===zeroAddress||!isAddress(input.agent)||!/^\d+$/.test(input.amountWei)||BigInt(input.amountWei)<=0n||input.slippage<0.1||input.slippage>5)throw Error('Invalid Uniswap quote inputs.');
 const response=await fetcher(API+'/quote',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'x-api-key':apiKey,'x-universal-router-version':'2.1.1','Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({tokenIn:NATIVE_TOKEN,tokenOut:getAddress(input.tokenOut),tokenInChainId:4663,tokenOutChainId:4663,amount:input.amountWei,type:'EXACT_INPUT',swapper:getAddress(input.agent),slippageTolerance:input.slippage,routingPreference:'BEST_PRICE',protocols:['V2','V3','V4']})});
 const data=await jsonResponse(response);
 if(data.routing!=='CLASSIC'||!data.quote||data.permitData)throw Error('Only direct Uniswap AMM routes with native ETH input are enabled.');
 const output=String(data.quote?.output?.amount??'');
 if(!/^\d+$/.test(output)||BigInt(output)<=0n)throw Error('Uniswap returned an invalid output amount.');
 return {requestId:String(data.requestId??'').slice(0,200),routing:'CLASSIC' as const,outputAmount:output,quote:data.quote};
}

export async function requestSwap(apiKey:string,quote:unknown,expected:{agent:string;amountWei:string},fetcher:typeof fetch=fetch){
 const response=await fetcher(API+'/swap',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'x-api-key':apiKey,'x-universal-router-version':'2.1.1','Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({quote,simulateTransaction:true,refreshGasPrice:true})});
 const data=await jsonResponse(response);const swap=data.swap;
 if(!swap||Number(swap.chainId)!==4663||!isAddress(swap.to)||getAddress(swap.to)!==UNISWAP_ROUTER||!isAddress(swap.from)||getAddress(swap.from)!==getAddress(expected.agent)||typeof swap.data!=='string'||!/^0x[a-fA-F0-9]+$/.test(swap.data))throw Error('Uniswap returned a transaction outside the approved Robinhood Chain router.');
 const value=String(swap.value??'0');let valueWei:bigint;try{valueWei=BigInt(value);}catch{throw Error('Uniswap returned an invalid transaction value.');}
 if(valueWei!==BigInt(expected.amountWei))throw Error('Uniswap transaction value does not match the signed amount.');
 return {to:UNISWAP_ROUTER,from:getAddress(swap.from),data:swap.data as Hex,value:valueWei.toString(),chainId:4663,quoteHash:keccak256(toHex(JSON.stringify(quote)))};
}
