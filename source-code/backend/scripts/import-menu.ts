import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/shared/database.js';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { importPhotoMenu, readPhotoMenu } from './lib/photo-menu.js';

const menu=await readPhotoMenu();
console.log(JSON.stringify({variants:menu.items.length,categories:new Set(menu.items.map(i=>i.category)).size,pending:menu.pending},null,2));
if(!process.argv.includes('--apply')){
  console.log('Chỉ xem trước. Thêm --apply --demo-stock để nhập dữ liệu; --local dùng database local đã khởi tạo.');
}else{
  if(!process.argv.includes('--demo-stock'))throw Error('Cần --demo-stock để xác nhận công thức và tồn kho mẫu.');
  const env=process.argv.includes('--local')?null:loadEnv();
  const db=env?connectDatabase(env.DATABASE_URL,env.PG_SSL==='true'):await embeddedDatabase(fileURLToPath(new URL('../.local/postgres',import.meta.url)));
  try{
    const manager=(await db.query("SELECT ma_nguoi_dung FROM nguoi_dung WHERE ten_dang_nhap='quanly' AND vai_tro='Quản lý' AND trang_thai='Đang hoạt động'")).rows[0];
    if(!manager)throw Error('Chưa có tài khoản quanly đang hoạt động. Khởi tạo ứng dụng trước.');
    console.log(JSON.stringify(await importPhotoMenu(db,menu.items,manager.ma_nguoi_dung)));
  }finally{await db.close();}
}
