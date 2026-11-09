# BackEnd Mê Cà Phê

API Node.js + TypeScript + Express, dùng PostgreSQL trên Supabase. Mã chia theo chức năng trong `src/modules/`: routes/controller nhận yêu cầu, service xử lý nghiệp vụ, repository truy cập dữ liệu. FrontEnd là tầng giao diện của kiến trúc ba tầng.

## Cài đặt và chạy

Yêu cầu Node.js 22 trở lên và kết nối PostgreSQL. Trong thư mục `backend/`:

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Điền `DATABASE_URL` bằng chuỗi kết nối PostgreSQL trong dự án Supabase. Giữ `PG_SSL=true` cho Supabase; đặt `false` khi dùng PostgreSQL cục bộ không bật TLS. Với pooler Supabase, chọn session pooler nếu cần kết nối IPv4. Đây là chuỗi kết nối phía máy chủ; không đặt trong biến `VITE_*` hoặc đưa vào Git.

Điền `ADMIN_USERNAME`, `ADMIN_PASSWORD` (ít nhất 8 ký tự), `ADMIN_FULL_NAME`, `ADMIN_PHONE` để tạo quản lý ban đầu. Sau đó chạy:

```powershell
npm.cmd run migrate
npm.cmd run seed
npm.cmd run dev
```

API mặc định: `http://127.0.0.1:3000/api`. Kiểm tra: `GET /api/health`.

Lệnh seed chỉ tạo quản lý đầu tiên, không ghi đè tài khoản có sẵn và không tự tạo menu/giá/công thức giả. Các trường quản trị bootstrap có thể được bỏ khỏi .env sau khi đã tạo tài khoản.

```powershell
npm.cmd run build
npm.cmd start
npm.cmd test
```

Tests chạy PostgreSQL nhúng PGlite trong bộ nhớ, không đọc DATABASE_URL và không thay đổi Supabase.

## Xác thực và gọi từ FrontEnd

Đăng nhập qua `POST /api/auth/login` với `{ "ten_dang_nhap": "...", "mat_khau": "..." }`. Máy chủ đặt cookie HttpOnly `me_session`; phản hồi chỉ chứa thông tin công khai của tài khoản. FrontEnd gọi fetch với `credentials: 'include'`. Cookie được đặt Secure khi NODE_ENV=production, nên triển khai bằng HTTPS.

FRONTEND_ORIGINS phải chứa chính xác origin FrontEnd. Các yêu cầu thay đổi dữ liệu có cookie cần Origin hợp lệ; trình duyệt tự gửi header này. Khi thử bằng curl/Postman, thêm Origin tương ứng. Mọi yêu cầu đều kiểm tra phiên trong DB; khóa tài khoản hoặc thay vai trò thu hồi các phiên hiện tại.

## API và quy tắc

Xem [hợp đồng API](../docs/backend-api.md). Thành công trả `{ "data": ... }`; lỗi trả `{ "error": { "code": "...", "message": "..." } }`. Dữ liệu số NUMERIC PostgreSQL thường được trả dưới dạng chuỗi để giữ độ chính xác. Tiền nhập vào là số nguyên VND; số lượng nguyên liệu tối đa 3 chữ số thập phân.

Tạo đơn và nhập hàng cần header `Idempotency-Key` là UUID mới cho mỗi thao tác. Gửi lại cùng khóa và nội dung sẽ dùng kết quả cũ; dùng cùng khóa cho nội dung khác bị từ chối. Thanh toán/chốt ca có khóa giao dịch và ràng buộc chống ghi nhận trùng riêng.

Tồn lý thuyết được cập nhật theo nhập hàng và định mức của đơn đã thanh toán. Tồn khả dụng trừ thêm lượng đang giữ cho đơn chưa thanh toán. Phiếu kiểm kê và báo cáo cuối ca là dữ liệu cố định; xác nhận báo cáo cập nhật kho và trạng thái trong cùng giao dịch. Hệ thống giữ các biến động phát sinh sau lúc kiểm kê bằng cách áp dụng phần chênh lệch, tránh ghi đè số tồn mới.

Mỗi lần chỉ có một phiếu kiểm kho chưa được quản lý xác nhận trong toàn cửa hàng. Quy tắc này ngăn hai lần kiểm kê cùng đối chiếu một sai lệch. Đây là lựa chọn triển khai để bảo đảm thứ tự chốt kho, cần đối chiếu với quy trình vận hành khi tích hợp thực tế.

Doanh thu đã thanh toán được trả theo thời gian thực; `doanh_thu_da_chot` chỉ tính các ca đã được xác nhận. Hai số liệu tách riêng để xử lý khác biệt giữa yêu cầu theo dõi trực tiếp và yêu cầu chốt doanh thu trong báo cáo gốc.

## QR, PDF và cập nhật trực tiếp

QR mặc định chưa hoạt động, trả PAYMENT_NOT_CONFIGURED. Cấu hình QR_GATEWAY_URL/TOKEN và QR_WEBHOOK_SECRET theo hợp đồng trong tài liệu API. Đây là adapter chung, chưa được gắn với ngân hàng hoặc nhà cung cấp thanh toán cụ thể. API không nhận cờ thanh toán thành công tùy ý từ FrontEnd.

PDF cần font Unicode TTF/OTF. Windows tự dùng Arial trong thư mục Fonts; hệ điều hành khác cần PDF_FONT_PATH. Excel/PDF báo cáo lấy cùng bộ lọc và cùng dữ liệu tổng hợp. Hóa đơn PDF dùng giá đã lưu trong đơn hàng.

`GET /api/events` là luồng SSE gửi sự kiện refresh khi có thông báo nghiệp vụ mới, kiểm tra mỗi 2 giây. Client nhận sự kiện rồi tải lại dữ liệu qua API có phân quyền. Luồng đóng khi phiên bị thu hồi. Đây là cơ chế báo làm mới, không thay thế việc tải lại dữ liệu sau khi kết nối lại.

## Trạng thái tích hợp

BackEnd và migrations đã được viết, build và kiểm tra nghiệp vụ trong PostgreSQL nhúng. Chưa áp dụng migrations lên Supabase thực tế vì chưa có thông tin kết nối. FrontEnd hiện vẫn là bản xem trước Figma; việc nối màn hình với API và kiểm tra toàn bộ luồng giao diện là bước tiếp theo.
