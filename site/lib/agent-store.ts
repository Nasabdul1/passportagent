import {env} from 'cloudflare:workers';
export const agentStore=()=>env.DB;
