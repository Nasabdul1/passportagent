import {fallback,http} from 'viem';

export const robinhoodRpcUrls=[
  'https://robinhood-rpc.publicnode.com',
  'https://rpc.mainnet.chain.robinhood.com',
] as const;

export function robinhoodTransport(timeout=12000,preferredUrl?:string){
  const urls=preferredUrl?.startsWith('https://')
    ? [preferredUrl,...robinhoodRpcUrls.filter((url)=>url!==preferredUrl)]
    : [...robinhoodRpcUrls];
  return fallback(
    urls.map((url)=>http(url,{timeout,retryCount:1})),
    {rank:true,retryCount:1},
  );
}
