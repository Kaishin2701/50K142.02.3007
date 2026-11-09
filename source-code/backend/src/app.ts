import express,{type ErrorRequestHandler} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import type { Database } from './shared/database.js';
import { AppError,check } from './shared/errors.js';
import { controller } from './shared/http.js';
import { authenticate } from './middleware/auth.js';
import { authService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersService } from './modules/users/users.service.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { menuService } from './modules/menu/menu.service.js';
import { menuRoutes } from './modules/menu/menu.routes.js';
import { ordersService } from './modules/orders/orders.service.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { paymentsService,type Gateway } from './modules/payments/payments.service.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { shiftsService } from './modules/shifts/shifts.service.js';
import { shiftsRoutes } from './modules/shifts/shifts.routes.js';
import { inventoryService } from './modules/inventory/inventory.service.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { reportsService } from './modules/reports/reports.service.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { pageQuery } from './shared/validation.js';
import { notificationList,notificationRead } from './shared/notifications.js';
import { eventStream } from './shared/events.js';
export type Options={db:Database;origins:string[];secureCookies?:boolean;sessionHours?:number;gateway:Gateway;webhookSecret?:string;pdfFontPath?:string;logErrors?:boolean;staticDir?:string;trustProxy?:number;sepay?:{secret:string;account:string}};
export function createApp(options:Options){
 const {db}=options;const app=express();const hours=options.sessionHours??12;
 app.disable('x-powered-by');if(options.trustProxy)app.set('trust proxy',options.trustProxy);
 app.use(helmet({contentSecurityPolicy:{directives:{imgSrc:["'self'",'data:','https://vietqr.app']}}}));
 app.use(cors({origin:(origin,done)=>done(null,!origin||options.origins.includes(origin)),credentials:true}));
 app.use('/api',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 app.use(rateLimit({windowMs:60000,limit:300,standardHeaders:true,legacyHeaders:false,message:{error:{code:'RATE_LIMIT',message:'Quá nhiều yêu cầu. Vui lòng thử lại sau.'}}}));
 const payments=paymentsService(db,options.gateway,options.webhookSecret);
 app.post('/api/payments/sepay/webhook',express.raw({type:'application/json',limit:'128kb'}),controller(async(req,res)=>{
   check(options.sepay,'Chưa cấu hình SePay.','PAYMENT_NOT_CONFIGURED',503);check(Buffer.isBuffer(req.body),'Yêu cầu webhook phải là application/json.','INVALID_WEBHOOK',400);
   await payments.sepayWebhook(req.body,req.get('Authorization'),options.sepay);res.json({success:true});
 }));
 app.post('/api/payments/webhook',express.raw({type:'application/json',limit:'128kb'}),controller(async req=>{
   check(Buffer.isBuffer(req.body),'Yêu cầu webhook phải là application/json.','INVALID_WEBHOOK',400);
   return payments.webhook(req.body,req.get('X-Webhook-Signature'));
 }));
 app.use(express.json({limit:'256kb'}));app.use(cookieParser());
 app.use((req,_res,next)=>{
   if(!['GET','HEAD','OPTIONS'].includes(req.method)){
     const origin=req.get('Origin');const bearer=req.get('Authorization')?.startsWith('Bearer ');
     if((origin&&!options.origins.includes(origin)) || (!bearer&&req.cookies?.me_session&&!origin))
       return next(new AppError(403,'INVALID_ORIGIN','Nguồn yêu cầu không hợp lệ.'));
   }next();
 });
 app.get('/api/health',async(_req,res)=>{try{await db.query('SELECT 1');res.json({data:{status:'ok'}});}catch{res.status(503).json({error:{code:'DATABASE_UNAVAILABLE',message:'Không thể kết nối cơ sở dữ liệu.'}});}});
 const auth=authService(db,hours);app.use('/api/auth',authRoutes(auth,options.secureCookies??false,hours));
 app.use('/api',authenticate(auth));
 app.use('/api/users',usersRoutes(usersService(db)));
 app.use('/api/menu',menuRoutes(menuService(db)));
 app.use('/api/orders',ordersRoutes(ordersService(db,options.pdfFontPath)));
 app.use('/api/payments',paymentsRoutes(payments));
 app.use('/api/shifts',shiftsRoutes(shiftsService(db)));
 app.use('/api/inventory',inventoryRoutes(inventoryService(db)));
 app.use('/api/reports',reportsRoutes(reportsService(db,options.pdfFontPath)));
 app.get('/api/events',eventStream(db,auth));
 app.get('/api/notifications',controller(async req=>{const v=pageQuery.parse(req.query);return notificationList(db,req.actor!.id,v.limit,(v.page-1)*v.limit);}));
 app.post('/api/notifications/:id/read',controller(async req=>{
   const {id}=await import('./shared/validation.js');const notification=id.parse(req.params.id);
   const result=await notificationRead(db,req.actor!.id,notification);
   check(result,'Không tìm thấy thông báo.','NOT_FOUND',404);return result;
 }));
 if(options.staticDir)app.use(express.static(options.staticDir,{index:'index.html',maxAge:'1h',setHeaders:(res,path)=>{
   if(path.endsWith('index.html'))res.setHeader('Cache-Control','no-cache');
 }}));
 app.use((_req,_res,next)=>next(new AppError(404,'NOT_FOUND','Không tìm thấy API.')));
 const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{
   if(error instanceof ZodError){res.status(422).json({error:{code:'VALIDATION_ERROR',message:'Dữ liệu không hợp lệ.',details:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))}});return;}
   if(error instanceof AppError){res.status(error.status).json({error:{code:error.code,message:error.message}});return;}
   if(error instanceof SyntaxError){res.status(400).json({error:{code:'INVALID_JSON',message:'Dữ liệu JSON không hợp lệ.'}});return;}
   const postgres:Record<string,[number,string,string]>={
     '23505':[409,'DUPLICATE_DATA','Dữ liệu bị trùng hoặc thao tác đã được ghi nhận.'],
     '23503':[409,'INVALID_REFERENCE','Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng.'],
     '23514':[422,'CONSTRAINT_VIOLATION','Dữ liệu vi phạm quy tắc nghiệp vụ.'],
     '22003':[422,'NUMERIC_OVERFLOW','Giá trị số vượt giới hạn cho phép.'],
     '40001':[409,'CONCURRENT_CHANGE','Dữ liệu vừa thay đổi. Vui lòng thử lại.'],
   };
   if(postgres[error?.code]){const [status,code,message]=postgres[error.code];res.status(status).json({error:{code,message}});return;}
   if(error?.type==='entity.too.large'){res.status(413).json({error:{code:'BODY_TOO_LARGE',message:'Dữ liệu gửi lên quá lớn.'}});return;}
   if(options.logErrors)console.error('API error:',error instanceof Error?error.message:'Unknown error');
   res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Không thể xử lý yêu cầu. Vui lòng thử lại.'}});
 };app.use(errorHandler);return app;
}
