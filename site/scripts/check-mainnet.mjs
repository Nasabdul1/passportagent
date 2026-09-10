import { createPublicClient, http, parseAbi } from 'viem';
import { readFileSync } from 'node:fs';
const client = createPublicClient({ transport: http('https://rpc.mainnet.chain.robinhood.com', { timeout: 15000, retryCount: 1 }) });
const chainId = await client.getChainId();
if (chainId !== 4663) throw Error('Unexpected chain');
const entries = [['AgentPassport','0x44b6D2C7490c8E6060610F983c529c3c3910036f'],['TravelBooking','0xE87a1Bd908935014fBDD07DEd3B9217860F41E8F'],['AgentMarket','0xEE70e02AE035659e2C10Afb2162e3094a9a65Bec']];
for (const [name,address] of entries) {
 const code=await client.getCode({address});
 if (!code || code==='0x') throw Error(name+' has no bytecode');
 const artifact=JSON.parse(readFileSync(new URL('../../out/'+name+'.sol/'+name+'.json',import.meta.url)));
 let expected=artifact.deployedBytecode.object.replace(/^0x/,'').toLowerCase();
 let actual=code.slice(2).toLowerCase();
 for(const refs of Object.values(artifact.deployedBytecode.immutableReferences??{})) for(const r of refs){const start=r.start*2,end=start+r.length*2;expected=expected.slice(0,start)+'0'.repeat(r.length*2)+expected.slice(end);actual=actual.slice(0,start)+'0'.repeat(r.length*2)+actual.slice(end);}
 if(expected!==actual)throw Error(name+' deployed bytecode differs from compiled artifact');
 if(name!=='AgentPassport') {
  const parent=await client.readContract({address,abi:parseAbi(['function passport() view returns (address)']),functionName:'passport'});
  if(parent.toLowerCase()!==entries[0][1].toLowerCase())throw Error(name+' points to wrong passport');
 }
 console.log(name+': deployed bytecode matches local artifact');
}
const name=await client.readContract({address:entries[0][1],abi:parseAbi(['function name() view returns (string)']),functionName:'name'});
const tasks=await client.readContract({address:entries[2][1],abi:parseAbi(['function taskCount() view returns (uint256)']),functionName:'taskCount'});
console.log(JSON.stringify({chainId,name,tasks:String(tasks),readOnly:true}));
