import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { authService } from './auth.service.js';
import { authenticate } from '../../middleware/auth.js';
import { controller } from '../../shared/http.js';
export function authRoutes(service:ReturnType<typeof authService>,secure:boolean,hours:number){
 const router=Router();
 router.post('/login',rateLimit({windowMs:15*60000,limit:20,standardHeaders:true,legacyHeaders:false,message:{error:{code:'LOGIN_RATE_LIMIT',message:'Đăng nhập quá nhiều lần. Vui lòng thử lại sau.'}}}),controller(async(req,res)=>{
   const v=z.object({ten_dang_nhap:z.string().trim().min(1).max(50),mat_khau:z.string().min(1).max(128)}).strict().parse(req.body);
   const result=await service.login(v.ten_dang_nhap,v.mat_khau);
   res.cookie('me_session',result.token,{httpOnly:true,secure,sameSite:'lax',maxAge:hours*3600000,path:'/'});return result.user;
 }));
 router.use(authenticate(service));router.get('/me',controller(async req=>req.currentUser));
 router.post('/logout',controller(async(req,res)=>{await service.logout(req.actor!);res.clearCookie('me_session',{httpOnly:true,secure,sameSite:'lax',path:'/'});return{da_dang_xuat:true};}));
 return router;
}
