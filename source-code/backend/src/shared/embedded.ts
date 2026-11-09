import { PGlite } from '@electric-sql/pglite';
import type { Database } from './database.js';
/** Explicit local-development database. Production always uses PostgreSQL via pg. */
export async function embeddedDatabase(directory?:string):Promise<Database&{close():Promise<void>}>{
 const pg=new PGlite(directory);await pg.waitReady;
 const wrap=(connection:any):Database=>({query:async(text,values=[])=>values.length?connection.query(text,values):(await connection.exec(text)).at(-1)??{rows:[]},
   transaction:work=>connection.transaction((tx:any)=>work(wrap(tx)))});
 return {...wrap(pg),close:()=>pg.close()};
}
