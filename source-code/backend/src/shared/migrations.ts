import { readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database } from './database.js';
export async function migrate(db:Database,root:string){
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
 for(const folder of ['migrations','policies'])for(const file of (await readdir(join(root,folder))).filter(f=>f.endsWith('.sql')).sort()){
   const name=`${folder}/${file}`,sql=await readFile(join(root,folder,file),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
   await db.transaction(async tx=>{
     await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
     const old=(await tx.query('SELECT checksum FROM schema_migrations WHERE name=$1',[name])).rows[0];
     if(old){if(old.checksum!==checksum)throw new Error(`Migration ${name} đã thay đổi sau khi áp dụng.`);return;}
     await tx.query(sql);await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
   });
 }
}
