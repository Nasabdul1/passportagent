import {agentStore} from '@/lib/agent-store';
import {validateAgent} from '@/lib/agent-spec';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return reply({error:'Sign in to save and load your agents.'},401);
 try{const result=await agentStore().prepare('SELECT id,spec,revision,updated_at FROM agent_configs WHERE owner=? ORDER BY updated_at DESC LIMIT 100').bind(owner).all();return reply({agents:result.results.map(row=>({...row,spec:JSON.parse(String(row.spec))}))});}catch{return reply({error:'Agent storage is unavailable. Please retry.'},503);}
}
export async function POST(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');if(!owner)return reply({error:'Sign in to save your agent.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origin mismatch.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required.'},415);
 let data:{id?:string;revision?:number;spec:unknown};
 try{const raw=await request.text();if(raw.length>20000)return reply({error:'Configuration too large.'},413);data=JSON.parse(raw);data.spec=validateAgent(data.spec);if(data.id&&(!/^[a-f0-9-]{36}$/.test(data.id)||!Number.isInteger(data.revision)))throw Error('Invalid saved revision.');}catch(e){return reply({error:e instanceof Error?e.message:'Invalid configuration.'},400);}
 try{
  const db=agentStore(),now=Date.now();
  if(data.id){const result=await db.prepare('UPDATE agent_configs SET spec=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(data.spec),now,data.id,owner,data.revision).run();if(result.meta.changes!==1)return reply({error:'This agent changed elsewhere or is unavailable. Reload your saved agents before editing.'},409);return reply({id:data.id,revision:Number(data.revision)+1});}
  const id=crypto.randomUUID();const result=await db.prepare('INSERT INTO agent_configs (id,owner,spec,revision,updated_at) SELECT ?,?,?,1,? WHERE (SELECT count(*) FROM agent_configs WHERE owner=?) < 100').bind(id,owner,JSON.stringify(data.spec),now,owner).run();if(result.meta.changes!==1)return reply({error:'Agent limit reached (100). Edit an existing agent.'},409);return reply({id,revision:1},201);
 }catch{return reply({error:'Could not save. Your changes are still in the editor.'},503);}
}
