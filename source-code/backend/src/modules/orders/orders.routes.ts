import { Router } from 'express';
import { orderInput,orderQuery,type ordersService } from './orders.service.js';
import { permit } from '../../middleware/auth.js';
import { controller,param } from '../../shared/http.js';
import { id } from '../../shared/validation.js';
export function ordersRoutes(service:ReturnType<typeof ordersService>){const r=Router();
 r.get('/history',permit('Quản lý'),controller(async req=>service.list(orderQuery.parse(req.query),true)));
 r.get('/',controller(async req=>service.list(orderQuery.parse(req.query),false)));
 r.post('/drafts',permit('Nhân viên'),controller(async req=>service.create(req.actor!,orderInput.parse(req.body),false,id.parse(req.get('Idempotency-Key'))),201));
 r.post('/',permit('Nhân viên'),controller(async req=>service.create(req.actor!,orderInput.parse(req.body),true,id.parse(req.get('Idempotency-Key'))),201));
 r.get('/:id',controller(async req=>service.get(req.actor!,param(req))));
 r.get('/:id/invoice.pdf',controller(async(req,res)=>{const buffer=await service.invoice(req.actor!,param(req));res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="invoice-${param(req)}.pdf"`);res.send(buffer);}));
 r.get('/:id/preparation-ticket',controller(async req=>service.ticket(req.actor!,param(req))));
 r.post('/:id/confirm',permit('Nhân viên'),controller(async req=>service.confirm(req.actor!,param(req))));
 r.delete('/:id',permit('Nhân viên'),controller(async req=>service.cancel(req.actor!,param(req))));
 r.post('/:id/start-preparing',permit('Nhân viên'),controller(async req=>service.phase(req.actor!,param(req),'Bắt đầu pha chế')));
 r.post('/:id/complete',permit('Nhân viên'),controller(async req=>service.phase(req.actor!,param(req),'Hoàn tất pha chế')));return r;}
