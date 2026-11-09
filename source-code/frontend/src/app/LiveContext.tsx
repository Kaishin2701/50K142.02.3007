import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { api,ApiError,apiBase,download,query,type RecordData as Row } from '../services/api';
import { actionFor,screenFor,type Screen } from './navigation';

export const today=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
export const isoDate=(value:string)=>{const v=value?.trim()??'';if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:v;};
export const dateText=(value:unknown)=>{const v=String(value??'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v.split('-').reverse().join('/'):'—';};
export const currency=(value:unknown)=>new Intl.NumberFormat('vi-VN').format(Number(value??0))+' đ';
export const decimal=(value:unknown)=>value===null||value===undefined?'—':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(Number(value));
export const timeText=(value:unknown)=>String(value??'').slice(0,5);
export const shiftText=(v:Row|undefined)=>v?`${dateText(v.ngay_lam??v.ngay)} · ${timeText(v.gio_bat_dau)}–${timeText(v.gio_ket_thuc)}`:'—';
const weekStart=(date:string)=>{const day=new Date(date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);return day.toISOString().slice(0,10);};
export const addDays=(date:string,days:number)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
type Live = ReturnType<typeof useLiveModel>;
const Context=createContext<Live|null>(null);
export const useLive=()=>{const value=useContext(Context);if(!value)throw new Error('Missing LiveProvider');return value;};
export function LiveProvider({children}:{children:ReactNode}){const model=useLiveModel();return <Context.Provider value={model}>{children}</Context.Provider>;}
function useLiveModel(){
 const [screenId,setScreenId]=useState(()=>screenFor(decodeURIComponent(location.hash.slice(1)))?.id??'261:28311');
 const [user,setUser]=useState<Row|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
 const [form,setForm]=useState<Record<string,string>>({}),[error,setError]=useState('');
 const [data,setData]=useState<Record<string,any>>({menu:[],users:[],shifts:[],registrations:[],orders:[],materials:[],receipts:[],losses:[],reports:[],requests:[],candidates:[]});
 const [selected,setSelected]=useState<Record<string,Row|undefined>>({});
 const [cart,setCart]=useState<Row[]>([]),[order,setOrder]=useState<Row|undefined>(),[payment,setPayment]=useState<Row|undefined>();
 const [week,setWeek]=useState(weekStart(today())),[category,setCategory]=useState('Cà phê'),[page,setPage]=useState(1);
 const [period,setPeriod]=useState('day'),[reportDate,setReportDate]=useState(today()),[method,setMethod]=useState(''),[format,setFormat]=useState('xlsx');
 const [assignment,setAssignment]=useState<string[]>([]),[countRows,setCountRows]=useState<Record<string,Row>>({}),[countChecked,setCountChecked]=useState(false);
 const [recurrence,setRecurrence]=useState('once'),[recurrenceEnd,setRecurrenceEnd]=useState('date');
 const active=useRef(true),requestKey=useRef(crypto.randomUUID());
 const screen=screenFor(screenId)!;const manager=user?.vai_tro==='Quản lý';
 const go=(prefix:string)=>{const target=screenFor(prefix);if(target){setError('');location.hash=target.id;setScreenId(target.id);}};
 const refresh=()=>setVersion(v=>v+1);
 const field=(label:string,value:string)=>{setForm(v=>({...v,[label]:value}));setError('');};
 const select=(kind:string,value:Row|undefined)=>setSelected(v=>({...v,[kind]:value}));
 const mutate=async<T,>(work:()=>Promise<T>,next?:string)=>{if(busy)return;setBusy(true);setError('');try{const result=await work();refresh();if(next)go(next);return result;}
   catch(e){handleError(e);}finally{setBusy(false);}};
 const handleError=(e:unknown)=>{
   const failure=e instanceof ApiError?e:new ApiError(0,'NETWORK_ERROR','Lỗi kết nối. Vui lòng thử lại.');setError(failure.message);
   if(failure.status===401){setUser(null);if(!screen.name.startsWith('GD0'))location.hash='261:28311';}
 };
 useEffect(()=>{active.current=true;api<Row>('/auth/me').then(v=>{if(active.current)setUser(v);}).catch(e=>{if(e instanceof ApiError&&e.status!==401)setError(e.message);}).finally(()=>{if(active.current)setReady(true);});
   const route=()=>setScreenId(screenFor(decodeURIComponent(location.hash.slice(1)))?.id??'261:28311');window.addEventListener('hashchange',route);
   return()=>{active.current=false;window.removeEventListener('hashchange',route);};},[]);
 useEffect(()=>{if(!ready)return;if(!user&&!/^GD0|^GD7-8/.test(screen.name)){go('GD0-2-1');return;}
   if(user&&!manager&&/^GD2|^GD3|^GD5|^GD1\.1|^GD4\.[123]/.test(screen.name))go('GD1.3-2-1');
 },[ready,user,screen.id]);
 useEffect(()=>{if(!user)return;const events=new EventSource(apiBase+'/events',{withCredentials:true});
   events.addEventListener('refresh',refresh);events.addEventListener('session-ended',()=>{setUser(null);go('GD0-2-1');events.close();});return()=>events.close();},[user?.ma_nguoi_dung]);
 useEffect(()=>{if(!user)return;let canceled=false;const controller=new AbortController();
   const load=async()=>{try{
     const values:Record<string,any>={};const fetchData=async(key:string,path:string)=>{values[key]=await api(path,{signal:controller.signal});};
     if(/^GD1/.test(screen.name)){await fetchData('menu','/menu');
       if(/^GD1\.[12]/.test(screen.name))await fetchData('orders','/orders'+(screen.name.startsWith('GD1.1')?'/history':'')+'?'+query({page,limit:20,code:form['Mã đơn'],from:form['Từ ngày']?isoDate(form['Từ ngày']):undefined,to:form['Đến ngày']?isoDate(form['Đến ngày']):undefined,method:form['Phương thức thanh toán']||undefined,status:form['Trạng thái']||undefined}));
     }
     if(/^GD2/.test(screen.name))await fetchData('users','/users?'+query({page,limit:100,search:form['Tìm kiếm']??''}));
     if(/^GD[36]|^GD1\.3|^GD4\.[45]/.test(screen.name)){const calendar=await api<Row>('/shifts?'+query({from:addDays(week,-7),to:addDays(week,6)}),{signal:controller.signal});values.shifts=calendar.shifts;values.registrations=calendar.registrations;}
     if(/^GD[36]/.test(screen.name)){await fetchData('requests','/shifts/requests');
       if(!manager)await fetchData('coWorkers','/shifts/co-workers?'+query({from:week,to:addDays(week,27)}));
       if(screen.name.startsWith('GD3.4')&&selected.shift)await fetchData('candidates',`/shifts/${selected.shift.ma_ca}/candidates`);
     }
     if(/^GD4\.1/.test(screen.name))await fetchData('materials','/inventory/materials');
     if(/^GD4\.2/.test(screen.name))await fetchData('receipts','/inventory/receipts?'+query({page,limit:20}));
     if(/^GD4\.3/.test(screen.name))await fetchData('losses','/inventory/losses?'+query({page,limit:20}));
     if(/^GD4\.5/.test(screen.name))await fetchData('reports','/inventory/close-reports');
     if(/^GD5/.test(screen.name))await fetchData('revenue','/reports/revenue?'+query({period,date:reportDate,method:method||undefined}));
     if(!canceled)setData(v=>({...v,...values}));
   }catch(e){if(!canceled)handleError(e);}};void load();return()=>{canceled=true;controller.abort();};
 },[user?.ma_nguoi_dung,screen.name.split('-')[0],week,version,page,period,reportDate,method,selected.shift?.ma_ca]);
 const currentShift=(data.shifts as Row[]).find(s=>{const now=Date.now();return new Date(`${s.ngay_lam}T${s.gio_bat_dau}+07:00`).getTime()<=now&&new Date(`${s.ngay_lam}T${s.gio_ket_thuc}+07:00`).getTime()>now;});
 const latestEndedShift=()=>[...(data.shifts as Row[])].filter(s=>new Date(`${s.ngay_lam}T${s.gio_ket_thuc}+07:00`).getTime()<=Date.now()).sort((a,b)=>`${b.ngay_lam}${b.gio_ket_thuc}`.localeCompare(`${a.ngay_lam}${a.gio_ket_thuc}`))[0];
 const openCount=async(shift?:Row)=>mutate(async()=>{const found=shift??selected.shift??latestEndedShift();if(!found)throw new ApiError(409,'SHIFT_NOT_FOUND','Ca làm việc chưa kết thúc.');
   select('shift',found);const value=await api<Row>('/inventory/counts/preview?'+query({ma_ca:found.ma_ca}));setData(v=>({...v,countPreview:value}));setCountRows({});setCountChecked(false);return value;},'GD4.4-2-1');
 const openRecord=async(kind:string,value:Row)=>{
   if(kind==='user'){select('user',value);setForm({'Tên đăng nhập':value.ten_dang_nhap,'Họ và tên':value.ho_ten,'Số điện thoại':value.so_dien_thoai,'Vai trò':value.vai_tro});return;}
   if(kind==='order'){return mutate(async()=>{const found=await api<Row>(`/orders/${value.ma_don}`);select('order',found);},manager?'GD1.1-7-1':value.trang_thai_pha_che==='Bắt đầu pha chế'?'GD1.2-6-2':'GD1.2-6-1');}
   if(kind==='receipt')return mutate(async()=>{select('receipt',await api<Row>(`/inventory/receipts/${value.ma_po}`));},value.trang_thai_thanh_toan==='Công nợ'?'GD4.2-4a1-1':'GD4.2-4-1');
   if(kind==='report')return mutate(async()=>{select('report',await api<Row>(`/inventory/close-reports/${value.ma_bao_cao}`));},manager?'GD4.5-6-1':value.trang_thai==='Đã xác nhận'?'GD4.5-9-1':value.trang_thai==='Chờ xác nhận'?'GD4.5-4-1':'GD4.5-2-1');
   if(kind==='shift'){select('shift',value);setForm({'Ngày làm':dateText(value.ngay_lam),'Giờ bắt đầu':timeText(value.gio_bat_dau),'Giờ kết thúc':timeText(value.gio_ket_thuc),'Số lượng nhân viên tối thiểu':String(value.so_nhan_vien_toi_thieu),'Số lượng nhân viên tối đa':String(value.so_nhan_vien_toi_da)});setAssignment((value.nhan_vien??[]).map((v:Row)=>v.ma_nhan_vien));go(manager?'GD3.3-3-1':'GD6.1-6-1');return;}
   if(kind==='registration'){select('registration',value);go('GD6.3-4-1');return;}
   if(kind==='request'){select('request',value);const swap=value.loai_yeu_cau==='Đổi ca hai chiều';go(manager?(swap?'GD3.5-4-1':'GD3.5-3a2-1'):(swap?'GD6.5-4-1':'GD6.5-4-2'));}
 };
 const execute=async(label:string,record?:{kind:string;value:Row},position?:{x:number;y:number})=>{
   if((screen.name.startsWith('GD2.1-5a1')&&label==='Tạo tài khoản')||(screen.name.startsWith('GD2.2-5a1')&&label==='Lưu')||(/^GD2\.3-(5|4a2)-/.test(screen.name)&&['Khóa','Kích hoạt'].includes(label)))label='Xác nhận';
   if(record){if(record.kind==='cart'&&['+','−','Xóa món'].includes(label)){if(order)throw new ApiError(409,'ORDER_IMMUTABLE','Đơn đã được kiểm tra. Hãy hủy đơn trước khi thay đổi món.');setCart(rows=>rows.map(i=>i.ma_mon===record.value.ma_mon?{...i,so_luong:label==='Xóa món'?0:Number(i.so_luong)+(label==='+'?1:-1)}:i).filter(i=>i.so_luong>0));return;}
     if(record.kind==='menu'&&label==='+'){if(order)throw new ApiError(409,'ORDER_IMMUTABLE','Đơn đã được kiểm tra. Hãy hủy đơn trước khi thay đổi món.');
       setCart(v=>{const index=v.findIndex(i=>i.ma_mon===record.value.ma_mon);return index<0?[...v,{...record.value,so_luong:1}]:v.map((i,n)=>n===index?{...i,so_luong:i.so_luong+1}:i);});go('GD1.3-3-1');return;}
     if(record.kind==='candidate'){setAssignment(v=>v.includes(record.value.ma_nguoi_dung)?v.filter(id=>id!==record.value.ma_nguoi_dung):[...v,record.value.ma_nguoi_dung]);return;}
     if(['user','order','receipt','report','shift','registration','request'].includes(record.kind)){await openRecord(record.kind,record.value);if(label==='row'){if(record.kind==='shift'&&manager)go('GD3.4-2-1');return;}}
   }
   if(label==='Đăng nhập'){
     const username=form['Tên tài khoản']?.trim(),password=form['Mật khẩu'];if(!username&&!password){go('GD0-6a1-1');return;}if(!username){go('GD0-6a1-2');return;}if(!password){go('GD0-6a1-3');return;}
     return mutate(async()=>{try{const value=await api<Row>('/auth/login',{method:'POST',body:{ten_dang_nhap:username,mat_khau:password}});setUser(value);setForm({});go(value.vai_tro==='Quản lý'?'GD5.1-7-1':'GD1.3-2-1');}
       catch(e){field('Mật khẩu','');go('GD0-7a1-1');throw e;}});
   }
   if(label==='Đăng xuất'){go(manager?'GD7-3-2':'GD7-3-1');return;}
   if(label==='Xác nhận'&&screen.name.startsWith('GD7'))return mutate(async()=>{await api('/auth/logout',{method:'POST'});setUser(null);setForm({});setSelected({});setCart([]);setOrder(undefined);},'GD7-8-1');
   if(label==='Xem báo cáo'){
     const value=form['Ngày báo cáo'];if(value){const target=period==='year'?`${value}-01-01`:period==='month'?(/^\d{2}\/\d{4}$/.test(value)?`${value.slice(3)}-${value.slice(0,2)}-01`:value+'-01'):isoDate(value);
       if(!/^\d{4}-\d{2}-\d{2}$/.test(target)||Number.isNaN(new Date(target).getTime())){setError('Điều kiện tra cứu không hợp lệ. Vui lòng kiểm tra lại ngày.');return;}setReportDate(target);}
     refresh();return;
   }
   if(label==='Tải lại'||label==='Thử lại'){refresh();return;}
   if(['Trang trước','Trang sau'].includes(label)){setPage(v=>Math.max(1,v+(label==='Trang sau'?1:-1)));return;}
   if(label==='Tìm kiếm'||label==='Tra cứu'){setPage(1);refresh();return;}
   if(['‹','›','←','→'].includes(label)){setWeek(v=>addDays(v,label==='‹'||label==='←'?-7:7));return;}
   if(label==='Hôm nay'){setWeek(weekStart(today()));return;}
   if(/^GD5/.test(screen.name)){
     if(['Ngày','Tháng','Năm'].includes(label)){setPeriod(({Ngày:'day',Tháng:'month',Năm:'year'} as Record<string,string>)[label]);go(label==='Ngày'?'GD5.1-7-1':label==='Tháng'?'GD5.1-11-1':'GD5.1-11-2');return;}
     if(label==='Tiền mặt'||label==='Chuyển khoản'){setMethod(label==='Tiền mặt'?'Tiền mặt':'Chuyển khoản qua QR');go(label==='Tiền mặt'?'GD5.2-8-1':'GD5.2-8-2');return;}
     if(label==='Excel'||label==='PDF'){setFormat(label==='Excel'?'xlsx':'pdf');go(label==='Excel'?'GD5.3-4a1-1':'GD5.3-4b1-1');return;}
     if(label==='Xác nhận')return mutate(()=>download('/reports/revenue/export?'+query({period,date:reportDate,method:method||undefined,format}),`me-ca-phe-${reportDate}.${format}`),'GD5.3-8-1');
   }
   if(/^GD2/.test(screen.name)){
     if(label==='Tạo tài khoản'&&!screen.name.startsWith('GD2.1')){select('user',undefined);setForm({'Vai trò':'Nhân viên'});go('GD2.1-3-1');return;}
     if(label==='Tạo tài khoản'&&screen.name.startsWith('GD2.1')){go('GD2.1-5a1-1');return;}
     if(label==='Lưu'||label==='Lưu thay đổi'){go('GD2.2-5a1-1');return;}
     if(label==='Xác nhận')return mutate(async()=>{
       const value={ten_dang_nhap:form['Tên đăng nhập']??'',ho_ten:form['Họ và tên']??'',so_dien_thoai:form['Số điện thoại']??'',vai_tro:form['Vai trò']??'Nhân viên'};
       if(screen.name.startsWith('GD2.1'))return api('/users',{method:'POST',body:{...value,mat_khau:form['Mật khẩu']??'',xac_nhan_mat_khau:form['Xác nhận mật khẩu']??''}});
       if(!selected.user)throw new ApiError(422,'NO_USER','Không tìm thấy tài khoản.');
       if(screen.name.startsWith('GD2.2'))return api(`/users/${selected.user.ma_nguoi_dung}`,{method:'PATCH',body:value});
       return api(`/users/${selected.user.ma_nguoi_dung}/status`,{method:'PATCH',body:{trang_thai:selected.user.trang_thai==='Đã khóa'?'Đang hoạt động':'Đã khóa'}});
     },screen.name.startsWith('GD2.1')?'GD2.1-9-1':screen.name.startsWith('GD2.2')?'GD2.2-9-1':selected.user?.trang_thai==='Đã khóa'?'GD2.3-4a5-1':'GD2.3-8-1');
   }
   if(label==='Kiểm kê nguyên liệu'||(!manager&&label==='Kho'))return openCount();
   if(label==='Báo cáo cuối ca'||label==='Lập báo cáo cuối ca'){go(manager?'GD4.5-5-1':'GD4.5-2-1');return;}
   if(/^GD4/.test(screen.name)){
     if(label==='Đối chiếu'){setCountChecked(true);const preview=data.countPreview;const list:Row[]=preview?.items??[];
       if(!list.length||list.some(i=>countRows[i.ma_nguyen_lieu]?.ton_thuc_te===undefined)||!form['Tiền mặt thực thu']||!form['Chuyển khoản thực thu']){go('GD4.4-1a1-1');return;}
       const cash=Number(form['Tiền mặt thực thu'])+Number(form['Chuyển khoản thực thu'])-Number(preview.doanh_thu);
       if(cash!==0){go('GD4.4-6b2-1');return;}
       const different=list.some(i=>Math.abs(Number(countRows[i.ma_nguyen_lieu]?.ton_thuc_te)-Number(i.ton_ly_thuyet))>Number(i.nguong_chenh_lech));go(different?'GD4.4-6a5-1':'GD4.4-7-1');return;}
     if(label==='Lưu phiếu kiểm kho')return mutate(async()=>{if(!countChecked)throw new ApiError(422,'RECONCILE_REQUIRED','Vui lòng đối chiếu lại.');
       const count=await api<Row>('/inventory/counts',{method:'POST',body:{ma_ca:selected.shift?.ma_ca,tien_mat_thuc_thu:Number(form['Tiền mặt thực thu']),chuyen_khoan_thuc_thu:Number(form['Chuyển khoản thực thu']),...(form['Lý do chênh lệch tiền']?{ly_do_chenh_lech_tien:form['Lý do chênh lệch tiền']}:{}),items:(data.countPreview?.items??[]).map((i:Row)=>({ma_nguyen_lieu:i.ma_nguyen_lieu,ton_ly_thuyet:Number(i.ton_ly_thuyet),...countRows[i.ma_nguyen_lieu]}))}});
       const report=await api<Row>('/inventory/close-reports',{method:'POST',body:{ma_phieu:count.ma_phieu}});select('report',await api<Row>(`/inventory/close-reports/${report.ma_bao_cao}`));},'GD4.5-2-2');
     if(label==='Gửi báo cáo')return mutate(async()=>{const value=await api<Row>(`/inventory/close-reports/${selected.report?.ma_bao_cao}/send`,{method:'POST'});select('report',{...selected.report,...value});},'GD4.5-4-1');
     if(label==='Xác nhận báo cáo'){go('GD4.5-7-1');return;}
     if(label==='Xác nhận')return mutate(async()=>{const value=await api<Row>(`/inventory/close-reports/${selected.report?.ma_bao_cao}/confirm`,{method:'POST'});select('report',{...selected.report,...value});},'GD4.5-9-1');
     if(label==='Gửi thông tin nguyên liệu cần nhập')return mutate(()=>api(`/inventory/close-reports/${selected.report?.ma_bao_cao}/low-stock`,{method:'POST'}),'GD4.5-4a3-1');
   }
   if(/^GD[36]/.test(screen.name)){
     if(label==='+ Tạo ca mới'||label==='Tạo ca mới'){select('shift',undefined);setForm({'Ngày làm':dateText(today()),'Giờ bắt đầu':'07:00','Giờ kết thúc':'12:00','Số lượng nhân viên tối thiểu':'1','Số lượng nhân viên tối đa':'3'});setRecurrence('once');go('GD3.2-2-1');return;}
     if(label==='+'&&!manager){const index=Math.max(0,Math.min(6,Math.floor(((position?.x??489)-489)/146)));setForm({'Ngày làm':dateText(addDays(week,index)),'Giờ bắt đầu':'07:00','Giờ kết thúc':'12:00','Trạng thái':'Mong muốn'});go('GD6.2-2-1');return;}
     if(label==='Ca diễn ra một lần'){setRecurrence('once');go('GD3.2-2-1');return;}
     if(/Ca lặp/.test(label)){setRecurrence('weekly');go('GD3.2-3a2-1');return;}
     if(/Theo số tuần|Kết thúc theo số tuần/.test(label)){setRecurrenceEnd('weeks');go('GD3.2-3a2-2');return;}
     if(/Theo ngày|Kết thúc theo ngày/.test(label)){setRecurrenceEnd('date');go('GD3.2-3a2-1');return;}
     if(label==='Phân công'){go('GD3.4-2-1');return;}
     if(label==='Lưu'||label==='Xác nhận'){
       if(screen.name.startsWith('GD3.3')&&label==='Lưu'){go('GD3.3-6-1');return;}
       if(screen.name.startsWith('GD3.4'))return mutate(()=>api(`/shifts/${selected.shift?.ma_ca}/assignments`,{method:'PUT',body:{ma_nhan_vien:assignment}}),'GD3.4-9-1');
       if(/^GD3\.[23]/.test(screen.name))return mutate(()=>{
         const payload={ngay_lam:isoDate(form['Ngày làm']),gio_bat_dau:form['Giờ bắt đầu'],gio_ket_thuc:form['Giờ kết thúc'],so_nhan_vien_toi_thieu:Number(form['Số lượng nhân viên tối thiểu']),so_nhan_vien_toi_da:Number(form['Số lượng nhân viên tối đa'])};
         return api('/shifts'+(screen.name.startsWith('GD3.3')?`/${selected.shift?.ma_ca}`:''),{method:screen.name.startsWith('GD3.3')?'PATCH':'POST',body:{...payload,...(screen.name.startsWith('GD3.2')&&recurrence==='weekly'?{lap:recurrenceEnd==='weeks'?{so_tuan:Number(form['Số tuần'])}:{ngay_ket_thuc:isoDate(form['Ngày kết thúc'])}}:{})}});
       },screen.name.startsWith('GD3.3')?'GD3.3-11-1':'GD3.2-8-1');
       if(screen.name.startsWith('GD6.3'))return mutate(()=>api(`/shifts/availability/${selected.registration?.ma_dang_ky}`,{method:'DELETE'}),'GD6.3-10-1');
     }
     if(label==='Gửi đăng ký')return mutate(()=>api('/shifts/availability',{method:'POST',body:{ngay:isoDate(form['Ngày làm']),gio_bat_dau:form['Giờ bắt đầu'],gio_ket_thuc:form['Giờ kết thúc'],loai_dang_ky:form['Trạng thái']??'Mong muốn'}}),'GD6.2-8-1');
     if(label==='Rảnh'||label==='Mong muốn'){field('Trạng thái',label);go(label==='Rảnh'?'GD6.2-4-1':'GD6.2-2-1');return;}
     if(label==='Đổi hoặc xoay ca'){setForm(v=>({...v,'Loại yêu cầu':'Đổi ca hai chiều'}));go('GD6.4-5-1');return;}
     if(label==='Nhờ nhân viên khác làm thay'||label==='Đổi ca hai chiều'){field('Loại yêu cầu',label);go(label==='Đổi ca hai chiều'?'GD6.4-5-1':'GD6.4-6a1-1');return;}
     if(label==='Gửi yêu cầu')return mutate(()=>api('/shifts/requests',{method:'POST',body:{ma_ca:selected.shift?.ma_ca,loai_yeu_cau:form['Loại yêu cầu']??'Đổi ca hai chiều',ma_nhan_vien_duoc_de_nghi:form['Đồng nghiệp'],...(form['Loại yêu cầu']!=='Nhờ nhân viên khác làm thay'?{ma_ca_cua_dong_nghiep:form['Ca làm của đồng nghiệp']}:{}),ly_do:form['Lý do']??''}}),'GD6.4-13-1');
     if(label==='Đồng ý'||label==='Từ chối')return mutate(()=>api(`/shifts/requests/${selected.request?.ma_yeu_cau}/${manager?'decide':'respond'}`,{method:'POST',body:{dong_y:label==='Đồng ý'}}),manager?(label==='Đồng ý'?'GD3.5-9-1':'GD3.5-7a2-1'):(label==='Đồng ý'?'GD6.5-8-1':'GD6.5-6a3-1'));
   }
   if(/^GD1/.test(screen.name)){
     if(/^GD1\.2/.test(screen.name)&&['Bắt đầu pha chế','Hoàn tất pha chế','Hủy đơn','Xuất hóa đơn'].includes(label))return mutate(async()=>{
       const target=selected.order;if(!target)throw new ApiError(404,'NOT_FOUND','Không tìm thấy đơn hàng.');
       if(label==='Xuất hóa đơn')return download(`/orders/${target.ma_don}/invoice.pdf`,`hoa-don-${target.ma_don_hien_thi}.pdf`);
       if(label==='Hủy đơn'){await api(`/orders/${target.ma_don}`,{method:'DELETE'});select('order',undefined);return;}
       const value=await api<Row>(`/orders/${target.ma_don}/${label==='Bắt đầu pha chế'?'start-preparing':'complete'}`,{method:'POST'});select('order',{...target,...value});
     },label==='Hủy đơn'?'GD1.4-2-1':label==='Bắt đầu pha chế'?'GD1.2-6-2':'GD1.2-2-1');
     const categories=['Cà phê','Mê Soda','Trà sữa','Cam ép & Trà tắc','Sữa tươi','Matcha','Cacao','Khoai môn','Sữa chua','Topping'];
     if(categories.includes(label)){setCategory(label);go(({ 'Cà phê':'GD1.3-2-1','Mê Soda':'GD1.3-2-2','Trà sữa':'GD1.3-2-3',Matcha:'GD1.3-2-4'} as Record<string,string>)[label]??'GD1.3-2-1');return;}
     if(label==='Thêm món'){if(order){setError('Sau khi lưu tạm, đơn chỉ được thanh toán hoặc hủy.');return;}go('GD1.3-3-1');return;}
     if(label==='Tiếp tục lập hóa đơn'){if(!cart.length){setError('Đơn hàng phải có ít nhất một món.');return;}go('GD1.3-4-1');return;}
     if(label==='Kiểm tra đơn')return mutate(async()=>{if(!currentShift)throw new ApiError(409,'INVALID_SHIFT','Bạn cần được phân công vào ca đang diễn ra.');
       if(order)return order;const value=await api<Row>('/orders/drafts',{method:'POST',key:requestKey.current,body:{ma_ca:currentShift.ma_ca,items:cart.map(i=>({ma_mon:i.ma_mon,so_luong:i.so_luong}))}});setOrder({...value,items:cart});return value;},'GD1.3-6-1');
     if(label==='Xác nhận đơn')return mutate(async()=>{const value=await api<Row>(`/orders/${order?.ma_don}/confirm`,{method:'POST'});setOrder(v=>({...v,...value}));},'GD1.3-9-1');
     if(label==='QR')return mutate(async()=>{setPayment(await api<Row>('/payments/qr',{method:'POST',body:{ma_don:order?.ma_don}}));},'GD1.3-11-1');
     if(label==='Tiền mặt'){go('GD1.3-10a5-1');return;}
     if(label==='Xác nhận số tiền')return mutate(async()=>{setPayment(await api<Row>('/payments/cash',{method:'POST',body:{ma_don:order?.ma_don,so_tien_nhan:Number(form['Số tiền nhận được']??form['Tiền khách đưa'])}}));setOrder(v=>v?{...v,da_thanh_toan:true}:v);},'GD1.3-15-2');
     if(label==='Đối soát thành công')return mutate(async()=>{setPayment(await api<Row>(`/payments/${payment?.ma_giao_dich}/reconcile`,{method:'POST'}));setOrder(v=>v?{...v,da_thanh_toan:true}:v);},'GD1.3-15-1');
     if(label==='Xuất hóa đơn')return mutate(async()=>{await download(`/orders/${order?.ma_don}/invoice.pdf`,`hoa-don-${order?.ma_don_hien_thi}.pdf`);if(order?.trang_thai_pha_che==='Chưa pha chế'){const value=await api<Row>(`/orders/${order?.ma_don}/start-preparing`,{method:'POST'});setOrder(v=>({...v,...value}));}},'GD1.3-19-1');
     if(label==='Hoàn tất pha chế')return mutate(async()=>{await api(`/orders/${order?.ma_don}/complete`,{method:'POST'});setOrder(undefined);setCart([]);setPayment(undefined);requestKey.current=crypto.randomUUID();},'GD1.3-21-1');
     if(label==='Hủy đơn'||label==='Dừng đặt hàng')return mutate(async()=>{if(order)await api(`/orders/${order.ma_don}`,{method:'DELETE'});setOrder(undefined);setCart([]);setPayment(undefined);requestKey.current=crypto.randomUUID();},label==='Hủy đơn'?'GD1.4-2-1':'GD1.3-5a5-1');
   }
   const target=actionFor(label,screen,manager);if(target)go(target);
 };
 const action=async(label:string,record?:{kind:string;value:Row},position?:{x:number;y:number})=>{try{await execute(label,record,position);}catch(e){handleError(e);}};
 return{screen,screenId,user,ready,busy,manager,form,field,error,setError,data,selected,select,cart,setCart,order,payment,week,category,page,period,reportDate,setReportDate,method,format,assignment,countRows,setCountRows,countChecked,setCountChecked,go,refresh,action,openRecord,version};
}
