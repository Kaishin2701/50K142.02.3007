import { z } from 'zod';
import { lock, type Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { id,money,quantity,text,distinct } from '../../shared/validation.js';
import { menuRepository as repo } from './menu.repository.js';
export const menuInput=z.object({ten_mon:text(100),danh_muc:text(100),don_gia_hien_tai:money,dang_hoat_dong:z.boolean().default(true)}).strict();
export const recipeInput=z.array(z.object({ma_nguyen_lieu:id,dinh_luong:quantity.refine(v=>v>0)}).strict()).min(1).max(100).refine(v=>distinct(v,i=>i.ma_nguyen_lieu));
export function menuService(db:Database){return{
 list:(all:boolean)=>repo.list(db,all),
 recipe:async(id:string)=>{check(await repo.get(db,id),'Không tìm thấy món.','NOT_FOUND',404);return repo.recipe(db,id);},
 save:(id:string|null,v:z.infer<typeof menuInput>)=>db.transaction(async tx=>{await lock(tx,'kho');
   if(id)check(await repo.get(tx,id),'Không tìm thấy món.','NOT_FOUND',404);return repo.save(tx,id,v);}),
 recipeSave:(id:string,v:z.infer<typeof recipeInput>)=>db.transaction(async tx=>{await lock(tx,'kho');
   check(await repo.get(tx,id),'Không tìm thấy món.','NOT_FOUND',404);await repo.replaceRecipe(tx,id,v);return repo.recipe(tx,id);}),
};}
