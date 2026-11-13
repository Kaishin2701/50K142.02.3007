import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDatabase } from './shared/database.js';
import { httpGateway,sepayGateway } from './modules/payments/payments.service.js';
import {fileURLToPath} from 'node:url';
async function main(){
 const env=loadEnv();const db=connectDatabase(env.DATABASE_URL,env.PG_SSL==='true');
 try{await db.query('SELECT 1');await db.query('SELECT ma_nguoi_dung FROM nguoi_dung LIMIT 0');}
 catch(error){await db.close();throw error;}
 const app=createApp({db,origins:env.FRONTEND_ORIGINS.split(',').map(v=>v.trim()),secureCookies:env.NODE_ENV==='production',
   sessionHours:env.SESSION_HOURS,gateway:env.QR_PROVIDER==='sepay'?sepayGateway(env.SEPAY_BANK,env.SEPAY_ACCOUNT_NUMBER):httpGateway(env.QR_PROVIDER==='http'?env.QR_GATEWAY_URL:undefined,env.QR_GATEWAY_TOKEN),
   webhookSecret:env.QR_WEBHOOK_SECRET,autoConfirmQr:env.QR_AUTO_CONFIRM,pdfFontPath:env.PDF_FONT_PATH,logErrors:true,trustProxy:env.TRUST_PROXY,staticDir:fileURLToPath(new URL('../../frontend/dist/',import.meta.url)),
   sepay:env.QR_PROVIDER==='sepay'&&env.SEPAY_WEBHOOK_API_KEY&&env.SEPAY_ACCOUNT_NUMBER?{secret:env.SEPAY_WEBHOOK_API_KEY,account:env.SEPAY_ACCOUNT_NUMBER}:undefined});
 const server=app.listen(env.PORT,env.HOST,()=>console.log(`Me Ca Phe API: http://${env.HOST}:${env.PORT}/api`));
 const stop=()=>{server.close(()=>{void db.close().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),10000).unref();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
main().catch(error=>{console.error('Không thể khởi động BackEnd. Kiểm tra .env, DATABASE_URL, kết nối PostgreSQL và chạy npm run migrate trước.');
 if(error?.issues)console.error(error.issues.map((i:any)=>`${i.path.join('.')}: ${i.message}`).join('\n'));process.exitCode=1;});
