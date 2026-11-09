import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { connectDatabase } from '../shared/database.js';
import { migrate } from '../shared/migrations.js';
const env=loadEnv();const db=connectDatabase(env.DATABASE_URL,env.PG_SSL==='true');
try{await migrate(db,fileURLToPath(new URL('../../../database/',import.meta.url)));console.log('Database migrations applied.');}
finally{await db.close();}
