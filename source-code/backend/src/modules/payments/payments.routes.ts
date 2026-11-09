import { Router } from 'express';
import { z } from 'zod';
import type { paymentsService } from './payments.service.js';
import { permit } from '../../middleware/auth.js';
import { controller,param } from '../../shared/http.js';
import { id,money } from '../../shared/validation.js';
export function paymentsRoutes(service:ReturnType<typeof paymentsService>){const r=Router();r.use(permit('Nhân viên'));
 r.post('/cash',controller(async req=>{const v=z.object({ma_don:id,so_tien_nhan:money}).strict().parse(req.body);return service.cash(req.actor!,v.ma_don,v.so_tien_nhan);}));
 r.post('/qr',controller(async req=>service.qr(req.actor!,z.object({ma_don:id}).strict().parse(req.body).ma_don),201));
 r.post('/:id/reconcile',controller(async req=>service.reconcile(req.actor!,param(req))));return r;}
