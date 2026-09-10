import vinext from 'vinext';
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {sites} from './build/sites-vite-plugin';
export default defineConfig(async({command})=>{
 process.env.CLOUDFLARE_CF_FETCH_ENABLED='false';process.env.WRANGLER_SEND_METRICS='false';process.env.WRANGLER_WRITE_LOGS='false';process.env.WRANGLER_REGISTRY_PATH='.wrangler/dev-registry';
 const {cloudflare}=await import('@cloudflare/vite-plugin');
 return {resolve:{dedupe:['react','react-dom'],alias:command==='serve'?[{find:'cloudflare:workers',replacement:fileURLToPath(new URL('./lib/local-env.ts',import.meta.url))}]:[]},plugins:[vinext(),sites(),...(command==='build'?[cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,config:{main:'vinext/server/fetch-handler',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'passport-verifier',database_id:'00000000-0000-4000-8000-000000000000'}]}})]:[])]};
});