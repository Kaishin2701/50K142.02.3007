import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { migrate } from '../src/shared/migrations.js';
import { createApp } from '../src/app.js';
import { httpGateway } from '../src/modules/payments/payments.service.js';
test('local PostgreSQL preserves committed data across close and reopen',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'me-cafe-persistence-'));
 let db=await embeddedDatabase(directory);
 try{
  await migrate(db,fileURLToPath(new URL('../../database/',import.meta.url)));
  await db.query("INSERT INTO nguyen_lieu(ten_nguyen_lieu,don_vi_tinh,ton_ly_thuyet) VALUES('Persistence test','ly',7)");
  await db.close();db=await embeddedDatabase(directory);
  assert.equal(Number((await db.query("SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ten_nguyen_lieu='Persistence test'")).rows[0].ton_ly_thuyet),7);
  const app=createApp({db,origins:[],gateway:httpGateway(),staticDir:fileURLToPath(new URL('../../frontend/dist/',import.meta.url))});
  assert.equal((await request(app).get('/api/health')).status,200);
  assert.match((await request(app).get('/')).text,/<div id="root"><\/div>/);
  assert.equal((await request(app).get('/api/users')).status,401);
 }finally{await db.close();await rm(directory,{recursive:true,force:true});}
});
