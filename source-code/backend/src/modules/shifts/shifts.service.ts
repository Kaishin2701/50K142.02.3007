import { z } from 'zod';
import { lock,type Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { date,time,text,id } from '../../shared/validation.js';
import { notify,notifyManagers } from '../../shared/notifications.js';
import type { Actor } from '../auth/auth.service.js';
import { shiftsRepository as repo } from './shifts.repository.js';
export const shiftFields=z.object({ngay_lam:date,gio_bat_dau:time,gio_ket_thuc:time,so_nhan_vien_toi_thieu:z.number().int().min(1).max(100),so_nhan_vien_toi_da:z.number().int().min(1).max(100)}).strict();
export const shiftInput=shiftFields.extend({lap:z.object({ngay_ket_thuc:date.optional(),so_tuan:z.number().int().min(1).max(52).optional()}).strict().refine(v=>Boolean(v.ngay_ket_thuc)!==Boolean(v.so_tuan)).optional()})
 .refine(v=>v.gio_bat_dau<v.gio_ket_thuc&&v.so_nhan_vien_toi_da>=v.so_nhan_vien_toi_thieu,{message:'Thời gian hoặc số lượng nhân viên không hợp lệ.'});
export const availabilityInput=z.object({ngay:date,gio_bat_dau:time,gio_ket_thuc:z.union([time,z.literal('24:00')]),loai_dang_ky:z.enum(['Rảnh','Mong muốn'])}).strict().refine(v=>v.gio_bat_dau<v.gio_ket_thuc);
export const changeInput=z.object({ma_ca:id,loai_yeu_cau:z.enum(['Đổi ca hai chiều','Nhờ nhân viên khác làm thay']),ma_nhan_vien_duoc_de_nghi:id,ma_ca_cua_dong_nghiep:id.optional(),ly_do:text(500)}).strict()
 .refine(v=>v.loai_yeu_cau==='Đổi ca hai chiều'?Boolean(v.ma_ca_cua_dong_nghiep)&&v.ma_ca!==v.ma_ca_cua_dong_nghiep:!v.ma_ca_cua_dong_nghiep);
const addDays=(date:string,days:number)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
function future(v:any){return new Date(`${v.ngay_lam}T${v.gio_bat_dau}+07:00`).getTime()>Date.now();}
export function shiftsService(db:Database){
 const get=async(tx:Database,id:string)=>{const shift=await repo.get(tx,id);check(shift,'Không tìm thấy ca làm.','NOT_FOUND',404);return shift;};
 const validateChange=async(tx:Database,request:any)=>{
   const source=await get(tx,request.ma_ca);check(source.chua_bat_dau&&request.dang_hieu_luc,'Ca đã bắt đầu hoặc phân công đã thay đổi.');
   check(await repo.employee(tx,request.ma_nhan_vien_duoc_de_nghi),'Nhân viên được đề nghị không còn hoạt động.');
   check(await repo.employee(tx,request.nguoi_gui),'Nhân viên gửi không còn hoạt động.');
   const excluded=[source.ma_ca];let other:any;
   if(request.ma_ca_cua_dong_nghiep){other=await get(tx,request.ma_ca_cua_dong_nghiep);check(other.chua_bat_dau,'Ca đồng nghiệp đã bắt đầu.');excluded.push(other.ma_ca);
     check((await repo.assignments(tx,other.ma_ca)).some(p=>p.ma_nhan_vien===request.ma_nhan_vien_duoc_de_nghi),'Đồng nghiệp không được phân công vào ca muốn đổi.');}
   check(!(await repo.assignments(tx,source.ma_ca)).some(p=>p.ma_nhan_vien===request.ma_nhan_vien_duoc_de_nghi),'Đồng nghiệp đã có trong ca cần thay đổi.');
   check(!await repo.conflict(tx,request.ma_nhan_vien_duoc_de_nghi,source,excluded),'Nhân viên được chọn bị trùng lịch làm việc.');
   if(other){check(!(await repo.assignments(tx,other.ma_ca)).some(p=>p.ma_nhan_vien===request.nguoi_gui),'Nhân viên gửi đã có trong ca đồng nghiệp.');
     check(!await repo.conflict(tx,request.nguoi_gui,other,excluded),'Nhân viên gửi bị trùng lịch sau khi đổi ca.');}
   return {source,other};
 };
 return{
  coWorkers:async(actor:Actor,from:string,to:string)=>{check(from<=to&&new Date(to).getTime()-new Date(from).getTime()<=31*86400000,'Khoảng xem lịch tối đa 31 ngày.','INVALID_RANGE',422);return repo.coWorkers(db,actor.id,from,to);},
  calendar:async(actor:Actor,from:string,to:string)=>{
    check(from<=to&&new Date(to).getTime()-new Date(from).getTime()<=31*86400000,'Khoảng xem lịch tối đa 31 ngày.','INVALID_RANGE',422);
    const user=actor.role==='Quản lý'?null:actor.id;
    return {shifts:await repo.calendar(db,from,to,user),registrations:await repo.availabilityList(db,from,to,user)};
  },
  create:(v:z.infer<typeof shiftInput>)=>db.transaction(async tx=>{await lock(tx,'ca_lam');
    const dates:string[]=[];let index=0;
    do{const day=addDays(v.ngay_lam,index*7);if(v.lap?.ngay_ket_thuc&&day>v.lap.ngay_ket_thuc)break;
      dates.push(day);index++;check(index<=52,'Chuỗi ca lặp tối đa 52 tuần.','INVALID_RECURRENCE',422);
    }while(v.lap&&(v.lap.so_tuan?index<v.lap.so_tuan:true));
    check(dates.length>0,'Ngày kết thúc lặp phải từ ngày bắt đầu trở đi.','INVALID_RECURRENCE',422);
    for(const day of dates){const item={...v,ngay_lam:day};check(future(item),'Chỉ được tạo ca chưa bắt đầu.');check(!await repo.overlap(tx,item),`Ca ngày ${day} bị trùng với ca đã có.`,'SHIFT_OVERLAP');}
    const series=v.lap?await repo.series(tx,v.lap.ngay_ket_thuc??null,v.lap.so_tuan??null):null;
    const result=[];for(const day of dates)result.push(await repo.create(tx,{...v,ngay_lam:day},series?.ma_chuoi_lap??null));return result;
  }),
  update:(id:string,v:z.infer<typeof shiftFields>)=>db.transaction(async tx=>{await lock(tx,'ca_lam');const old=await get(tx,id);
    check(old.chua_bat_dau&&future(v),'Không thể chỉnh sửa ca đã bắt đầu hoặc đã kết thúc.');
    check(v.gio_bat_dau<v.gio_ket_thuc&&v.so_nhan_vien_toi_da>=v.so_nhan_vien_toi_thieu,'Thông tin ca không hợp lệ.','INVALID_SHIFT',422);
    check(!await repo.overlap(tx,v,id),'Thời gian ca bị trùng với ca đã có.','SHIFT_OVERLAP');
    check(!await repo.pending(tx,[id]),'Ca đang có yêu cầu đổi hoặc xoay ca chưa xử lý.');
    const people=await repo.assignments(tx,id);check(people.length<=v.so_nhan_vien_toi_da,'Số nhân viên tối đa nhỏ hơn số đang được phân công.');
    for(const person of people)check(!await repo.conflict(tx,person.ma_nhan_vien,v,[id]),'Thời gian ca bị trùng với lịch làm việc của nhân viên.');
    return repo.update(tx,id,v);
  }),
  candidates:async(id:string)=>{const result=await repo.candidates(db,await get(db,id));return result.sort((a,b)=>Number(b.loai_dang_ky==='Mong muốn')-Number(a.loai_dang_ky==='Mong muốn'));},
  assign:(id:string,people:string[])=>db.transaction(async tx=>{await lock(tx,'ca_lam');const shift=await get(tx,id);check(shift.chua_bat_dau,'Ca đã bắt đầu.');
    check(people.length>0&&people.length<=shift.so_nhan_vien_toi_da,'Số lượng nhân viên được phân công không hợp lệ.');
    check(!await repo.pending(tx,[id]),'Ca đang có yêu cầu đổi hoặc xoay ca chưa xử lý.');
    const sources=[];for(const person of people){check(await repo.employee(tx,person),'Tài khoản nhân viên không hợp lệ.');
      const available=await repo.available(tx,person,shift);check(available,'Nhân viên chưa đăng ký lịch phù hợp.');
      check(!await repo.conflict(tx,person,shift,[id]),'Nhân viên bị trùng lịch.');sources.push(available.ma_dang_ky);}
    await repo.clearAssignments(tx,id);for(let i=0;i<people.length;i++){await repo.assign(tx,id,people[i],sources[i]);await notify(tx,people[i],'PHAN_CONG_CA','Bạn được phân công ca làm.',{ma_ca:id});}
    return repo.assignments(tx,id);
  }),
  register:(actor:Actor,v:z.infer<typeof availabilityInput>)=>db.transaction(async tx=>{await lock(tx,'ca_lam');check(future({...v,ngay_lam:v.ngay}),'Chỉ được đăng ký thời gian chưa bắt đầu.');return repo.register(tx,actor.id,v);}),
  cancelRegistration:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'ca_lam');const item=await repo.registration(tx,id);
    check(item&&item.ma_nhan_vien===actor.id,'Không tìm thấy đăng ký của bạn.','NOT_FOUND',404);
    check(!item.thoi_diem_huy_dang_ky&&!item.da_phan_cong,'Đăng ký đã hủy hoặc đã được sử dụng để phân công ca làm.');await repo.cancelRegistration(tx,id);return {da_huy:true};}),
  requests:(actor:Actor)=>repo.requests(db,actor.role==='Quản lý'?null:actor.id),
  request:(actor:Actor,v:z.infer<typeof changeInput>)=>db.transaction(async tx=>{await lock(tx,'ca_lam');check(v.ma_nhan_vien_duoc_de_nghi!==actor.id,'Không thể tự gửi yêu cầu cho mình.');
    const assignment=(await repo.assignments(tx,v.ma_ca)).find(p=>p.ma_nhan_vien===actor.id);check(assignment,'Bạn không có phân công trong ca này.','FORBIDDEN',403);
    await validateChange(tx,{...v,nguoi_gui:actor.id,dang_hieu_luc:true});check(!await repo.pending(tx,[v.ma_ca,...(v.ma_ca_cua_dong_nghiep?[v.ma_ca_cua_dong_nghiep]:[])]),'Ca làm đã có yêu cầu đang chờ xử lý.');
    const result=await repo.createRequest(tx,assignment,v);await notify(tx,v.ma_nhan_vien_duoc_de_nghi,'DOI_CA','Bạn có yêu cầu đổi hoặc xoay ca chờ phản hồi.',{ma_yeu_cau:result.ma_yeu_cau});return result;
  }),
  respond:(actor:Actor,id:string,accept:boolean)=>db.transaction(async tx=>{await lock(tx,'ca_lam');const request=await repo.request(tx,id);
    check(request&&request.ma_nhan_vien_duoc_de_nghi===actor.id,'Không tìm thấy yêu cầu dành cho bạn.','NOT_FOUND',404);check(request.trang_thai==='Chờ đồng nghiệp','Yêu cầu đã được phản hồi.');
    if(accept)await validateChange(tx,request);const result=await repo.respond(tx,id,accept);
    if(accept)await notifyManagers(tx,'DUYET_DOI_CA','Có yêu cầu đổi hoặc xoay ca chờ xử lý.',{ma_yeu_cau:id});
    await notify(tx,request.nguoi_gui,'PHAN_HOI_DOI_CA',accept?'Đồng nghiệp đã đồng ý yêu cầu.':'Đồng nghiệp đã từ chối yêu cầu.',{ma_yeu_cau:id});return result;
  }),
  decide:(id:string,accept:boolean)=>db.transaction(async tx=>{await lock(tx,'ca_lam');const request=await repo.request(tx,id);
    check(request,'Không tìm thấy yêu cầu.','NOT_FOUND',404);check(request.trang_thai==='Chờ xử lý','Yêu cầu không còn chờ quản lý xử lý.');
    if(accept){const {source,other}=await validateChange(tx,request);await repo.deactivate(tx,request.ma_phan_cong_can_thay_doi);
      if(other){const partner=(await repo.assignments(tx,other.ma_ca)).find(p=>p.ma_nhan_vien===request.ma_nhan_vien_duoc_de_nghi)!;
        await repo.deactivate(tx,partner.ma_phan_cong);await repo.assign(tx,other.ma_ca,request.nguoi_gui,null);}
      await repo.assign(tx,source.ma_ca,request.ma_nhan_vien_duoc_de_nghi,null);}
    const result=await repo.decide(tx,id,accept);
    for(const user of [request.nguoi_gui,request.ma_nhan_vien_duoc_de_nghi])await notify(tx,user,'KET_QUA_DOI_CA',accept?'Quản lý đã chấp thuận yêu cầu.':'Quản lý đã từ chối yêu cầu.',{ma_yeu_cau:id});return result;
  }),
 };
}
