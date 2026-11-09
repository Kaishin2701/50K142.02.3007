import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { lock, type Database } from '../../src/shared/database.js';
import { inventoryRepository } from '../../src/modules/inventory/inventory.repository.js';

const schema = z.object({
  source: z.string(),
  groups: z.array(z.object({
    category: z.string().min(1), sizes: z.array(z.enum(['S','M','L']).nullable()),
    items: z.array(z.array(z.union([z.string(),z.number().int().positive(),z.null()]))),
  })), pending: z.array(z.string()),
});
export const menuId = (key:string) => {
  const hex=createHash('sha256').update('me-photo-menu-v1:'+key).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
type Ingredient={id:string;name:string;unit:string;quantity:number};
export type PhotoItem={id:string;name:string;category:string;price:number;recipe:Ingredient[]};

// Deliberately approximate demo recipes, NOT the shop's actual recipes.
function recipe(name:string,category:string,size:string|null):Ingredient[]{
  const scale=size==='S'?0.7:size==='L'?1.3:1;
  const parts=new Map<string,Ingredient>();
  const add=(label:string,quantity:number,unit='ml')=>{
    const key=label+'|'+unit,old=parts.get(key);
    parts.set(key,{id:menuId('ingredient:'+key),name:label+' (demo)',unit,quantity:(old?.quantity??0)+Math.round(quantity*scale*1000)/1000});
  };
  const lower=name.toLocaleLowerCase('vi');
  if(category==='Topping'){
    add(name,1,'phần');return [...parts.values()];
  }
  add('Đá viên',150,'g');
  if(category==='Cà phê'){
    add('Cà phê pha sẵn',lower.includes('bạc xỉu')?25:50);
    if(!lower.includes('đen'))add('Sữa đặc',25);
    if(lower.includes('bạc xỉu')||lower.includes('sữa tươi'))add('Sữa tươi',100);
  }else if(category==='Mê Soda'){
    add('Nước soda',180);add('Siro trái cây hỗn hợp',25);
  }else if(category==='Trà sữa'){
    add('Trà pha sẵn',150);add('Bột sữa',25,'g');add('Sữa đặc',20);
  }else if(category==='Sữa tươi'){
    add('Sữa tươi',180);add('Đường nước',15);
  }else if(['Matcha','Cacao','Khoai môn'].includes(category)){
    add('Bột '+category.toLocaleLowerCase('vi'),category==='Matcha'?5:20,'g');
    add('Sữa tươi',150);add('Sữa đặc',20);
  }else if(category==='Sữa chua'){
    add('Sữa chua',100,'g');add('Sữa tươi',50);
  }else{
    if(lower.startsWith('trà'))add('Trà pha sẵn',180);
    else add('Nước lọc',180);
    add('Đường nước',20);
  }
  for(const [needle,label,quantity,unit] of [
    ['muối','Kem muối',1,'phần'],['kem trứng','Kem trứng',1,'phần'],
    ['flan','Flan',1,'phần'],['trân châu','Trân châu trắng',1,'phần'],
    ['sương sáo','Sương sáo',1,'phần'],['nha đam','Nha đam',1,'phần'],
    ['khúc bạch','Khúc bạch phô mai mặn',1,'phần'],['sữa dừa','Sữa dừa',30,'ml'],
    ['sữa gấu','Sữa gấu',30,'ml'],['đường đen','Siro đường đen',20,'ml'],
    ['xí muội','Xí muội',10,'g'],['tắc','Nước tắc',20,'ml'],['chanh','Nước chanh',20,'ml'],
    ['cam','Nước cam',30,'ml'],['hibicus','Trà atiso đỏ',50,'ml'],
    ['mãng cầu','Mãng cầu',40,'g'],['ổi','Ổi hồng',40,'g'],
    ['lựu','Siro lựu đỏ',25,'ml'],['xoài','Siro xoài',25,'ml'],['dâu','Siro dâu',25,'ml'],
    ['việt quất','Siro việt quất',25,'ml'],['đào','Đào lát',1,'phần'],
  ] as const){if(lower.includes(needle))add(label,quantity,unit);}
  if(lower.includes('full')||lower.includes('đặc biệt')){
    add('Thạch dừa',1,'phần');add('Thạch pudding',1,'phần');add('Trân châu trắng',1,'phần');
  }
  if(category==='Trà trái cây'&&lower.includes('nhiệt đới'))add('Trái cây hỗn hợp',60,'g');
  return [...parts.values()];
}

export async function readPhotoMenu(){
  const data=schema.parse(JSON.parse(await readFile(new URL('../../../database/seeds/menu-photo.json',import.meta.url),'utf8')));
  const items:PhotoItem[]=[];
  for(const group of data.groups)for(const row of group.items){
    if(typeof row[0]!=='string'||row.length!==group.sizes.length+1)throw Error('Dòng menu không hợp lệ');
    group.sizes.forEach((size,index)=>{
      const price=row[index+1];if(price===null)return;
      if(typeof price!=='number')throw Error('Giá không hợp lệ');
      const name=row[0]+(size?' · '+size:'');
      items.push({id:menuId('item:'+group.category+':'+name),name,category:group.category,price,recipe:recipe(row[0] as string,group.category,size)});
    });
  }
  if(new Set(items.map(i=>i.id)).size!==items.length)throw Error('Menu bị trùng món');
  return {items,source:data.source,pending:data.pending};
}

export async function importPhotoMenu(db:Database,items:PhotoItem[],managerId:string){
  return db.transaction(async tx=>{
    await lock(tx,'kho');
    const manager=(await tx.query("SELECT ma_nguoi_dung FROM nguoi_dung WHERE ma_nguoi_dung=$1 AND vai_tro='Quản lý' AND trang_thai='Đang hoạt động'",[managerId])).rows[0];
    if(!manager)throw Error('Cần tài khoản quản lý đang hoạt động');
    const materials=new Map<string,Ingredient>();
    for(const item of items)for(const part of item.recipe){
      const old=materials.get(part.id);
      if(!old||old.quantity<part.quantity)materials.set(part.id,part);
    }
    for(const part of materials.values()){
      await tx.query(`INSERT INTO nguyen_lieu(ma_nguyen_lieu,ten_nguyen_lieu,don_vi_tinh,muc_ton_toi_thieu,nguong_chenh_lech)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(ma_nguyen_lieu) DO NOTHING`,[part.id,part.name,part.unit,Math.ceil(part.quantity*10),part.unit==='phần'?1:10]);
    }
    let added=0;
    for(const item of items){
      const old=(await tx.query('SELECT * FROM mon WHERE ma_mon=$1 OR (ten_mon=$2 AND danh_muc=$3)',[item.id,item.name,item.category])).rows;
      if(old.length){
        if(old.length!==1||old[0].ma_mon!==item.id||Number(old[0].don_gia_hien_tai)!==item.price||old[0].ten_mon!==item.name||old[0].danh_muc!==item.category)throw Error('Món hiện có khác dữ liệu nhập: '+item.name);
        continue; // Never overwrite edited recipes, status or pricing.
      }
      await tx.query('INSERT INTO mon(ma_mon,ten_mon,danh_muc,don_gia_hien_tai) VALUES($1,$2,$3,$4)',[item.id,item.name,item.category,item.price]);
      for(const part of item.recipe)await tx.query('INSERT INTO dinh_muc_nguyen_lieu VALUES($1,$2,$3)',[item.id,part.id,part.quantity]);
      added++;
    }
    const receiptId=menuId('initial-demo-stock');
    let stockAdded=false;
    if(!(await tx.query('SELECT ma_po FROM don_nhap_hang WHERE ma_po=$1',[receiptId])).rows.length){
      await tx.query(`INSERT INTO don_nhap_hang(ma_po,ten_nha_cung_cap,ngay_nhap,ma_nguoi_xac_nhan,trang_thai_thanh_toan,hinh_thuc_thanh_toan)
        VALUES($1,'DỮ LIỆU DEMO - Tồn kho mẫu menu ảnh',(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$2,'Đã thanh toán','Tiền mặt')`,[receiptId,managerId]);
      for(const part of materials.values()){
        const amount=Math.ceil(part.quantity*300);
        await inventoryRepository.importLine(tx,receiptId,{ma_nguyen_lieu:part.id,so_luong_dat:amount,so_luong_nhan:amount,don_gia:0});
      }
      stockAdded=true;
    }
    return {added,total:items.length,materials:materials.size,stockAdded};
  });
}
