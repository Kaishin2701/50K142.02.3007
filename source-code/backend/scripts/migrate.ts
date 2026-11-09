import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/shared/database.js';
import { migrate } from '../src/shared/migrations.js';
const env=loadEnv();const db=connectDatabase(env.DATABASE_URL,env.PG_SSL==='true');
try{await migrate(db,fileURLToPath(new URL('../../database/',import.meta.url)));console.log('Đã áp dụng migrations và chính sách truy cập.');}
finally{await db.close();}
