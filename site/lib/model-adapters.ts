export const executableProviders=['OpenAI','Anthropic','Google Gemini','OpenRouter','Groq','xAI'] as const;
export const credentialProviders=[...executableProviders,'Uniswap Trading API'] as const;
export async function callModel(provider:string,apiKey:string,model:string,instructions:string,input:string,fetcher:typeof fetch=fetch){
 let url:string;let headers:Record<string,string>={'Content-Type':'application/json'};let body:unknown;
 if(provider==='OpenAI'){url='https://api.openai.com/v1/responses';headers.Authorization='Bearer '+apiKey;body={model,instructions,input,max_output_tokens:1500,store:false};}
 else if(provider==='Anthropic'){url='https://api.anthropic.com/v1/messages';headers['x-api-key']=apiKey;headers['anthropic-version']='2023-06-01';body={model,system:instructions,messages:[{role:'user',content:input}],max_tokens:1500};}
 else if(provider==='Google Gemini'){url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';headers['x-goog-api-key']=apiKey;body={system_instruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:input}]}],generationConfig:{maxOutputTokens:1500}};}
 else {const urls:Record<string,string>={OpenRouter:'https://openrouter.ai/api/v1/chat/completions',Groq:'https://api.groq.com/openai/v1/chat/completions',xAI:'https://api.x.ai/v1/chat/completions'};url=urls[provider];if(!url)throw Error('This provider requires a supported adapter.');headers.Authorization='Bearer '+apiKey;body={model,messages:[{role:'system',content:instructions},{role:'user',content:input}],max_tokens:1500};}
 const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Provider rejected the request (HTTP '+response.status+'). Check model access, billing and credentials.');
 const reader=response.body?.getReader();if(!reader)throw Error('Provider returned no response.');let raw='',bytes=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>262144){await reader.cancel();throw Error('Provider response exceeded the size limit.');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 const data=JSON.parse(raw);let text='';
 if(provider==='OpenAI')text=(data.output??[]).flatMap((x:any)=>x.content??[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('\n');
 else if(provider==='Anthropic')text=(data.content??[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n');
 else if(provider==='Google Gemini')text=(data.candidates?.[0]?.content?.parts??[]).map((x:any)=>x.text??'').join('\n');
 else text=data.choices?.[0]?.message?.content??'';
 if(typeof text!=='string'||!text)throw Error('Provider returned no text output.');return {text:text.slice(0,32000),providerRequestId:String(data.id??data.responseId??'').slice(0,200)};
}
