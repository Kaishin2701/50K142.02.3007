import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,waitFor,cleanup,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {LiveProvider,useLive} from '../src/app/LiveContext';
import Login from '../src/features/auth/screens/261-28311';
import Users from '../src/features/users/screens/261-28400';
import Create from '../src/features/users/screens/261-28831';
import Confirm from '../src/features/users/screens/261-29636';
import Success from '../src/features/users/screens/261-29777';
import Overview from '../src/features/reports/screens/261-37926';
import Menu from '../src/features/sales/screens/261-50660';
import Cart from '../src/features/sales/screens/261-50834';
import Draft from '../src/features/sales/screens/261-51059';
import Checked from '../src/features/sales/screens/261-51236';
import Confirmed from '../src/features/sales/screens/261-51396';
import Cash from '../src/features/sales/screens/261-53147';
import Paid from '../src/features/sales/screens/261-53473';
import Calendar from '../src/features/shifts/screens/261-31725';
import Assignment from '../src/features/shifts/screens/261-45238';
import Assigned from '../src/features/shifts/screens/261-46591';
import Logout from '../src/features/auth/screens/261-50345';
import LoggedOut from '../src/features/auth/screens/261-50641';
import Preparing from '../src/features/sales/screens/261-52033';
import Completed from '../src/features/sales/screens/261-52174';
import Stock from '../src/features/inventory/screens/261-39479';
import CloseReports from '../src/features/inventory/screens/261-43885';
const manager={ma_nguoi_dung:'11111111-1111-4111-8111-111111111111',ho_ten:'Quản lý thật',ten_dang_nhap:'quanly',vai_tro:'Quản lý',trang_thai:'Đang hoạt động'};
const initialUser={ma_nguoi_dung:'22222222-2222-4222-8222-222222222222',ten_dang_nhap:'from_database',ho_ten:'Người dùng từ DB',so_dien_thoai:'0901234000',vai_tro:'Nhân viên',trang_thai:'Đang hoạt động'};
let records:any[],calls:{url:string;method:string;body:any}[];
function setup(loggedIn:boolean,hash:string,employee=false,orderOverrides:Record<string,unknown>={}){
 records=[initialUser];calls=[];location.hash=hash;
 vi.stubGlobal('EventSource',class{addEventListener(){}close(){}});
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit={})=>{
   const method=options.method??'GET',body=options.body?JSON.parse(String(options.body)):undefined;calls.push({url:String(url),method,body});
   let data:any;
   if(String(url).endsWith('/auth/me')){if(!loggedIn)return new Response(JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Vui lòng đăng nhập.'}}),{status:401});data=employee?{...manager,vai_tro:'Nhân viên'}:manager;}
   else if(String(url).endsWith('/auth/login')){loggedIn=true;data=manager;}
   else if(String(url).includes('/reports/revenue'))data={doanh_thu:'70000',so_ly:'3',tien_mat:'50000',chuyen_khoan:'20000'};
   else if(String(url).endsWith('/inventory/materials'))data=[{ma_nguyen_lieu:'66666666-6666-4666-8666-666666666666',ten_nguyen_lieu:'Nguyên liệu từ DB',don_vi_tinh:'kg',ton_ly_thuyet:10,ton_thuc_te_gan_nhat:9,muc_ton_toi_thieu:2,trang_thai:'Bình thường'}];
   else if(String(url).endsWith('/menu'))data=[{ma_mon:'33333333-3333-4333-8333-333333333333',ten_mon:'Cà phê từ DB',danh_muc:'Cà phê',don_gia_hien_tai:25000}];
   else if(String(url).includes('/shifts?'))data={shifts:[{ma_ca:'44444444-4444-4444-8444-444444444444',ngay_lam:new Date(Date.now()+7*3600000).toISOString().slice(0,10)+'T00:00:00Z',gio_bat_dau:'00:00',gio_ket_thuc:'23:59:59',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:3,nhan_vien:[]}],registrations:[]};
   else if(String(url).endsWith('/candidates'))data=[{...initialUser,loai_dang_ky:'Mong muốn'}];
   else if(String(url).endsWith('/assignments'))data=[{ma_nhan_vien:initialUser.ma_nguoi_dung,ho_ten:initialUser.ho_ten}];
   else if(String(url).endsWith('/complete'))data={trang_thai_pha_che:'Hoàn tất pha chế'};
   else if(String(url).endsWith('/orders/drafts'))data={ma_don:'55555555-5555-4555-8555-555555555555',ma_don_hien_thi:'ME-TEST',tong_tien:25000,trang_thai_pha_che:'Chưa pha chế'};
   else if(String(url).endsWith('/orders/55555555-5555-4555-8555-555555555555'))data={ma_don:'55555555-5555-4555-8555-555555555555',ma_don_hien_thi:'ME-TEST',tong_tien:25000,trang_thai_pha_che:'Chưa pha chế',items:[{ma_mon:'33333333-3333-4333-8333-333333333333',ten_mon_luc_lap:'Cà phê từ DB',so_luong:1,don_gia_luc_lap:25000}],...orderOverrides};
   else if(String(url).endsWith('/confirm'))data={da_xac_nhan:true};
   else if(String(url).endsWith('/payments/cash'))data={trang_thai:'Thành công',tien_thua:25000};
   else if(String(url).includes('/users')&&method==='GET')data=records;
   else if(String(url).endsWith('/users')&&method==='POST'){const {mat_khau,xac_nhan_mat_khau,...value}=body;const row={...value,ma_nguoi_dung:crypto.randomUUID(),trang_thai:'Đang hoạt động'};records.push(row);data=row;}
   else data=[];
   return new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
 }));
 const views:any={'261:28311':Login,'261:28400':Users,'261:28831':Create,'261:29636':Confirm,'261:29777':Success,'261:37926':Overview,'261:50660':Menu,'261:50834':Cart,'261:51059':Draft,'261:51236':Checked,'261:51396':Confirmed,'261:53147':Cash,'261:53473':Paid,'261:31725':Calendar,'261:45238':Assignment,'261:46591':Assigned,'261:50345':Logout,'261:50641':LoggedOut,'261:52033':Preparing,'261:52174':Completed,'261:39479':Stock,'261:43885':CloseReports};
 function View(){const live=useLive();const Component=views[live.screenId]??Login;return <Component/>;}
 return render(<LiveProvider><View/></LiveProvider>);
}
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});
describe('Figma screens with live API data',()=>{
 it('shows stock fields in their correct columns and opens the manager closing reports',async()=>{
   setup(true,'261:39479');
   expect(await screen.findByText('Nguyên liệu từ DB')).toBeTruthy();
   expect(screen.getByText('66666666')).toBeTruthy();
   expect(screen.getByText('Bình thường')).toBeTruthy();
   expect(screen.queryByText('Cà phê hạt')).toBeNull();
   const user=userEvent.setup();
   await user.click(screen.getByRole('button',{name:'Duyệt báo cáo cuối ca',exact:true}));
   await waitFor(()=>expect(calls.some(call=>call.url.endsWith('/inventory/close-reports'))).toBe(true));
   expect(screen.queryByText(/Ca sáng ngày 06\/11\/2026/)).toBeNull();
 });
 it('restores the reserved checkout using server snapshots after a page reload',async()=>{
   sessionStorage.setItem(`me-cafe-checkout:${manager.ma_nguoi_dung}`,'55555555-5555-4555-8555-555555555555');
   setup(true,'261:51059',true);
   await waitFor(()=>expect(location.hash).toBe('#261:51236'));
   expect(await screen.findByText(/Báo tổng tiền 25.000 đ cho khách/)).toBeTruthy();
   expect(screen.queryByText(/Báo tổng tiền 122.000 đ/)).toBeNull();
   expect(screen.getByRole('button',{name:'Xác nhận đơn',exact:true})).toBeTruthy();
   expect(screen.queryByRole('textbox',{name:'Số lượng Cà phê từ DB'})).toBeNull();
   expect(calls.some(call=>call.url.endsWith('/orders/drafts'))).toBe(false);
 });
 it('keeps the completed order summary and allows starting the next order',async()=>{
   sessionStorage.setItem(`me-cafe-checkout:${manager.ma_nguoi_dung}`,'55555555-5555-4555-8555-555555555555');
   setup(true,'261:52033',true,{da_xac_nhan:true,da_thanh_toan:true,trang_thai_pha_che:'Bắt đầu pha chế',ma_don_hien_thi:'ME-000007'});
   const user=userEvent.setup();
   await user.click(await screen.findByRole('button',{name:'Hoàn tất pha chế',exact:true}));
   await screen.findByText('Đã ghi nhận hoàn tất pha chế cho đơn #ME-000007');
   expect(screen.getByText('1 món / 1 số lượng')).toBeTruthy();
   expect(screen.queryByText('3 món / 4 số lượng')).toBeNull();
   expect(screen.getAllByText('25.000 đ').length).toBeGreaterThan(0);
   await user.click(screen.getByRole('button',{name:'Lập đơn mới',exact:true}));
   await waitFor(()=>expect(location.hash).toBe('#261:50660'));
   expect(sessionStorage.getItem(`me-cafe-checkout:${manager.ma_nguoi_dung}`)).toBeNull();
 });
 it('supports both calendar arrows and assigns only real eligible employees',async()=>{
   setup(true,'261:31725');
   const user=userEvent.setup();
   await screen.findByRole('button',{name:'‹',exact:true});
   await user.click(screen.getByRole('button',{name:'›',exact:true}));
   await user.click(screen.getByRole('button',{name:'‹',exact:true}));
   await user.click(await screen.findByRole('button',{name:/00:00–23:59/}));
   const checkbox=await screen.findByRole('checkbox',{name:'Người dùng từ DB'});
   expect(screen.queryByText('Mai',{exact:true})).toBeNull();
   expect(screen.queryByText('Hà',{exact:true})).toBeNull();
   expect((screen.getByRole('button',{name:'Lưu',exact:true}) as HTMLButtonElement).disabled).toBe(true);
   await user.click(checkbox);
   await user.click(screen.getByRole('button',{name:'Lưu',exact:true}));
   await waitFor(()=>expect(calls.find(c=>c.method==='PUT'&&c.url.endsWith('/assignments'))?.body).toEqual({ma_nhan_vien:[initialUser.ma_nguoi_dung]}));
 });
 it('logs out from the sidebar through a real session revocation request',async()=>{
   setup(true,'261:37926');const user=userEvent.setup();
   await user.click(await screen.findByRole('button',{name:'Đăng xuất',exact:true}));
   await user.click(await screen.findByRole('button',{name:'Xác nhận',exact:true}));
   await screen.findByRole('textbox',{name:'Tên tài khoản'});
   expect(calls.some(c=>c.method==='POST'&&c.url.endsWith('/auth/logout'))).toBe(true);
 });
 it('adds and adjusts real menu items, reserves stock, confirms and pays cash through the existing screens',async()=>{
   setup(true,'261:50660',true);const user=userEvent.setup();await screen.findByText('Cà phê từ DB');
   await user.click(screen.getAllByRole('button',{name:'+',exact:true})[0]);
   await screen.findByRole('button',{name:'−',exact:true});
   await user.click(screen.getAllByRole('button',{name:'+',exact:true}).at(-1)!);
   await user.click(screen.getByRole('button',{name:'−',exact:true}));
   await user.click(screen.getByRole('button',{name:'Tiếp tục lập hóa đơn'}));
   const quantity=await screen.findByRole('textbox',{name:'Số lượng Cà phê từ DB'});
   await user.clear(quantity);await user.type(quantity,'2');
   expect((quantity as HTMLInputElement).value).toBe('2');
   await user.clear(quantity);await user.type(quantity,'1');
   expect(screen.queryByText('Bạc xỉu kem béo')).toBeNull();
   await user.click(await screen.findByRole('button',{name:'Kiểm tra đơn'}));
   await user.click(await screen.findByRole('button',{name:'Xác nhận đơn'}));
   await user.click(await screen.findByRole('button',{name:'Tiền mặt',exact:true}));
   await user.type(await screen.findByRole('textbox',{name:'Số tiền nhận được'}),'50000');
   await user.click(screen.getByRole('button',{name:'Xác nhận số tiền'}));
   await waitFor(()=>expect(calls.find(c=>c.url.endsWith('/payments/cash'))?.body.so_tien_nhan).toBe(50000));
   expect(calls.find(c=>c.url.endsWith('/orders/drafts'))?.body.items).toEqual([{ma_mon:'33333333-3333-4333-8333-333333333333',so_luong:1}]);
   await waitFor(()=>expect(location.hash).toBe('#261:53473'));
 });
 it('uses real authentication and never accepts the old demo password locally',async()=>{
   setup(false,'261:28311');const user=userEvent.setup();
   await user.type(await screen.findByRole('textbox',{name:'Tên tài khoản'}),'actual_user');
   await user.type(screen.getByLabelText('Mật khẩu'),'actual-password');
   await user.click(screen.getByRole('button',{name:'Đăng nhập',exact:true}));
   await waitFor(()=>expect(calls.some(c=>c.url.endsWith('/auth/login'))).toBe(true));
   expect(calls.find(c=>c.url.endsWith('/auth/login'))?.body).toEqual({ten_dang_nhap:'actual_user',mat_khau:'actual-password'});
   await waitFor(()=>expect(location.hash).toBe('#261:37926'));
 });
 it('replaces demonstration people with database rows, including all rows',async()=>{
   setup(true,'261:28400');await screen.findByText('Người dùng từ DB');
   expect(screen.queryByText('Nguyễn Văn An')).toBeNull();expect(screen.queryByText('Lê Thị Mai')).toBeNull();
   expect(screen.getByText('Quản lý thật')).toBeTruthy();
 });
 it('creates an account through the confirmation screen and reloads persisted users',async()=>{
   setup(true,'261:28400');const user=userEvent.setup();await screen.findByText('Người dùng từ DB');
   await user.click(screen.getByRole('button',{name:'Tạo tài khoản',exact:true}));
   await user.type(await screen.findByRole('textbox',{name:'Tên đăng nhập'}),'new_employee');
   await user.type(screen.getByRole('textbox',{name:'Họ và tên'}),'Nhân viên mới');await user.type(screen.getByRole('textbox',{name:'Số điện thoại'}),'0909999888');
   await user.type(screen.getByLabelText('Mật khẩu',{exact:true}),'safe-password');await user.type(screen.getByLabelText('Xác nhận mật khẩu'),'safe-password');
   await user.click(screen.getByRole('button',{name:'Tạo tài khoản',exact:true}));
   await user.click(await screen.findByRole('button',{name:'Tạo tài khoản',exact:true}));
   await waitFor(()=>expect(records.some(u=>u.ten_dang_nhap==='new_employee')).toBe(true));
   expect(calls.find(c=>c.method==='POST'&&c.url.endsWith('/users'))?.body.vai_tro).toBe('Nhân viên');
 });
 it('binds revenue totals from the API instead of Figma sample amounts',async()=>{
   setup(true,'261:37926');await screen.findByText('70.000 đ');expect(screen.queryByText('9.250.000 ₫')).toBeNull();expect(screen.getByText('3')).toBeTruthy();
 });
});
