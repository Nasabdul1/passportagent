import {encodeFunctionData,getAddress,isAddress,keccak256,toHex,zeroAddress,type Address,type Hex} from 'viem';
import {agentPassportAbi} from './abis';
import {contracts} from './config';

export const PASSPORT_CHAIN_ID=4663 as const;
export const AGENT_API_AUDIENCE='passport-agent-api';
const UINT64_MAX=(1n<<64n)-1n;
const UINT256_MAX=(1n<<256n)-1n;

export type PassportIssueRequest={
 agent:string;purpose:string;validFrom:number;validUntil:number;
 perTxLimitWei:string;dailyLimitWei:string;permissions:string[];
};

function decimal(value:unknown,label:string,max:bigint){
 if(typeof value!=='string'||!/^\d{1,78}$/.test(value))throw Error(`${label} must be a decimal wei string.`);
 const parsed=BigInt(value);if(parsed>max)throw Error(`${label} is too large.`);return parsed;
}

export function preparePassportIssue(input:unknown,now=Math.floor(Date.now()/1000)){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected a JSON object.');
 const x=input as Record<string,unknown>;
 if(typeof x.agent!=='string'||!isAddress(x.agent)||getAddress(x.agent)===zeroAddress)throw Error('Enter a valid non-zero agent wallet address.');
 if(typeof x.purpose!=='string'||!x.purpose.trim()||x.purpose.trim().length>240)throw Error('Purpose must contain 1–240 characters.');
 if(!Number.isSafeInteger(x.validFrom)||!Number.isSafeInteger(x.validUntil))throw Error('Validity values must be Unix seconds.');
 const validFrom=BigInt(x.validFrom as number),validUntil=BigInt(x.validUntil as number);
 if(validFrom<BigInt(now-300)||validFrom>UINT64_MAX)throw Error('validFrom must be current or future Unix time.');
 if(validUntil<=validFrom||validUntil>UINT64_MAX)throw Error('validUntil must be after validFrom.');
 const perTxLimit=decimal(x.perTxLimitWei,'perTxLimitWei',UINT256_MAX);
 const dailyLimit=decimal(x.dailyLimitWei,'dailyLimitWei',UINT256_MAX);
 if(dailyLimit!==0n&&(perTxLimit===0n||perTxLimit>dailyLimit))throw Error('A finite daily limit requires a finite per-transaction limit no greater than it.');
 if(!Array.isArray(x.permissions)||x.permissions.length<1||x.permissions.length>32)throw Error('Choose 1–32 permissions.');
 const permissions=x.permissions.map((value)=>{
  if(typeof value!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(value))throw Error('Permissions must use 1–64 uppercase letters, numbers, or underscores.');
  return value;
 });
 if(new Set(permissions).size!==permissions.length)throw Error('Permissions must be unique.');
 const actionIds=permissions.map((action)=>keccak256(toHex(action)) as Hex);
 const args=[getAddress(x.agent as string),x.purpose.trim(),validFrom,validUntil,perTxLimit,dailyLimit,actionIds] as const;
 return {
  chainId:PASSPORT_CHAIN_ID,
  contract:contracts[PASSPORT_CHAIN_ID].agentPassport,
  functionName:'mint' as const,
  arguments:{agent:args[0],purpose:args[1],validFrom:args[2].toString(),validUntil:args[3].toString(),perTxLimitWei:args[4].toString(),dailyLimitWei:args[5].toString(),actionIds:args[6]},
  permissions:permissions.map((name,index)=>({name,id:actionIds[index]})),
  transaction:{
   chainId:PASSPORT_CHAIN_ID,
   to:contracts[PASSPORT_CHAIN_ID].agentPassport,
   data:encodeFunctionData({abi:agentPassportAbi,functionName:'mint',args}),
   value:'0x0' as const,
  },
 };
}
