import { Router } from 'express';
import { z } from 'zod';
import { revenueQuery,type reportsService } from './reports.service.js';
import { permit } from '../../middleware/auth.js';
import { controller } from '../../shared/http.js';
export function reportsRoutes(service:ReturnType<typeof reportsService>){const r=Router();r.use(permit('Quản lý'));
 r.get('/revenue',controller(async req=>service.revenue(revenueQuery.parse(req.query))));
 r.get('/revenue/export',controller(async(req,res)=>{
   const v=revenueQuery.extend({format:z.enum(['xlsx','pdf'])}).parse(req.query);const {format,...filters}=v;
   const buffer=await service.export(filters,format);
   res.type(format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf');
   res.setHeader('Content-Disposition',`attachment; filename="me-ca-phe-${v.period}-${v.date}.${format}"`);res.send(buffer);
 }));return r;}
