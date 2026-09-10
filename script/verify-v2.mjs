import {createPublicClient,http,parseAbi} from '../site/node_modules/viem/_esm/index.js';
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(new URL('../broadcast/DeployV2.s.sol/4663/run-latest.json',import.meta.url),'utf8'));
const client=createPublicClient({transport:http('https://rpc.mainnet.chain.robinhood.com',{timeout:15000,retryCount:1})});
if(await client.getChainId()!==4663)throw Error('Wrong chain');
let cost=0n;
for(const tx of report.transactions){
 const receipt=await client.getTransactionReceipt({hash:tx.hash});
 if(receipt.status!=='success'||receipt.contractAddress?.toLowerCase()!==tx.contractAddress.toLowerCase())throw Error('Deployment receipt mismatch');
 const artifact=JSON.parse(readFileSync(new URL(`../out/${tx.contractName}.sol/${tx.contractName}.json`,import.meta.url),'utf8'));
 const code=await client.getCode({address:tx.contractAddress});if(!code)throw Error('No contract code');
 let actual=code.replace(/^0x/,'').toLowerCase(),expected=artifact.deployedBytecode.object.replace(/^0x/,'').toLowerCase();
 for(const refs of Object.values(artifact.deployedBytecode.immutableReferences??{}))for(const r of refs){const a=r.start*2,b=a+r.length*2;actual=actual.slice(0,a)+'0'.repeat(b-a)+actual.slice(b);expected=expected.slice(0,a)+'0'.repeat(b-a)+expected.slice(b);}
 if(actual!==expected)throw Error('Runtime bytecode differs: '+tx.contractName);
 cost+=receipt.gasUsed*receipt.effectiveGasPrice;
 console.log(JSON.stringify({name:tx.contractName,address:tx.contractAddress,transaction:tx.hash,block:String(receipt.blockNumber),bytecodeMatches:true}));
}
const passport=report.transactions.find(t=>t.contractName==='AgentPassportV2').contractAddress;
const market=report.transactions.find(t=>t.contractName==='AgentMarketV2').contractAddress;
const bound=await client.readContract({address:market,abi:parseAbi(['function passport() view returns(address)']),functionName:'passport'});
if(bound.toLowerCase()!==passport.toLowerCase())throw Error('Market bound to wrong passport');
console.log(JSON.stringify({chainId:4663,marketBindingVerified:true,receiptGasCostWei:String(cost)}));
