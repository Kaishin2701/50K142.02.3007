import { Router } from 'express';
import { z } from 'zod';
import type { usersService } from './users.service.js';
import { createUserInput,userInput } from './users.service.js';
import { permit } from '../../middleware/auth.js';
import { controller,param } from '../../shared/http.js';
import { pageQuery } from '../../shared/validation.js';
export function usersRoutes(service:ReturnType<typeof usersService>){const r=Router();r.use(permit('Quản lý'));
 r.get('/',controller(async req=>{const v=pageQuery.extend({search:z.string().max(100).default('')}).parse(req.query);return service.list(v.search,v.limit,(v.page-1)*v.limit);}));
 r.post('/',controller(async req=>service.create(createUserInput.parse(req.body)),201));
 r.get('/:id',controller(async req=>service.get(param(req))));
 r.patch('/:id',controller(async req=>service.update(param(req),userInput.parse(req.body))));
 r.patch('/:id/status',controller(async req=>service.status(param(req),z.object({trang_thai:z.enum(['Đang hoạt động','Đã khóa'])}).strict().parse(req.body).trang_thai)));
 return r;}
