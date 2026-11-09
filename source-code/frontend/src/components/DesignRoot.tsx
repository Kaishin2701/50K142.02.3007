import React,{Children,cloneElement,isValidElement,type ReactElement,type ReactNode,type CSSProperties} from 'react';
import geometry from '../app/design-geometry.json';
import { useLive,currency,decimal,dateText,timeText,shiftText,addDays,salesCategories,today } from '../app/LiveContext';
import { actionFor } from '../app/navigation';
import { useCompactLayout } from '../app/useViewport';
import type { RecordData as Row } from '../services/api';
type E=ReactElement<Record<string,any>>;
type Meta=[number,number,number,number,number,number,string|null,string,string];
type Info={element:E;id:string;text:string;meta:Meta;index:number};
type RecordScope={kind:string;value:Row;index:number};
type Group={kind:string;items:Row[];nodes:Set<string>;template:Set<string>;x:number;y:number;width:number;height:number;step:number;calendar?:boolean;sourceX?:number};
const textOf=(value:ReactNode):string=>Children.toArray(value).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement(child)?textOf((child.props as any).children):'').join(' ').replace(/\s+/g,' ').trim();
const contains=(a:Meta,b:Meta)=>a[4]+a[2]/2>=b[4]-1&&a[4]+a[2]/2<=b[4]+b[2]+1&&a[5]+a[3]/2>=b[5]-1&&a[5]+a[3]/2<=b[5]+b[3]+1;
const editableLabels=/^(Tên tài khoản|Tên đăng nhập|Họ và tên|Số điện thoại|Mật khẩu|Xác nhận mật khẩu|Mã đơn|Từ ngày|Đến ngày|Lý do|Ghi chú|Ngày làm|Ngày kết thúc|Số tuần|Giờ bắt đầu|Giờ kết thúc|Số lượng nhân viên tối thiểu|Số lượng nhân viên tối đa|Tiền mặt thực thu|Chuyển khoản thực thu|Lý do chênh lệch tiền|Số tiền nhận được|Tiền khách đưa|Tìm kiếm|Vai trò|Loại ca|Đồng nghiệp|Ca làm của đồng nghiệp|Phương thức thanh toán|Trạng thái)$/;
const actionLabels=/^(Đăng nhập|Đăng xuất|Tạo tài khoản|Chỉnh sửa|Chi tiết|Khóa|Kích hoạt|Lưu|Lưu thay đổi|Xác nhận|Xác nhận báo cáo|Gửi báo cáo|Gửi đăng ký|Gửi yêu cầu|Đồng ý|Từ chối|Phân công|Đổi hoặc xoay ca|Hủy đăng ký|Đối chiếu|Lưu phiếu kiểm kho|Gửi thông tin nguyên liệu cần nhập|Tiếp tục lập hóa đơn|Kiểm tra đơn|Xác nhận đơn|QR|Tiền mặt|Đối soát thành công|Đối soát chưa thành công|Xuất hóa đơn|Hoàn tất pha chế|Hủy đơn|Dừng đặt hàng|Thêm món|Tìm kiếm|Tra cứu|Xem|Xem báo cáo|Xuất báo cáo|Excel|PDF|Đóng|Hủy|Không|×|\+|−|-|‹|›|Trang trước|Trang sau|Hôm nay|\+ Tạo ca mới|Ca diễn ra một lần|Ca lặp lại hằng tuần|Ca lặp hằng tuần|Theo ngày|Theo số tuần|Kết thúc theo ngày|Kết thúc theo số tuần|Đổi ca hai chiều|Nhờ nhân viên khác làm thay|Rảnh|Mong muốn)$/;

export function DesignRoot({children,screenId}:{children:ReactNode;screenId:string}){
 const live=useLive();const compact=useCompactLayout();if(import.meta.env.DEV&&new URLSearchParams(location.search).has('design'))return children;
 const metas=(geometry as unknown as Record<string,Record<string,Meta>>)[screenId]??{};
 const infos:Info[]=[];
 const collect=(nodes:ReactNode)=>Children.forEach(nodes,child=>{if(!isValidElement(child))return;const element=child as E,id=element.props['data-node-id'],meta=metas[id];
   if(id&&meta)infos.push({element,id,text:textOf(element.props.children),meta,index:infos.length});collect(element.props.children);});collect(children);
 const leaf=infos.filter(i=>!Children.toArray(i.element.props.children).some(child=>isValidElement(child)&&(child.props as any)['data-node-id']));
 const labelNodes=leaf.filter(i=>i.text&&i.meta[4]>=330),name=live.screen.name;
 const veil=infos.filter(i=>i.meta[2]===1440&&i.meta[3]===1024&&i.element.props['data-name']==='Rectangle').at(-1);
 const inModal=(i:Info)=>!veil||i.index>veil.index;
 const beforeModal=(i:Info)=>!veil||i.index<veil.index;
 const selectedOrder=/^GD1\.[12]/.test(name)?live.selected.order:name.startsWith('GD1.3-21-')?live.selected.completedOrder:live.order;
 const groups:Group[]=[];
 const addGroup=(kind:string,items:Row[],x:number,y:number,width:number,height:number,step:number,sampleBottom:number,modal=false)=>{
   const list=infos.filter(i=>i.meta[4]>=x-1&&i.meta[4]<x+width&&i.meta[5]>=y&&i.meta[5]<sampleBottom&&(modal?inModal(i):beforeModal(i)));
   const first=list.filter(i=>i.meta[5]<y+step);if(!first.length)return;
   // Only direct siblings are repeated; descendants stay attached to their original parent node.
   const parent=first[0].meta[6];const direct=list.filter(i=>i.meta[6]===parent);
   groups.push({kind,items,nodes:new Set(direct.map(i=>i.id)),template:new Set(direct.filter(i=>i.meta[5]<y+step).map(i=>i.id)),x,y,width,height,step});
 };
 if(/^GD2/.test(name))addGroup('user',live.data.users,386,326,1006,560,90,886);
 if(/^GD4\.1/.test(name))addGroup('material',live.data.materials,378,263,1022,600,90,624);
 if(/^GD4\.2/.test(name))addGroup('receipt',live.data.receipts,386,214,1006,600,29,800);
 if(/^GD4\.3/.test(name))addGroup('loss',live.data.losses,386,219,1006,600,29,805);
 if(/^GD1\.1/.test(name))addGroup('order',live.data.orders,358,391,1046,520,52,810);
 if(/^GD1\.2/.test(name))addGroup('order',live.data.orders,358,413,1046,480,68,550);
 if(/^GD4\.4/.test(name))addGroup('count',live.data.countPreview?.items??[],386,519,1000,325,67,799);
 if(/^GD4\.5/.test(name)){
   if(/Quản lý tiếp nhận báo cáo/.test(name))addGroup('report',live.data.reports,378,170,1020,650,110,267);
   else addGroup('countResult',live.selected.report?.items??[],386,492,1006,190,50,682);
 }
 if(/^GD3\.4/.test(name)){
   const anchor=labelNodes.find(i=>i.text==='Nhân viên có thể được phân công'&&inModal(i));
   if(anchor){
     const rows=infos.filter(i=>i.index>anchor.index&&inModal(i)&&i.meta[2]>500&&i.meta[3]>=40&&i.meta[3]<=60&&i.element.props['data-name']==='Rectangle');
     const row=rows[0];
     if(row){
       const step=rows[1]?rows[1].meta[5]-row.meta[5]:row.meta[3]+14;
       addGroup('candidate',live.data.candidates,row.meta[4],row.meta[5],row.meta[2],300,step,row.meta[5]+step*2,true);
     }
   }
 }
 if(/^GD3\.5/.test(name)&&/Danh sách yêu cầu|Không có yêu cầu/.test(name))addGroup('request',live.data.requests,342,258,755,420,110,600,true);
 if(/^GD6\.5/.test(name)&&/Danh sách yêu cầu/.test(name))addGroup('request',live.data.requests.filter((r:Row)=>r.ma_nhan_vien_duoc_de_nghi===live.user?.ma_nguoi_dung&&r.trang_thai==='Chờ đồng nghiệp'),372,370,700,350,66,450,true);
 if(/^GD1\.3/.test(name)&&/Chọn món/.test(name)){
   const menu=(live.data.menu as Row[]).filter(i=>i.danh_muc===live.category&&(!live.form['Tìm theo tên món...']||i.ten_mon.toLocaleLowerCase().includes(live.form['Tìm theo tên món...'].toLocaleLowerCase())));
   const first=infos.find(i=>i.meta[4]===358&&i.meta[3]===48&&i.meta[5]>360&&i.meta[5]<410&&i.element.props['data-name']==='Rectangle');
   if(first)addGroup('menu',menu,358,first.meta[5],654,570,48,965);
   const cartStart=infos.find(i=>i.meta[4]===1068&&i.meta[3]===112&&i.element.props['data-name']==='Rectangle');
   if(cartStart)addGroup('cart',live.cart,1068,cartStart.meta[5],320,565,112,cartStart.meta[5]+336);
 }
 if(/^GD1\.[34]/.test(name)&&!/Chọn món/.test(name)){
   const header=labelNodes.find(i=>i.text==='STT'&&i.meta[4]===358);
   if(header){const first=infos.find(i=>i.meta[4]===358&&i.meta[3]>=54&&i.meta[3]<=66&&i.meta[5]>header.meta[5]&&i.element.props['data-name']==='Rectangle');
     if(first)addGroup('line',live.cart.length?live.cart:(selectedOrder?.items??[]),358,first.meta[5],654,600,first.meta[3],first.meta[5]+first.meta[3]*3);}
 }
 // Replace the two demonstration invoice rows with the actual order lines.
 if(/^GD1\.[12]/.test(name)&&/Chi tiết/.test(name)){
   const heading=labelNodes.find(i=>i.text==='Danh sách món'&&inModal(i));
   if(heading){const header=labelNodes.find(i=>i.text==='Tên món'&&i.index>heading.index);
     if(header){const first=infos.find(i=>i.meta[6]===header.meta[6]&&i.index>header.index&&i.meta[3]>=40&&i.meta[3]<80&&i.element.props['data-name']==='Rectangle');
       if(first)addGroup('line',selectedOrder?.items??[],first.meta[4],first.meta[5],first.meta[2],150,first.meta[3],first.meta[5]+first.meta[3]*2,true);}}
 }
 if(/^GD[36]/.test(name)){
   const cards=infos.filter(i=>beforeModal(i)&&i.meta[2]===138&&i.meta[3]>=100&&i.meta[3]<=160&&i.meta[4]>=378&&i.meta[5]>=250&&i.meta[5]<700&&i.element.props['data-name']==='Rectangle');
   const assigned=cards.find(c=>!leaf.some(n=>contains(n.meta,c.meta)&&n.text==='Rảnh'))??cards[0];
   if(assigned){const relevant=infos.filter(i=>beforeModal(i)&&i.meta[6]===assigned.meta[6]&&i.meta[4]>=378&&i.meta[4]<1396&&i.meta[5]>=assigned.meta[5]&&i.meta[5]<850&&i.meta[2]<=150);
     const items:Row[]=[...(live.data.shifts as Row[]).filter(s=>s.ngay_lam>=live.week&&s.ngay_lam<=addDays(live.week,6)).map(s=>({...s,calendarKind:'shift'})),
       ...(live.manager?[]:(live.data.registrations as Row[]).filter(s=>s.ngay>=live.week&&s.ngay<=addDays(live.week,6)).map(s=>({...s,ngay_lam:s.ngay,calendarKind:'registration'})))];
     items.sort((a,b)=>(a.ngay_lam+a.gio_bat_dau).localeCompare(b.ngay_lam+b.gio_bat_dau));const perDay:Record<string,number>={};
     for(const item of items){item.dayIndex=Math.round((new Date(item.ngay_lam).getTime()-new Date(live.week).getTime())/86400000);item.slot=perDay[item.ngay_lam]??0;perDay[item.ngay_lam]=item.slot+1;}
     groups.push({kind:'calendar',items,nodes:new Set(relevant.map(i=>i.id)),template:new Set(relevant.filter(i=>i.meta[4]>=assigned.meta[4]&&i.meta[4]<assigned.meta[4]+138&&i.meta[5]<assigned.meta[5]+assigned.meta[3]).map(i=>i.id)),x:378,y:assigned.meta[5],width:1018,height:580,step:assigned.meta[3]+16,calendar:true,sourceX:assigned.meta[4]});
   }
 }

 const hasLineQuantityEditor=groups.some(group=>group.kind==='line'&&infos.some(info=>
   group.template.has(info.id)&&info.meta[4]===638&&info.meta[2]===72&&info.meta[3]===44
 ));
 const hiddenText=new Set<string>(),inputs=new Map<string,{label:string;content?:Info;select?:[string,string][];readOnly?:boolean}>(),buttons=new Map<string,{label:string;scope?:RecordScope}>();
 const actionText=new Set<string>();
 for(const info of labelNodes.filter(inModal)){
   const label=info.text;const actionable=actionLabels.test(label)||Boolean(actionFor(label,live.screen,live.manager))||(/^GD1\.3/.test(name)&&salesCategories.includes(label));if(!actionable)continue;
   if(['‹','›','←','→','×','+','−'].includes(label)){
     buttons.set(info.id,{label});
     continue;
   }
   const shape=infos.filter(s=>inModal(s)&&s.meta[6]===info.meta[6]&&s.meta[2]>=28&&s.meta[3]>=26&&s.meta[3]<=60&&s.text===''&&contains(info.meta,s.meta)&&s.index<info.index).sort((a,b)=>a.meta[2]*a.meta[3]-b.meta[2]*b.meta[3])[0];
   if(label==='Tìm kiếm'&&shape&&shape.meta[2]>250)continue;
   if(shape){buttons.set(shape.id,{label});actionText.add(info.id);}
   else if(info.meta[3]<=22)buttons.set(info.id,{label});
 }
 for(const info of leaf.filter(i=>i.meta[4]<326&&i.text&&beforeModal(i))){if(actionFor(info.text,live.screen,live.manager))buttons.set(info.id,{label:info.text});}
 const shapes=infos.filter(i=>inModal(i)&&!i.text&&i.meta[4]>=330&&i.meta[2]>=60&&i.meta[3]>=28&&i.meta[3]<=48&&['Rectangle','Vector'].includes(i.element.props['data-name']));
 for(const shape of shapes){if(buttons.has(shape.id))continue;
   const contents=labelNodes.filter(n=>inModal(n)&&n.meta[6]===shape.meta[6]&&contains(n.meta,shape.meta)&&!['⌄','×'].includes(n.text));
   const above=labelNodes.filter(n=>inModal(n)&&n.meta[6]===shape.meta[6]&&(editableLabels.test(n.text)||(/^GD6/.test(name)&&n.text==='Ngày'))&&Math.abs(n.meta[4]-shape.meta[4])<20&&n.meta[5]+n.meta[3]<=shape.meta[5]+2&&shape.meta[5]-n.meta[5]-n.meta[3]<40).sort((a,b)=>b.meta[5]-a.meta[5])[0];
   let label=above?.text??(contents[0]&&/^(Tìm|Nhập mã đơn|dd\/)/.test(contents[0].text)?contents[0].text:undefined);
   if(label==='Nhập mã đơn')label='Mã đơn';if(label==='dd/MM/yyyy')label=shape.meta[4]<700?'Từ ngày':'Đến ngày';
   if(/^GD5/.test(name)&&contents.some(i=>/^\d{2}\/\d{2}\/\d{4}$|^\d{2}\/\d{4}$|^\d{4}$/.test(i.text)))label='Ngày báo cáo';
   if(!label)continue;
   let options:[string,string][]|undefined;
   if(label==='Vai trò')options=[['Nhân viên','Nhân viên'],['Quản lý','Quản lý']];
   if(label==='Phương thức thanh toán')options=[['','Tất cả'],['Tiền mặt','Tiền mặt'],['Chuyển khoản qua QR','Chuyển khoản']];
   if(label==='Trạng thái'&&/^GD1\.2/.test(name))options=[['','Tất cả'],['Chưa pha chế','Chưa pha chế'],['Bắt đầu pha chế','Bắt đầu pha chế']];
   if(label==='Đồng nghiệp')options=[['',''],...(live.data.coWorkers??[]).map((u:Row)=>[u.ma_nguoi_dung,u.ho_ten] as [string,string])];
   if(label==='Ca làm của đồng nghiệp')options=[['',''],...(live.data.coWorkers??[]).find((u:Row)=>u.ma_nguoi_dung===live.form['Đồng nghiệp'])?.shifts?.map((s:Row)=>[s.ma_ca,shiftText(s)] as [string,string])??[]];
   inputs.set(shape.id,{label,content:contents[0],select:options,readOnly:/^GD6\.1|^GD6\.3|^GD2\.4|^GD3\.4/.test(name)});for(const content of contents)hiddenText.add(content.id);
 }
 // The login button and eye are vector layers in the original design.
 if(/^GD0|^GD7-8/.test(name)){
   const submit=labelNodes.find(i=>i.text==='Đăng nhập'&&i.meta[5]>550);if(submit){const shape=infos.find(i=>i.meta[2]===400&&i.meta[3]===44&&i.meta[5]<=submit.meta[5]&&i.meta[5]>590);if(shape){buttons.set(shape.id,{label:'Đăng nhập'});actionText.add(submit.id);}}
 }

 const initials=(name:string)=>name.trim().split(/\s+/).slice(-3).map(v=>v[0]).join('').toUpperCase();
 function fieldValue(label:string):string{
   if(label==='Ngày'&&/^GD6/.test(name))return live.form['Ngày làm']??'';
   if(label==='Ngày báo cáo')return live.form[label]??(live.period==='year'?live.reportDate.slice(0,4):live.period==='month'?`${live.reportDate.slice(5,7)}/${live.reportDate.slice(0,4)}`:dateText(live.reportDate));
   if(live.form[label]!==undefined)return live.form[label];
   if(/^GD2\.[234]/.test(name)&&live.selected.user){const u=live.selected.user;return String(({'Tên đăng nhập':u.ten_dang_nhap,'Họ và tên':u.ho_ten,'Số điện thoại':u.so_dien_thoai,'Vai trò':u.vai_tro} as Row)[label]??'');}
   return label==='Vai trò'?'Nhân viên':'';
 }
 const changeField=(label:string,value:string)=>live.field(label==='Ngày'&&/^GD6/.test(name)?'Ngày làm':label,value);
 function dynamicText(info:Info,scope?:RecordScope):string|undefined{
   const {text,meta:m}=info,x=m[4],y=m[5];const row=scope?.value;
   if(!text||!leaf.includes(info))return undefined;
   if(x<326&&y>850&&live.user){if(/^(Quản lý|Nhân viên)$/.test(text))return live.user.vai_tro;if(/^[A-Z]{2,3}$/.test(text))return initials(live.user.ho_ten);if(text!=='Đăng xuất'&&text!=='↪'&&m[2]>50)return live.user.ho_ten;}
   if(scope){
     if(scope.kind==='calendar'){
       if(/\d{2}:\d{2}/.test(text))return `${timeText(row!.gio_bat_dau)}–${timeText(row!.gio_ket_thuc)}`;
       if(/Đủ nhân sự|Cần bổ sung/.test(text))return row!.calendarKind==='registration'?row!.loai_dang_ky:(row!.thieu_nhan_vien?'Cần bổ sung':'Đủ nhân sự');
       if(/\d+ \/ \d+ nhân viên/.test(text))return row!.calendarKind==='registration'?row!.loai_dang_ky:`${row!.nhan_vien?.length??0} / ${row!.so_nhan_vien_toi_da} nhân viên`;
       if(text)return row!.calendarKind==='registration'?row!.loai_dang_ky:(row!.nhan_vien??[]).map((p:Row)=>p.ho_ten.split(' ').at(-1)).join(' · ');
     }
     if(scope.kind==='user'){if(['Chi tiết','Chỉnh sửa'].includes(text))return text;if(text==='Khóa'||text==='Kích hoạt')return row!.trang_thai==='Đã khóa'?'Kích hoạt':'Khóa';
       if(x<520)return row!.ten_dang_nhap;if(x<680)return row!.ho_ten;if(x<825)return row!.so_dien_thoai;if(x<925)return row!.vai_tro;if(x<1055)return row!.trang_thai;}
     if(scope.kind==='material'){if(x<425)return String(scope.index+1);if(x<530)return String(row!.ma_nguyen_lieu).slice(0,8);if(x<685)return row!.ten_nguyen_lieu;if(x<760)return row!.don_vi_tinh;if(x<875)return decimal(row!.ton_ly_thuyet);if(x<1000)return decimal(row!.ton_thuc_te_gan_nhat);if(x<1144)return decimal(row!.muc_ton_toi_thieu);return row!.trang_thai==='Sắp hết'?'Sắp hết':'Bình thường';}
     if(scope.kind==='receipt'){if(x<420)return String(scope.index+1+(live.page-1)*20);if(x<590)return String(row!.ma_po).slice(0,8);if(x<710)return dateText(row!.ngay_nhap);if(x<890)return row!.ten_nha_cung_cap;if(x<1030)return currency(row!.tong_tien);if(x<1180)return row!.trang_thai_thanh_toan;return row!.hinh_thuc_thanh_toan??'Chưa có';}
     if(scope.kind==='loss'){if(x<415)return String(scope.index+1);if(x<500)return dateText(row!.ngay_kiem_ke);if(x<565)return String(row!.ma_ca).slice(0,6);if(x<680)return row!.ten_nguyen_lieu;if(x<735)return row!.don_vi_tinh;if(x<830)return decimal(row!.ton_ly_thuyet_luc_kiem_ke);if(x<925)return decimal(row!.ton_thuc_te);if(x<1015)return decimal(row!.chenh_lech);if(x<1205)return row!.ly_do_chenh_lech==='Khác'?`Khác - ${row!.ghi_chu}`:row!.ly_do_chenh_lech;return row!.nguoi_ghi_nhan;}
     if(scope.kind==='order'){if(x<410)return String(scope.index+1);if(x<550)return '#'+row!.ma_don_hien_thi;if(x<885)return new Date(row!.thoi_gian_lap).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});if(x<980||(/^GD1\.2/.test(name)&&x<1130))return currency(row!.tong_tien);if(x<1170&&/^GD1\.1/.test(name))return row!.phuong_thuc==='Chuyển khoản qua QR'?'Chuyển khoản':row!.phuong_thuc;return row!.trang_thai_pha_che;}
     if(scope.kind==='menu'){if(text==='+')return '+';if(m[2]>400&&m[3]<30)return y>groups.find(g=>g.kind==='menu')!.y+20?row!.danh_muc:row!.ten_mon;}
     if(scope.kind==='cart'){if(/Số lượng|−|—/.test(text))return text==='—'?currency(Number(row!.so_luong)*Number(row!.don_gia_hien_tai)):text;if(/^\d+$/.test(text))return String(row!.so_luong);if(m[2]>=250)return y<groups.find(g=>g.kind==='cart')!.y+30?row!.ten_mon:row!.danh_muc;}
     if(scope.kind==='line'){const group=groups.find(g=>g.kind==='line')!;const headers=labelNodes.filter(i=>i.meta[5]<group.y&&i.meta[5]>group.y-90&&['STT','Tên món','Số lượng','Đơn giá','Thành tiền'].includes(i.text));
       const center=x+m[2]/2;
       const col=headers.sort((a,b)=>Math.abs(a.meta[4]+a.meta[2]/2-center)-Math.abs(b.meta[4]+b.meta[2]/2-center))[0]?.text;
       if(col==='STT')return String(scope.index+1);if(col==='Tên món')return row!.ten_mon_luc_lap??row!.ten_mon;if(col==='Số lượng')return String(row!.so_luong);
       if(col==='Đơn giá')return currency(row!.don_gia_luc_lap??row!.don_gia_hien_tai);if(col==='Thành tiền')return currency(Number(row!.so_luong)*Number(row!.don_gia_luc_lap??row!.don_gia_hien_tai));}
     if(scope.kind==='count'){if(x<490)return String(row!.ma_nguyen_lieu).slice(0,8);if(x<645)return row!.ten_nguyen_lieu;if(x<730)return row!.don_vi_tinh;if(x<855)return decimal(row!.ton_ly_thuyet);if(x>=995&&x<1110){const v=live.countRows[row!.ma_nguyen_lieu]?.ton_thuc_te;return live.countChecked&&v!==undefined?decimal(Number(v)-Number(row!.ton_ly_thuyet)):'—';}}
     if(scope.kind==='countResult'){if(x<590)return row!.ten_nguyen_lieu;if(x<725)return row!.don_vi_tinh;if(x<865)return decimal(row!.ton_thuc_te);if(x<990)return decimal(row!.chenh_lech);return row!.ly_do_chenh_lech??'-';}
     if(scope.kind==='candidate'){return /Rảnh|Mong muốn/.test(text)?row!.loai_dang_ky:row!.ho_ten;}
     if(scope.kind==='request'){if(/Đổi ca hai chiều|Nhờ nhân viên/.test(text))return row!.loai_yeu_cau;if(/Chờ xử lý/.test(text))return row!.trang_thai;if(/\d{2}\/\d{2}/.test(text))return shiftText(live.data.shifts.find((s:Row)=>s.ma_ca===row!.ma_ca));return row!.ho_ten_nguoi_gui??row!.nguoi_gui;}
     if(scope.kind==='report'){if(text==='Xem')return text;if(x<600)return String(row!.ma_bao_cao).slice(0,8);if(x<990)return row!.ho_ten_nguoi_lap??row!.ma_nguoi_kiem_ke;return row!.trang_thai;}
   }
   if(/^GD5/.test(name)||(name.startsWith('GD7')&&live.manager)){const r=live.data.revenue??{};
     if(/^[\d.,]+\s*[₫đ]$/.test(text)){return y>500?(live.method==='Chuyển khoản qua QR'?currency(r.chuyen_khoan):currency(r.tien_mat)):currency(r.doanh_thu);}
     if(/^\d+$/.test(text)&&y>300&&y<500)return String(r.so_ly??0);
     if(/^\d{2}\/\d{2}\/\d{4}$/.test(text))return dateText(live.reportDate);
   }
   if(/^GD4\.1/.test(name)&&/^Có \d+ nguyên liệu/.test(text))return `Có ${(live.data.materials as Row[]).filter(i=>i.trang_thai==='Sắp hết').length} nguyên liệu dưới mức tồn tối thiểu`;
   if(name.startsWith('GD4.5-5-')&&text.startsWith('Báo cáo cuối ca Ca sáng ngày')){
     const report=live.data.reports[0];
     return report?`Báo cáo cuối ca ngày ${dateText(report.ngay_kiem_ke)} ${String(report.trang_thai).toLocaleLowerCase('vi-VN')}`:'Báo cáo cuối ca';
   }
   if(/^GD1/.test(name)){
     if(/^\d+ món \/ \d+ số lượng$/.test(text)){
       const items=selectedOrder?.items??live.cart;
       return `${items.length} món / ${items.reduce((sum:number,item:Row)=>sum+Number(item.so_luong),0)} số lượng`;
     }
     if(!scope&&/\d[\d.,]*\s*đ/.test(text)&&! /^[\d.,]+\s*đ$/.test(text)){
       const total=selectedOrder?.tong_tien??live.cart.reduce((sum,item)=>sum+Number(item.so_luong)*Number(item.don_gia_hien_tai),0);
       return text.replace(/\d[\d.,]*\s*đ/g,currency(total));
     }
     if(!scope&&text.includes('#ME-')&&!/^#?ME-\d+$/.test(text))return text.replace(/#ME-\d+/g,selectedOrder?.ma_don_hien_thi?'#'+selectedOrder.ma_don_hien_thi:'—');
     if(!scope&&((x>1250&&text==='—')||(['Chưa pha chế','Bắt đầu pha chế','Hoàn tất pha chế'].includes(text)&&!buttons.has(info.id)&&!actionText.has(info.id))))return selectedOrder?.trang_thai_pha_che??'—';
     if(/^Hiển thị \d/.test(text)){const total=Number(live.data.orders[0]?.total??live.data.orders.length);const start=total?(live.page-1)*20+1:0;return `Hiển thị ${start}–${Math.min(live.page*20,total)} trên ${total} đơn`;}
     if(/^\d+ món · Tổng số lượng:/.test(text))return `${live.cart.length} món · Tổng số lượng: ${live.cart.reduce((n,i)=>n+Number(i.so_luong),0)}`;
     if(/· \d+ món$/.test(text)&&y<400)return `${live.category} · ${(live.data.menu as Row[]).filter(i=>i.danh_muc===live.category).length} món`;
     if(text==='—'&&!scope&&y>900)return currency(live.cart.reduce((n,i)=>n+Number(i.so_luong)*Number(i.don_gia_hien_tai),0));
     if(/^#?ME-\d+$/.test(text))return selectedOrder?.ma_don_hien_thi?'#'+selectedOrder.ma_don_hien_thi:'Chưa có';
     if(/^[\d.,]+\s*[₫đ]$/.test(text)&&!scope){
       const total=Number(selectedOrder?.tong_tien??live.cart.reduce((sum,i)=>sum+Number(i.so_luong)*Number(i.don_gia_hien_tai),0));
       const caption=labelNodes.filter(i=>i.meta[6]===m[6]&&i.text==='Tiền thừa trả khách'&&Math.abs(i.meta[5]-y)<45&&Math.abs(i.meta[4]-x)<330)[0]?.text;
       if(caption==='Tiền thừa trả khách')return currency(Math.max(0,Number(live.form['Số tiền nhận được']??0)-total));
       return currency(total);
     }
     if(/Chi tiết đơn #ME-/.test(text))return `Chi tiết đơn #${selectedOrder?.ma_don_hien_thi??''}`;
   }
   if(/^GD[36]/.test(name)){
     if(/^\d{2} – \d{2} tháng/.test(text)){const end=addDays(live.week,6);return `${live.week.slice(8)} – ${end.slice(8)} tháng ${end.slice(5,7)}, ${end.slice(0,4)}`;}
     if(/^\d{2}\/\d{2}$/.test(text)&&y<310){const index=Math.max(0,Math.min(6,Math.round((x-378)/146)));return dateText(addDays(live.week,index)).slice(0,5);}
   }
   if(/^GD4\.4/.test(name)){
     if(/^\d{2}\/\d{2}\/\d{4}$/.test(text))return dateText(today());
     if(/^\d{2}:\d{2}–\d{2}:\d{2}$/.test(text)&&live.selected.shift)return `${timeText(live.selected.shift.gio_bat_dau)}–${timeText(live.selected.shift.gio_ket_thuc)}`;
     if(/^KK\d/.test(text))return '—';if(text==='Nguyễn Minh Anh')return live.user?.ho_ten??'';
     if(/^[\d.,]+ đ$/.test(text)&&y<400)return currency(live.data.countPreview?.doanh_thu??0);
   }
   if(/^GD4\.5/.test(name)&&live.selected.report){const r=live.selected.report;
     if(/^\d{2}\/\d{2}\/\d{4}$/.test(text))return dateText(r.ngay_kiem_ke);
     if(/^Ca .*\d{2}:\d{2}–\d{2}:\d{2}$/.test(text))return r.gio_bat_dau?shiftText(r):shiftText(live.selected.shift);
     if(text==='-'&&labelNodes.some(label=>label.text==='Lý do chênh lệch tiền'&&label.meta[6]===m[6]&&Math.abs(label.meta[5]-y)<45))return r.ly_do_chenh_lech_tien??'-';
     if(/^BC\d/.test(text))return String(r.ma_bao_cao).slice(0,8);if(text==='Nguyễn Minh Anh')return r.ho_ten_nguoi_lap??live.user?.ho_ten;
     if(/^[\d.,+-]+ đ$/.test(text)){if(x<600)return currency(r.doanh_thu_ca_luc_doi_chieu);if(x<850)return currency(Number(r.tien_mat_thuc_thu)+Number(r.chuyen_khoan_thuc_thu));return currency(Number(r.tien_mat_thuc_thu)+Number(r.chuyen_khoan_thuc_thu)-Number(r.doanh_thu_ca_luc_doi_chieu));}
     if(['Nháp','Chờ xác nhận','Đã xác nhận'].includes(text))return r.trang_thai;
   }
   const u=live.selected.user,s=live.selected.shift,r=live.selected.request,p=live.selected.receipt,b=live.selected.report;
   const values:Record<string,string|undefined>={
     'Người xác nhận':b?.ho_ten_nguoi_xac_nhan??'—',
     'Thời gian xác nhận':b?.thoi_gian_xac_nhan?new Date(b.thoi_gian_xac_nhan).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—',
     'Tên đăng nhập':u?.ten_dang_nhap,'Họ và tên':u?.ho_ten,'Số điện thoại':u?.so_dien_thoai,'Vai trò':u?.vai_tro,'Trạng thái tài khoản':u?.trang_thai,
     'Ngày làm':s?dateText(s.ngay_lam):live.form['Ngày làm'],'Giờ bắt đầu':s?timeText(s.gio_bat_dau):live.form['Giờ bắt đầu'],'Giờ kết thúc':s?timeText(s.gio_ket_thuc):live.form['Giờ kết thúc'],
     'Số lượng nhân viên tối thiểu':s?String(s.so_nhan_vien_toi_thieu):undefined,'Số lượng nhân viên tối đa':s?String(s.so_nhan_vien_toi_da):undefined,
     'Nhân viên làm cùng ca':s?(s.nhan_vien??[]).filter((p:Row)=>p.ma_nhan_vien!==live.user?.ma_nguoi_dung).map((p:Row)=>p.ho_ten).join(' · '):undefined,
     'Nhân viên đã được phân công':s?(s.nhan_vien??[]).map((p:Row)=>p.ho_ten).join(' · '):undefined,
     'Nhân viên gửi':r?.ho_ten_nguoi_gui,'Nhân viên được đề nghị':r?.ho_ten_nguoi_nhan,'Lý do':r?.ly_do,
     'Ca làm cần thay đổi':r?shiftText(r.ca_hien_tai):s?shiftText(s):undefined,'Ca làm của đồng nghiệp':r?shiftText(r.ca_dong_nghiep):undefined,
     'Người kiểm kê':live.user?.ho_ten,'Người lập':b?.ho_ten_nguoi_lap??live.user?.ho_ten,
     'Nhà cung cấp':p?.ten_nha_cung_cap,'Ngày nhập':p?dateText(p.ngay_nhap):undefined,'Người xác nhận nhập hàng':p?.nguoi_xac_nhan,'Trạng thái thanh toán':p?.trang_thai_thanh_toan,'Hình thức thanh toán':p?.hinh_thuc_thanh_toan??(p?'Chưa có':undefined),
     'Nhân viên lập đơn:':selectedOrder?.nhan_vien_lap,'Phương thức thanh toán:':selectedOrder?.payments?.find((t:Row)=>t.trang_thai==='Thành công')?.phuong_thuc,
     'Thời gian lập đơn':selectedOrder?new Date(selectedOrder.thoi_gian_lap).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):undefined,
   };
   if(!actionLabels.test(text)&&!(text in values)){
     const label=labelNodes.filter(i=>i.meta[6]===m[6]&&i.id!==info.id&&values[i.text]!==undefined&&((Math.abs(i.meta[4]-x)<20&&i.meta[5]<y&&y-i.meta[5]<70)||(Math.abs(i.meta[5]-y)<8&&i.meta[4]+i.meta[2]<=x&&x-i.meta[4]-i.meta[2]<80))).sort((a,b)=>Math.abs(y-a.meta[5])-Math.abs(y-b.meta[5]))[0];
     if(label)return values[label.text];
   }
   if(/^(Trần Hoàng Nam|Nguyễn Minh Anh|Nguyễn Văn An|Trần Thị Bình|Lê Thị Mai|Trần Minh Thư|Phạm Minh)$/.test(text))return '—';
   if(/^(nguyenvana|tranthibinh|lethimai|phamminh)$/.test(text))return '—';
   return undefined;
 }

 function renderNode(node:ReactNode,scope?:RecordScope):ReactNode{
   if(!isValidElement(node))return node;const el=node as E,id=el.props['data-node-id'],info=infos.find(i=>i.id===id),meta=metas[id];
   if(['img','input','br','hr','source'].includes(String(el.type)))return cloneElement(el);
   if(hiddenText.has(id))return null;
   if(/^GD1\.3/.test(name)&&live.payment?.qrImageUrl&&info&&el.props['data-name']==='Vector'&&meta[2]>=100&&meta[2]===meta[3])return cloneElement(el,{},<img alt="QR" src={live.payment.qrImageUrl} style={{width:'100%',height:'100%',objectFit:'contain'}}/>);
   if(scope?.kind==='count'&&info?.text&&meta[4]>=855&&meta[4]<995)return null;
   if(scope?.kind==='count'&&info?.text&&meta[4]>=1110)return null;
   if(scope?.kind==='line'&&/^GD1\.3/.test(name)&&meta?.[4]>=638&&meta[4]<710&&meta[3]<25&&hasLineQuantityEditor)return null;
   const original=el.props.children;
   const replaced=info?dynamicText(info,scope):undefined;
   let nextChildren=replaced!==undefined?replaceText(original,replaced):renderChildren(original,scope);
   const props:any={};
   if(info&&replaced!==undefined&&/^[\d.,]+\s*đ$/.test(replaced)&&meta[2]<90){
     const alignRight=scope?.kind==='line';
     props.style={...el.props.style,width:100,whiteSpace:'nowrap',...(alignRight?{left:meta[0]+meta[2]-100,textAlign:'right'}:{})};
   }
   if(scope?.kind==='line'&&/^GD1\.3/.test(name)&&meta?.[4]===638&&meta[2]===72&&meta[3]===44){
     const row=scope.value;
     return cloneElement(el,{},<input className="live-input" aria-label={`Số lượng ${row.ten_mon??row.ten_mon_luc_lap}`} inputMode="numeric" readOnly={Boolean(live.order)} value={row.so_luong} onChange={event=>{
       if(!/^\d{0,4}$/.test(event.target.value))return;
       live.setCart(items=>items.map(item=>item.ma_mon===row.ma_mon?{...item,so_luong:event.target.value}:item));
     }} onBlur={()=>{
       live.setCart(items=>items.map(item=>item.ma_mon===row.ma_mon?{
         ...item,
         so_luong:Math.max(1,Math.min(1000,Number(item.so_luong)||1)),
       }:item));
     }}/>);
   }
   if(scope?.kind==='candidate'&&meta&&meta[2]===20&&meta[3]===20){
     const checked=live.assignment.includes(scope.value.ma_nguoi_dung);
     return cloneElement(el,{},<input type="checkbox" className="live-input" style={{appearance:'auto',padding:0,accentColor:'#c67d53'}} aria-label={scope.value.ho_ten} checked={checked} onChange={()=>void live.action('row',{kind:'candidate',value:scope.value})}/>);
   }
   if(meta&&scope?.kind==='count'){
     const shape=el.props['data-name']==='Rectangle'&&meta[3]>=28&&meta[3]<=48;
     if(shape&&meta[4]>=855&&meta[4]<995){const row=scope.value;const value=live.countRows[row.ma_nguyen_lieu]?.ton_thuc_te;
       return cloneElement(el,{},<input className="live-input" aria-label={`Tồn thực tế ${row.ten_nguyen_lieu}`} inputMode="decimal" value={value??''} onChange={e=>{live.setCountChecked(false);live.setCountRows(v=>({...v,[row.ma_nguyen_lieu]:{...v[row.ma_nguyen_lieu],ton_thuc_te:e.target.value===''?undefined:Number(e.target.value.replace(',','.'))}}));}}/>);}
     if(shape&&meta[4]>=1110){const row=scope.value;return cloneElement(el,{},<><select className="live-input" aria-label={`Lý do chênh lệch ${row.ten_nguyen_lieu}`} value={live.countRows[row.ma_nguyen_lieu]?.ly_do_chenh_lech??''} onChange={e=>live.setCountRows(v=>({...v,[row.ma_nguyen_lieu]:{...v[row.ma_nguyen_lieu],ly_do_chenh_lech:e.target.value||undefined,...(e.target.value==='Khác'?{ghi_chu:''}:{})}}))}><option value=""></option>{['Hao hụt','Đổ vỡ','Hết hạn','Khác'].map(v=><option key={v}>{v}</option>)}</select>{live.countRows[row.ma_nguyen_lieu]?.ly_do_chenh_lech==='Khác'&&<input className="live-input" aria-label={`Ghi chú ${row.ten_nguyen_lieu}`} style={{top:'100%',height:26,fontSize:11}} value={live.countRows[row.ma_nguyen_lieu]?.ghi_chu??''} onChange={e=>live.setCountRows(v=>({...v,[row.ma_nguyen_lieu]:{...v[row.ma_nguyen_lieu],ghi_chu:e.target.value}}))}/>}</>);}
   }
   const field=inputs.get(id);
   if(field){const value=fieldValue(field.label);const onChange=(value:string)=>changeField(field.label,value);const style:CSSProperties={fontSize:13,fontWeight:500,paddingLeft:field.content?Math.max(10,field.content.meta[4]-meta[4]):14};
     const input=field.select?<select className="live-input" style={style} aria-label={field.label} value={value} onChange={e=>onChange(e.target.value)}>{field.select.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:
       <input className="live-input" style={style} aria-label={field.label} type={/mật khẩu/i.test(field.label)?'password':'text'} readOnly={field.readOnly} autoComplete={/mật khẩu/i.test(field.label)?'current-password':'off'} value={value} placeholder={field.content&&/^(Tìm|Nhập|dd\/)/.test(field.content.text)?field.content.text:undefined} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&/^GD0|^GD7-8/.test(name))void live.action('Đăng nhập');}}/>;
     return cloneElement(el,{...props},nextChildren,input);
   }
   let button=buttons.get(id);
   if(scope?.kind==='cart'&&button?.label==='−'&&!info?.text)button=undefined;
   if(button&&scope?.kind==='menu'&&button.label!=='+')button=undefined;
   if(button&&scope?.kind==='request')button={label:'row'};
   if(scope?.kind==='candidate'){
     button=meta&&meta[2]>500&&meta[3]>=40?{label:'row'}:undefined;
     if(info?.text)props.style={...el.props.style,pointerEvents:'none'};
   }
   if(button&&scope?.kind==='user'&&['Khóa','Kích hoạt'].includes(button.label))button={label:scope.value.trang_thai==='Đã khóa'?'Kích hoạt':'Khóa'};
   if(scope&&info){if(scope.kind==='candidate'&&info.meta[3]>=40&&info.meta[2]>200)button={label:'row'};
     if(['order','receipt','report','request'].includes(scope.kind)&&info.text&&!actionText.has(id)&&!button)button={label:'row'};
     if(scope.kind==='menu'&&info.text==='+')button={label:'+'};
     if(scope.kind==='user'&&!actionText.has(id)&&['Khóa','Kích hoạt','Chi tiết','Chỉnh sửa'].includes(info.text)){const actual=info.text==='Khóa'||info.text==='Kích hoạt'?(scope.value.trang_thai==='Đã khóa'?'Kích hoạt':'Khóa'):info.text;button={label:actual};}
   }
   if(scope?.kind==='calendar')button=meta&&meta[2]===138&&meta[3]>=100&&meta[3]<=160?{label:'row'}:undefined;
   if(scope?.kind==='cart'&&info){if(info.text==='−')button={label:'−'};if(el.props['data-name']==='Dấu thêm')button={label:'+'};if(el.props['data-name']==='Thùng rác')button={label:'Xóa món'};}
   if(scope?.kind==='line'&&/^GD1\.3/.test(name)&&meta?.[4]===940&&meta[2]===16&&meta[3]===16)button={label:'Xóa món'};
   if(scope?.kind==='calendar'&&info?.text)props.style={...el.props.style,pointerEvents:'none'};
   if(button){const originalStyle=el.props.style??{};const record=scope?{kind:scope.kind==='calendar'?(scope.value.calendarKind==='registration'?'registration':'shift'):scope.kind==='line'&&button.label==='Xóa món'?'cart':scope.kind,value:scope.value}:undefined;
     const cannotAssign=name.startsWith('GD3.4')&&button.label==='Lưu'&&(!live.selected.shift||live.assignment.length<Number(live.selected.shift.so_nhan_vien_toi_thieu)||live.assignment.length>Number(live.selected.shift.so_nhan_vien_toi_da));
     const onClick=(event:React.MouseEvent)=>void live.action(scope?.kind==='calendar'&&event.shiftKey?'Chỉnh sửa':button!.label,record,meta?{x:meta[4],y:meta[5]}:undefined);
     if(el.type==='div'&&nextChildren){/* preserve icon layers inside a semantic button */}
     return React.createElement('button',{...el.props,...props,type:'button',key:el.key,className:el.props.className+' live-button',style:{...originalStyle},'aria-label':button.label==='row'?(scope?.kind==='calendar'?shiftText(scope.value):scope?.value.ho_ten??scope?.value.ma_don_hien_thi??scope?.value.ma_bao_cao??scope?.value.ma_po??'Xem'):button.label,disabled:live.busy||cannotAssign,onClick,
       onContextMenu:scope?.kind==='calendar'&&live.manager?(event:React.MouseEvent)=>{event.preventDefault();void live.action('Chỉnh sửa',record);}:undefined},nextChildren);
   }
   if(actionText.has(id))props.style={...el.props.style,pointerEvents:'none'};
   return cloneElement(el,props,nextChildren);
 }
 function renderChildren(children:ReactNode,scope?:RecordScope):ReactNode{
   const array=Children.toArray(children);const output:ReactNode[]=[];const rendered=new Set<Group>();
   for(const child of array){if(!isValidElement(child)){output.push(child);continue;}const el=child as E,id=el.props['data-node-id'];
     const group=!scope?groups.find(g=>g.nodes.has(id)):undefined;
     if(group){if(rendered.has(group))continue;rendered.add(group);
       const template=array.filter(v=>isValidElement(v)&&group.template.has((v.props as any)['data-node-id']));if(!template.length)continue;
       const parent=metas[id]?.[6],parentMeta=parent?metas[parent]:undefined,px=parentMeta?.[4]??0,py=parentMeta?.[5]??0;
       output.push(<div key={'live-'+group.kind} className="live-list" data-live-list={group.kind} style={{left:group.x-px,top:group.y-py,width:group.width,height:group.height}}><div style={{position:'relative',height:group.calendar?Math.max(group.height,...group.items.map(row=>(row.slot+1)*group.step)):group.items.length*group.step}}>{group.items.map((row,index)=><div key={row.ma_nguoi_dung??row.ma_don??row.ma_mon??row.ma_nguyen_lieu??row.ma_po??row.ma_bao_cao??row.ma_yeu_cau??row.ma_ca??row.ma_dang_ky??index} style={{position:'absolute',left:group.calendar?-(group.sourceX!-px)+row.dayIndex*146:-(group.x-px),top:-(group.y-py)+(group.calendar?row.slot:index)*group.step,width:parentMeta?.[2]??1440,height:parentMeta?.[3]??1024}}>{template.map((item,n)=><React.Fragment key={n}>{renderNode(item,{kind:group.kind,value:row,index})}</React.Fragment>)}</div>)}</div></div>);continue;
     }
     output.push(renderNode(child,scope));
   }return output;
 }
 function replaceText(children:ReactNode,value:string):ReactNode{
   const elements=Children.toArray(children);if(!elements.some(isValidElement))return value;
   let done=false;return elements.map((child,index)=>{if(!isValidElement(child)){if(done||!String(child).trim())return null;done=true;return value;}if(done)return null;done=true;return cloneElement(child as E,{},value);});
 }
 function compactNode(info:Info,scope?:RecordScope):ReactNode{
   if(hiddenText.has(info.id)||actionText.has(info.id))return null;
   if(!leaf.includes(info)&&!inputs.has(info.id)&&!buttons.has(info.id))return null;
   const rendered=renderNode(info.element,scope);
   if(!isValidElement(rendered))return null;
   const element=rendered as E;
   const field=inputs.get(info.id);
   const checkbox=scope?.kind==='candidate'&&info.meta[2]===20&&info.meta[3]===20;
   const quantity=scope?.kind==='line'&&info.meta[4]===638&&info.meta[2]===72&&info.meta[3]===44;
   const countControl=scope?.kind==='count'&&info.element.props['data-name']==='Rectangle'&&info.meta[3]>=28&&info.meta[3]<=48&&info.meta[4]>=855;
   if(field||checkbox||quantity||countControl){
     const label=field?.label??(checkbox?scope!.value.ho_ten:quantity?'Số lượng':info.meta[4]<995?'Tồn thực tế':'Lý do chênh lệch');
     return <label className={'compact-control'+(checkbox?' compact-checkbox':'')} key={info.id}>
       <span>{label}</span>{element}
     </label>;
   }
   if(element.type==='button'){
     if(scope?.kind==='candidate')return null;
     const label=element.props['aria-label'];
     const content=textOf(element.props.children);
     return cloneElement(element,{key:info.id},content||label);
   }
   if(!leaf.includes(info)||!info.text)return null;
   if(scope?.kind==='candidate'&&dynamicText(info,scope)===scope.value.ho_ten)return null;
   return cloneElement(element,{key:info.id});
 }
 function compactGroup(group:Group):ReactNode{
   const template=infos.filter(info=>group.template.has(info.id));
   const headers=labelNodes.filter(info=>info.meta[4]>=group.x&&info.meta[4]<group.x+group.width&&info.meta[5]<group.y&&info.meta[5]>=group.y-90&&!actionLabels.test(info.text));
   const table=['user','material','receipt','loss','order','line','count','countResult'].includes(group.kind);
   return <div className="compact-list" data-live-list={group.kind} key={group.kind}>
     {group.items.map((row,index)=>{
       const scope={kind:group.kind,value:row,index};
       return <article className={'compact-row compact-row-'+group.kind} key={index}>
         {template.map(info=>{
           const node=compactNode(info,scope);
           if(!node)return null;
           const center=info.meta[4]+info.meta[2]/2;
           const header=table&&leaf.includes(info)?[...headers].sort((a,b)=>Math.abs(a.meta[4]+a.meta[2]/2-center)-Math.abs(b.meta[4]+b.meta[2]/2-center))[0]:undefined;
           return <div className="compact-cell" key={info.id}>
             {header&&<span className="compact-field-label">{header.text}</span>}{node}
           </div>;
         })}
       </article>;
     })}
   </div>;
 }
 function compactPage():ReactNode{
   const login=/^GD0|^GD7-8/.test(name);
   const navLabels=[...new Set(leaf.filter(info=>info.meta[4]<326&&beforeModal(info)&&actionFor(info.text,live.screen,live.manager)&&info.text!=='Đăng xuất').map(info=>info.text))];
   const inputLabels=new Set([...inputs.values()].map(field=>field.label));
   const grouped=new Set(groups.flatMap(group=>[...group.nodes]));
   const tableHeaders=new Set(groups.filter(group=>!['menu','cart','calendar','candidate','request'].includes(group.kind)).flatMap(group=>labelNodes.filter(info=>info.meta[4]>=group.x&&info.meta[4]<group.x+group.width&&info.meta[5]<group.y&&info.meta[5]>=group.y-70).map(info=>info.id)));
   const entries:{x:number;y:number;key:string;node:ReactNode}[]=[];
   for(const info of infos){
     if(!inModal(info)||grouped.has(info.id)||tableHeaders.has(info.id))continue;
     if(login?(info.meta[4]<580||info.meta[5]<250||info.meta[5]>800):info.meta[4]<330)continue;
     if(inputLabels.has(info.text)&&!inputs.has(info.id))continue;
     if(/^GD[36]/.test(name)&&!veil&&/^(Thứ Hai|Thứ Ba|Thứ Tư|Thứ Năm|Thứ Sáu|Thứ Bảy|Chủ Nhật|\d{2}\/\d{2})$/.test(info.text))continue;
     if(/^GD1\.3/.test(name)&&salesCategories.includes(buttons.get(info.id)?.label??''))continue;
     const node=compactNode(info);
     if(node)entries.push({x:info.meta[4],y:info.meta[5],key:info.id,node});
   }
   const category=infos.find(info=>salesCategories.includes(buttons.get(info.id)?.label??''));
   if(category)entries.push({x:category.meta[4],y:category.meta[5],key:'categories',node:<nav className="compact-categories" aria-label="Nhóm món">{salesCategories.map(label=><button type="button" key={label} aria-pressed={live.category===label} onClick={()=>void live.action(label)}>{label}</button>)}</nav>});
   if(!veil)for(const group of groups)entries.push({x:group.x,y:group.y,key:'group-'+group.kind,node:compactGroup(group)});
   else for(const group of groups.filter(group=>[...group.nodes].some(id=>inModal(infos.find(info=>info.id===id)!))))entries.push({x:group.x,y:group.y,key:'group-'+group.kind,node:compactGroup(group)});
   // Checkout has two independent columns in the desktop design.
   const twoColumns=/^GD1\.3/.test(name)&&!veil;
   entries.sort((a,b)=>{
     const columnA=twoColumns&&a.x>=1050?1:0,columnB=twoColumns&&b.x>=1050?1:0;
     return columnA-columnB||a.y-b.y||a.x-b.x;
   });
   return <div className="compact-page">
     {!login&&live.user&&<header className="compact-header">
       <details key={screenId}>
         <summary aria-label="Mở menu điều hướng"><strong>Mê Cà Phê</strong><span aria-hidden="true">☰</span></summary>
         <div className="compact-profile">{live.user.ho_ten} · {live.user.vai_tro}</div>
         <nav aria-label="Điều hướng chính">{navLabels.map(label=><button type="button" key={label} onClick={()=>void live.action(label)}>{label}</button>)}<button type="button" onClick={()=>void live.action('Đăng xuất')}>Đăng xuất</button></nav>
       </details>
     </header>}
     <div className={'compact-content'+(login?' compact-login':'')}>
       {entries.map(entry=><React.Fragment key={entry.key}>{entry.node}</React.Fragment>)}
     </div>
     {live.error&&<div className="compact-alert" role="alert">{live.error}</div>}
   </div>;
 }
 if(compact)return compactPage();
 return <>{renderChildren(children)}{live.error&&<div className="f0690ef655e3a" role="alert" onClick={()=>live.setError('')}><p className="f8b86bf0aeba6" style={{left:14,top:16,height:'auto'}}>{live.error}</p></div>}</>;
}
