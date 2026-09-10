const encode=new TextEncoder();
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const un64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function key(secret:string){if(!/^[a-f0-9]{64}$/i.test(secret))throw Error('Credential vault is not configured.');return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(secret:string,owner:string,provider:string,value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const result=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode.encode(JSON.stringify([owner,provider]))},await key(secret),encode.encode(value));return b64(iv)+'.'+b64(new Uint8Array(result));}
export async function unseal(secret:string,owner:string,provider:string,value:string){const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv),additionalData:encode.encode(JSON.stringify([owner,provider]))},await key(secret),un64(data)));}
