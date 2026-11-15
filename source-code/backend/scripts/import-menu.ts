import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { importPhotoMenu, readPhotoMenu } from './lib/photo-menu.js';
import { acquireLocalServerLock } from './lib/local-server-lock.js';

const args=new Set(process.argv.slice(2));
const menu=await readPhotoMenu();
console.log(JSON.stringify({variants:menu.items.length,categories:new Set(menu.items.map(i=>i.category)).size,pending:menu.pending},null,2));
if(!args.has('--apply')){
  console.log('Chỉ xem trước. Thêm --apply --demo-stock --local hoặc --qa để nạp vào database PostgreSQL nhúng.');
}else{
  if(!args.has('--demo-stock'))throw Error('Cần --demo-stock để xác nhận công thức và tồn kho mẫu.');
  if(args.has('--local')===args.has('--qa'))throw Error('Chọn đúng một database cô lập: --local hoặc --qa. DATABASE_URL không được sử dụng.');
  const target=args.has('--qa')?'qa':'local';
  const directory=fileURLToPath(new URL(target==='qa'?'../.local/qa/':'../.local/',import.meta.url));
  await mkdir(directory,{recursive:true});
  const releaseLock=await acquireLocalServerLock(directory,target);
  let db:Awaited<ReturnType<typeof embeddedDatabase>>|undefined;
  try{
    db=await embeddedDatabase(join(directory,'postgres'));
    const manager=(await db.query("SELECT ma_nguoi_dung FROM nguoi_dung WHERE ten_dang_nhap='quanly' AND vai_tro='Quản lý' AND trang_thai='Đang hoạt động'")).rows[0];
    if(!manager)throw Error('Chưa có tài khoản quanly đang hoạt động. Khởi tạo ứng dụng trước.');
    console.log(JSON.stringify(await importPhotoMenu(db,menu.items,manager.ma_nguoi_dung)));
  }finally{
    try{if(db)await db.close();}
    finally{await releaseLock();}
  }
}
