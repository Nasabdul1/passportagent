import {env} from 'cloudflare:workers';
import {robinhoodTransport} from './rpc';

export function serverRobinhoodTransport(timeout=12000){
  const preferred=(env as unknown as Record<string,string>).ROBINHOOD_RPC_URL?.trim();
  return robinhoodTransport(timeout,preferred);
}
