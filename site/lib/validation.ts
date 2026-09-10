import { isAddress, parseEther, zeroAddress } from 'viem';
export function ethInput(value:string){if(!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value.trim()))throw Error('Enter a non-negative ETH amount with at most 18 decimals.');return parseEther(value.trim());}
export function isEthInput(value:string){try{ethInput(value);return true;}catch{return false;}}
export function positiveId(value:string){if(!/^[1-9]\d*$/.test(value)||BigInt(value)>=2n**256n)throw Error('Enter a positive passport or task ID.');return BigInt(value);}
export function validateWrite(name:string,args:readonly unknown[],value:bigint){
 const address=(v:unknown)=>{if(typeof v!=='string'||!isAddress(v)||v.toLowerCase()===zeroAddress)throw Error('Enter a valid, non-zero agent address.');};
 const amount=(v:unknown)=>{if(typeof v!=='bigint'||v<0n||v>=2n**256n)throw Error('Invalid ETH amount.');};
 if(name==='mint'){address(args[0]);amount(args[4]);amount(args[5]);if(Number(args[3])<=Number(args[2])||Number(args[3])<=Date.now()/1000)throw Error('Expiry must be in the future and after the start.');}
 if(name==='delegate'){address(args[1]);amount(args[4]);amount(args[5]);if(Number(args[6])<=Date.now()/1000)throw Error('Choose a future expiry.');}
 if(name==='setLimits'){amount(args[1]);amount(args[2]);}
 if(name==='postTask'||name==='bookTrip'){amount(value);if(value===0n)throw Error('Payment must be greater than zero.');}
 if(name==='postTask'&&Number(args[2])<=Date.now()/1000)throw Error('Choose a future deadline.');
 if(name==='postTask'){address(args[3]);if(Number(args[2])>Date.now()/1000+90*86400)throw Error('Deadline must be within 90 days.');}
 if(name==='setConsumer')address(args[1]);
 if(name==='resolve')amount(args[1]);
 if(name==='withdraw'){address(args[0]);return;}
 if(name!=='mint'&&(typeof args[0]!=='bigint'||args[0]<=0n))throw Error('Enter a positive ID.');
}
