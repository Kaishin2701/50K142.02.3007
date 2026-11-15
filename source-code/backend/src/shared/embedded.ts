import { PGlite } from '@electric-sql/pglite';
import type { Database } from './database.js';
/** Explicit local-development database. Production always uses PostgreSQL via pg. */
export async function embeddedDatabase(directory?:string):Promise<Database&{close():Promise<void>}>{
 const startupDiagnostics:string[]=[];
 let initializing=true;
 let pg:PGlite;
 try {
   pg=new PGlite(directory,{onStderr:text=>{if(initializing)startupDiagnostics.push(text);return false;}});
   await pg.waitReady;
 } catch(error) {
   const rootCause=error instanceof Error?error.message:String(error);
   const details=startupDiagnostics.map(text=>text.trim()).filter(Boolean).join('\n');
   throw new Error(
     `Failed to initialize embedded PostgreSQL${directory?` at "${directory}"`:''}: ${rootCause}${details?`\nPostgreSQL startup diagnostics:\n${details}`:''}`,
     {cause:error},
   );
 } finally {
   initializing=false;
 }
 const wrap=(connection:any):Database=>({query:async(text,values=[])=>values.length?connection.query(text,values):(await connection.exec(text)).at(-1)??{rows:[]},
   transaction:work=>connection.transaction((tx:any)=>work(wrap(tx)))});
 return {...wrap(pg),close:()=>pg.close()};
}
