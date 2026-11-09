export type RecordData = Record<string, any>;
export class ApiError extends Error {
  constructor(public status:number,public code:string,message:string,public details?:{field:string;message:string}[]){super(message);}
}
export const apiBase=(import.meta.env.VITE_API_BASE_URL as string|undefined)?.replace(/\/$/,'')??'/api';
export async function api<T=RecordData>(path:string,options:{method?:string;body?:unknown;key?:string;signal?:AbortSignal}={}):Promise<T>{
 const response=await fetch(apiBase+path,{method:options.method??'GET',credentials:'include',signal:options.signal,
   headers:{...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...(options.key?{'Idempotency-Key':options.key}:{})},
   ...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new ApiError(response.status,data.error?.code??'NETWORK_ERROR',data.error?.message??'Không thể kết nối máy chủ.',data.error?.details);
 return data.data as T;
}
export async function download(path:string,name:string){
 const response=await fetch(apiBase+path,{credentials:'include'});
 if(!response.ok){const value=await response.json().catch(()=>({}));throw new ApiError(response.status,value.error?.code??'DOWNLOAD_ERROR',value.error?.message??'Không thể tải file.');}
 const blob=await response.blob(),url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const query=(values:Record<string,unknown>)=>new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)])).toString();
