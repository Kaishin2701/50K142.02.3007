import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { migrate } from '../src/shared/migrations.js';
import { importPhotoMenu,readPhotoMenu } from '../scripts/lib/photo-menu.js';
import { ordersService } from '../src/modules/orders/orders.service.js';
import { randomUUID } from 'node:crypto';

test('photo menu imports sizes and recipes atomically, can reserve every item, and never replenishes on retry',async()=>{
  const db=await embeddedDatabase();
  try{
    await migrate(db,fileURLToPath(new URL('../../database/',import.meta.url)));
    const manager=(await db.query(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_bam,ho_ten,so_dien_thoai,vai_tro) VALUES('quanly','test-only','Quản lý','0000000000','Quản lý') RETURNING ma_nguoi_dung`)).rows[0].ma_nguoi_dung;
    const employee=(await db.query(`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_bam,ho_ten,so_dien_thoai,vai_tro) VALUES('nhanvien','test-only','Nhân viên','0000000001','Nhân viên') RETURNING ma_nguoi_dung`)).rows[0].ma_nguoi_dung;
    const menu=await readPhotoMenu();
    assert.equal(new Set(menu.items.map(i=>i.category)).size,11);
    assert.equal(menu.items.find(i=>i.name==='Cà phê muối · M')?.price,28000);
    assert.equal(menu.items.find(i=>i.name==='Trà tắc · L')?.price,12000);
    assert.equal(menu.items.some(i=>i.name==='Cà phê sữa gấu · S'),false);
    assert.equal(menu.items.some(i=>i.name.startsWith('Cam ép')),false);
    const first=await importPhotoMenu(db,menu.items,manager);
    assert.equal(first.added,menu.items.length);assert.equal(first.stockAdded,true);
    const before=(await db.query('SELECT sum(ton_ly_thuyet) AS n FROM nguyen_lieu')).rows[0].n;
    const second=await importPhotoMenu(db,menu.items,manager);
    assert.equal(second.added,0);assert.equal(second.stockAdded,false);
    assert.equal((await db.query('SELECT sum(ton_ly_thuyet) AS n FROM nguyen_lieu')).rows[0].n,before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM don_nhap_hang')).rows[0].n,1);
    const shift=(await db.query(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'00:00','23:59:59.999999',1,3) RETURNING ma_ca`)).rows[0].ma_ca;
    await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[shift,employee]);
    const actor={id:employee,role:'Nhân viên' as const,sessionId:randomUUID()};
    const service=ordersService(db);
    for(const item of menu.items){
      const order=await service.create(actor,{ma_ca:shift,items:[{ma_mon:item.id,so_luong:1}]},true);
      assert.equal(Number(order.tong_tien),item.price);
      await service.cancel(actor,order.ma_don);
    }
    const changed=menu.items.map((i,index)=>index?i:{...i,price:i.price+1000});
    await assert.rejects(importPhotoMenu(db,changed,manager),/Món hiện có khác/);
    assert.equal(Number((await db.query('SELECT don_gia_hien_tai FROM mon WHERE ma_mon=$1',[menu.items[0].id])).rows[0].don_gia_hien_tai),menu.items[0].price);
  }finally{await db.close();}
});
