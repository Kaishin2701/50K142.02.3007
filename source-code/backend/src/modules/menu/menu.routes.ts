import { Router } from 'express';
import { menuInput,recipeInput,type menuService } from './menu.service.js';
import { permit } from '../../middleware/auth.js';
import { controller,param } from '../../shared/http.js';
export function menuRoutes(service:ReturnType<typeof menuService>){const r=Router();
 r.get('/',controller(async req=>service.list(req.actor!.role==='Quản lý')));r.get('/:id/recipe',controller(async req=>service.recipe(param(req))));
 r.post('/',permit('Quản lý'),controller(async req=>service.save(null,menuInput.parse(req.body)),201));
 r.patch('/:id',permit('Quản lý'),controller(async req=>service.save(param(req),menuInput.parse(req.body))));
 r.put('/:id/recipe',permit('Quản lý'),controller(async req=>service.recipeSave(param(req),recipeInput.parse(req.body))));return r;}
