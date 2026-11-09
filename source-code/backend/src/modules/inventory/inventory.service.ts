import { z } from 'zod';
import { lock,type Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { id,money,quantity,text,date,distinct } from '../../shared/validation.js';
import { notify,notifyManagers } from '../../shared/notifications.js';
import type { Actor } from '../auth/auth.service.js';
import { shiftsRepository } from '../shifts/shifts.repository.js';
import { inventoryRepository as repo } from './inventory.repository.js';
import { previousRequest,rememberRequest } from '../../shared/idempotency.js';
export const materialInput=z.object({ten_nguyen_lieu:text(100),don_vi_tinh:text(20),muc_ton_toi_thieu:quantity,nguong_chenh_lech:quantity,dang_hoat_dong:z.boolean().default(true)}).strict();
export const importInput=z.object({ten_nha_cung_cap:text(150),ngay_nhap:date,ma_ca:id.optional(),trang_thai_thanh_toan:z.enum(['Đã thanh toán','Công nợ']),hinh_thuc_thanh_toan:z.enum(['Tiền mặt','Chuyển khoản']).optional(),
 items:z.array(z.object({ma_nguyen_lieu:id,so_luong_dat:quantity.refine(v=>v>0),so_luong_nhan:quantity,don_gia:z.number().nonnegative().max(999999999999).multipleOf(0.0001)}).strict()).min(1).max(500).refine(v=>distinct(v,i=>i.ma_nguyen_lieu))}).strict()
 .refine(v=>v.trang_thai_thanh_toan==='Công nợ'?!v.hinh_thuc_thanh_toan:Boolean(v.hinh_thuc_thanh_toan),{message:'Trạng thái và hình thức thanh toán không hợp lệ.'});
export const countInput=z.object({ma_ca:id,tien_mat_thuc_thu:money,chuyen_khoan_thuc_thu:money,ly_do_chenh_lech_tien:text(500).optional(),
 items:z.array(z.object({ma_nguyen_lieu:id,ton_ly_thuyet:quantity,ton_thuc_te:quantity,ly_do_chenh_lech:z.enum(['Hao hụt','Đổ vỡ','Hết hạn','Khác']).optional(),ghi_chu:text(500).optional()}).strict()).min(1).max(500).refine(v=>distinct(v,i=>i.ma_nguyen_lieu))}).strict();
const milli=(value:unknown)=>Math.round(Number(value)*1000);
export function inventoryService(db:Database){
 const forEmployee=async(tx:Database,actor:Actor,shift:string)=>{const found=await shiftsRepository.get(tx,shift);check(found,'Không tìm thấy ca làm.','NOT_FOUND',404);
   check((await shiftsRepository.assignments(tx,shift)).some(p=>p.ma_nhan_vien===actor.id),'Bạn không được phân công trong ca này.','FORBIDDEN',403);
   check(found.da_ket_thuc,'Ca làm việc chưa kết thúc.','SHIFT_NOT_ENDED');return found;};
 const report=async(tx:Database,id:string,actor:Actor)=>{const found=await repo.report(tx,id);check(found,'Không tìm thấy báo cáo.','NOT_FOUND',404);
   check(actor.role==='Quản lý'||found.ma_nguoi_kiem_ke===actor.id,'Bạn không được xem báo cáo này.','FORBIDDEN',403);return found;};
 return{
  list:()=>repo.list(db,true),
  save:(id:string|null,v:z.infer<typeof materialInput>)=>db.transaction(async tx=>{await lock(tx,'kho');if(id){const old=await repo.get(tx,id);check(old,'Không tìm thấy nguyên liệu.','NOT_FOUND',404);
    check(v.don_vi_tinh===old.don_vi_tinh,'Không đổi đơn vị tính của nguyên liệu đã tạo.');
    if(!v.dang_hoat_dong)check(!await repo.held(tx,id),'Nguyên liệu đang được giữ cho đơn hàng.');}
    return repo.save(tx,id,v);
  }),
  import:(actor:Actor,v:z.infer<typeof importInput>,key?:string)=>db.transaction(async tx=>{await lock(tx,'kho');
    const old=await previousRequest(tx,key,actor.id,'import-stock',v);
    if(old)return{...await repo.receipt(tx,old),items:await repo.receiptLines(tx,old)};
    check(v.ngay_nhap<=new Date(Date.now()+7*3600000).toISOString().slice(0,10),'Ngày nhập không được ở tương lai.','INVALID_DATE',422);
    for(const line of v.items)check((await repo.get(tx,line.ma_nguyen_lieu))?.dang_hoat_dong,'Nguyên liệu không tồn tại hoặc đã ngừng hoạt động.');
    const receipt=await repo.importHeader(tx,actor.id,v);for(const line of v.items)await repo.importLine(tx,receipt.ma_po,line);
    await rememberRequest(tx,key,actor.id,'import-stock',v,receipt.ma_po);
    await notifyManagers(tx,'NHAP_HANG','Tồn kho đã được cập nhật từ lần nhập hàng.',{ma_po:receipt.ma_po});return {...receipt,items:await repo.receiptLines(tx,receipt.ma_po)};
  }),
  receipts:(limit:number,offset:number)=>repo.receipts(db,limit,offset),
  receipt:async(id:string)=>{const found=await repo.receipt(db,id);check(found,'Không tìm thấy lần nhập hàng.','NOT_FOUND',404);return {...found,items:await repo.receiptLines(db,id)};},
  losses:(limit:number,offset:number)=>repo.lossHistory(db,limit,offset),
  preview:async(actor:Actor,shift:string)=>{await forEmployee(db,actor,shift);return{ma_ca:shift,...await repo.shiftRevenue(db,shift),items:await repo.list(db,true)};},
  count:(actor:Actor,v:z.infer<typeof countInput>,key?:string)=>db.transaction(async tx=>{await lock(tx,'kho');
    const previous=await previousRequest(tx,key,actor.id,'count-stock',v);
    if(previous)return {...await repo.count(tx,previous),items:await repo.countLines(tx,previous)};
    await forEmployee(tx,actor,v.ma_ca);
    check(!await repo.countForShift(tx,v.ma_ca),'Ca này đã có phiếu kiểm kho.','COUNT_EXISTS');
    check(!await repo.pendingCount(tx),'Cần xác nhận báo cáo kiểm kho trước đó trước khi lập phiếu mới.','PENDING_CLOSE');
    check(!await repo.unfinished(tx,v.ma_ca),'Cần hoàn tất hoặc hủy các đơn còn xử lý của ca.','UNFINISHED_ORDERS');
    const materials=await repo.list(tx,true);check(materials.length===v.items.length,'Phải nhập đủ mọi nguyên liệu đang hoạt động.','INCOMPLETE_COUNT',422);
    const revenue=Number((await repo.shiftRevenue(tx,v.ma_ca)).doanh_thu);
    check(v.tien_mat_thuc_thu+v.chuyen_khoan_thuc_thu===revenue||v.ly_do_chenh_lech_tien,'Vui lòng nhập lý do chênh lệch tiền.','MISSING_CASH_REASON',422);
    for(const line of v.items){const material=materials.find(m=>m.ma_nguyen_lieu===line.ma_nguyen_lieu);check(material,'Nguyên liệu không hợp lệ.','INVALID_MATERIAL',422);
      check(milli(line.ton_ly_thuyet)===milli(material.ton_ly_thuyet),'Số liệu kho đã thay đổi. Vui lòng tải lại và đối chiếu lại.','STALE_COUNT');
      const different=Math.abs(milli(line.ton_thuc_te)-milli(material.ton_ly_thuyet))>milli(material.nguong_chenh_lech);
      check(!different||line.ly_do_chenh_lech,'Vui lòng chọn lý do cho nguyên liệu lệch vượt ngưỡng.','MISSING_STOCK_REASON',422);
      check(different||!line.ly_do_chenh_lech,'Nguyên liệu khớp không cần lý do chênh lệch.','UNEXPECTED_STOCK_REASON',422);
      check(line.ly_do_chenh_lech!=='Khác'||line.ghi_chu,'Vui lòng nhập ghi chú cho lý do Khác.','MISSING_NOTE',422);
    }
    const count=await repo.insertCount(tx,actor.id,v,revenue);
    for(const line of v.items)await repo.insertCountLine(tx,count.ma_phieu,materials.find(m=>m.ma_nguyen_lieu===line.ma_nguyen_lieu),line);
    await rememberRequest(tx,key,actor.id,'count-stock',v,count.ma_phieu);
    return {...count,items:await repo.countLines(tx,count.ma_phieu)};
  }),
  createReport:(actor:Actor,countId:string)=>db.transaction(async tx=>{await lock(tx,'kho');const count=await repo.count(tx,countId);
    check(count&&count.ma_nguoi_kiem_ke===actor.id,'Không tìm thấy phiếu kiểm kho của bạn.','NOT_FOUND',404);
    return await repo.reportForCount(tx,countId)??await repo.createReport(tx,count);
  }),
  reports:(actor:Actor)=>repo.reports(db,actor.role==='Quản lý'?null:actor.id),
  report:async(actor:Actor,id:string)=>{const found=await report(db,id,actor);return {...found,items:await repo.countLines(db,found.ma_phieu)};},
  send:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'kho');const found=await report(tx,id,actor);
    check(found.trang_thai==='Nháp','Báo cáo đã được gửi hoặc xác nhận.');const result=await repo.sendReport(tx,id);
    await notifyManagers(tx,'BAO_CAO_CUOI_CA','Có báo cáo cuối ca chờ xác nhận.',{ma_bao_cao:id});return result;
  }),
  confirm:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'kho');const found=await report(tx,id,actor);
    if(found.trang_thai==='Đã xác nhận')return found;
    check(found.trang_thai==='Chờ xác nhận','Báo cáo chưa được gửi cho quản lý.');
    for(const line of await repo.countLines(tx,found.ma_phieu))check(await repo.applyCount(tx,line,id),'Tồn kho sau đối chiếu không đủ cho phần đã giữ. Cần giải quyết đơn hoặc nhập kho trước khi xác nhận.','STOCK_RECONCILIATION_CONFLICT');
    const result=await repo.confirmReport(tx,id,actor.id);await notify(tx,found.ma_nguoi_kiem_ke,'BAO_CAO_DA_XAC_NHAN','Quản lý đã xác nhận báo cáo cuối ca.',{ma_bao_cao:id});
    await notifyManagers(tx,'CHOT_CA','Báo cáo cuối ca đã được xác nhận.',{ma_bao_cao:id});return result;
  }),
  lowStock:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'kho');const found=await report(tx,id,actor);
    check(found.trang_thai!=='Nháp','Vui lòng gửi báo cáo trước.');const items=(await repo.countLines(tx,found.ma_phieu)).filter(i=>Number(i.ton_thuc_te)<Number(i.muc_ton_toi_thieu));
    check(items.length>0,'Không có nguyên liệu dưới mức tồn tối thiểu.');await notifyManagers(tx,'CAN_NHAP_HANG','Có nguyên liệu cần nhập thêm.',{ma_bao_cao:id,items});return{da_gui:true,items};
  }),
 };
}
