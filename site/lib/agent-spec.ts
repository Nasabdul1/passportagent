export const providers = ['OpenAI','Anthropic','Google Gemini','OpenRouter','Groq','xAI','Custom endpoint'] as const;
export const tools = [
 {id:'chain-read',name:'Robinhood Chain reads',action:'READ_CHAIN',status:'Signed tool test available',description:'Read the agent wallet balance through a Passport-gated API.'},
 {id:'market-data',name:'Market research API',action:'READ_MARKET_DATA',status:'Configuration only',description:'Connect a market-data service for quotes and research.'},
 {id:'trade-proposal',name:'Trading proposals',action:'PROPOSE_TRADE',status:'Live in Trade Studio',description:'Request a signed Uniswap quote for review before any wallet transaction.'},
 {id:'custom-api',name:'Custom API',action:'CALL_CUSTOM_API',status:'Adapter required',description:'Requires a service-specific adapter and server-held credentials.'},
] as const;
export type AgentSpec={name:string;instructions:string;provider:string;model:string;passportId:string;tools:string[];maxSteps:number;temperature:number;approval:'every-action';mode:'draft'};
export const emptyAgent:AgentSpec={name:'',instructions:'',provider:'OpenAI',model:'',passportId:'',tools:['chain-read'],maxSteps:5,temperature:0.2,approval:'every-action',mode:'draft'};
export function validateAgent(input:unknown):AgentSpec {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Agent configuration must be an object.');
 const x=input as Record<string,unknown>;
 const str=(key:string,max:number)=>{const v=x[key];if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Enter a valid ${key} (maximum ${max} characters).`);return v.trim();};
 const name=str('name',80),instructions=str('instructions',8000),model=str('model',160),passportId=str('passportId',77),provider=str('provider',40);
 if(!/^[1-9]\d*$/.test(passportId)||BigInt(passportId)>=2n**256n)throw Error('Enter a valid passport ID.');
 if(!providers.includes(provider as typeof providers[number]))throw Error('Choose a listed provider.');
 if(!Array.isArray(x.tools)||x.tools.length<1||x.tools.length>tools.length||x.tools.some(id=>!tools.some(t=>t.id===id)))throw Error('Choose supported tools.');
 if(!Number.isInteger(x.maxSteps)||Number(x.maxSteps)<1||Number(x.maxSteps)>20)throw Error('Steps must be between 1 and 20.');
 if(typeof x.temperature!=='number'||!Number.isFinite(x.temperature)||x.temperature<0||x.temperature>1)throw Error('Creativity must be between 0 and 1.');
 if(x.approval!=='every-action'||x.mode!=='draft')throw Error('Live execution is not enabled for this release.');
 return {name,instructions,provider,model,passportId,tools:[...new Set(x.tools as string[])],maxSteps:Number(x.maxSteps),temperature:x.temperature,approval:'every-action',mode:'draft'};
}
