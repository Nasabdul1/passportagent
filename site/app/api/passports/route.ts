import {createPublicClient,isAddress,zeroAddress} from 'viem';
import {agentPassportAbi} from '@/lib/abis';
import {contracts,robinhood} from '@/lib/config';
import {preparePassportIssue} from '@/lib/passport-api';
import {serverRobinhoodTransport} from '@/lib/server-rpc';
export const dynamic='force-dynamic';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const client=createPublicClient({chain:robinhood,transport:serverRobinhoodTransport()});
const permissionKeysAbi=[{type:'function',name:'permissionKeys',stateMutability:'view',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'',type:'bytes32[]'}]}] as const;
export function OPTIONS(){return new Response(null,{status:204,headers:cors});}
export async function POST(request:Request){
 try{const raw=await request.text();if(raw.length>16000)return reply({ok:false,error:'Request too large.'},413);const prepared=preparePassportIssue(JSON.parse(raw));return reply({ok:true,status:'signature_required',...prepared,instructions:'Send this transaction from the controller wallet on chain 4663. The API never requests or stores a private key.'});}
 catch(e){return reply({ok:false,error:e instanceof Error?e.message:'Invalid issuance request.'},400);}
}
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');if(!id||!/^[1-9]\d{0,76}$/.test(id))return reply({ok:false,error:'Pass a positive passport ID with ?id=.'},400);
 try{const passportId=BigInt(id);const [passport,permissionIds,active]=await Promise.all([
  client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'getPassport',args:[passportId]}),
  client.readContract({address:contracts[4663].agentPassport,abi:permissionKeysAbi,functionName:'permissionKeys',args:[passportId]}),
  client.readContract({address:contracts[4663].agentPassport,abi:agentPassportAbi,functionName:'isActive',args:[passportId]}),
 ]);if(!isAddress(passport.agent)||passport.agent===zeroAddress)throw Error('Passport not found.');return reply({ok:true,chainId:4663,contract:contracts[4663].agentPassport,passportId:id,active,passport:{...passport,parentId:passport.parentId.toString(),depth:Number(passport.depth),validFrom:Number(passport.validFrom),validUntil:Number(passport.validUntil),perTxLimitWei:passport.perTxLimit.toString(),dailyLimitWei:passport.dailyLimit.toString(),status:Number(passport.status),actionCount:passport.actionCount.toString()},permissionIds});}
 catch{return reply({ok:false,error:'Passport not found or mainnet RPC unavailable.'},404);}
}
