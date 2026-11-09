import { createHash } from 'node:crypto';
import { first,type Database } from './database.js';
import { check } from './errors.js';
const digest=(input:unknown)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
export async function previousRequest(db:Database,key:string|undefined,user:string,operation:string,input:unknown){
 if(!key)return null;const old=await first(db,'SELECT * FROM khoa_yeu_cau_api WHERE khoa=$1',[key]);if(!old)return null;
 check(old.ma_nguoi_dung===user&&old.thao_tac===operation&&old.noi_dung_bam===digest(input),'Idempotency-Key đã được dùng cho yêu cầu khác.','IDEMPOTENCY_CONFLICT');return old.ma_tai_nguyen as string;
}
export async function rememberRequest(db:Database,key:string|undefined,user:string,operation:string,input:unknown,resource:string){
 if(key)await db.query('INSERT INTO khoa_yeu_cau_api VALUES($1,$2,$3,$4,$5,now())',[key,user,operation,digest(input),resource]);
}
