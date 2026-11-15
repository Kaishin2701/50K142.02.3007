# Menu từ ảnh của quán

Nguồn: ảnh Mê Tea & More do người dùng cung cấp ngày 09/11/2026. Dữ liệu tại `database/seeds/menu-photo.json` gồm 11 nhóm, 160 lựa chọn món/size. Giá tính bằng VND. Dấu `null` nghĩa là size không được bán trên bảng, không phải giá 0. Topping bán theo phần, không gắn size. Mỗi size được lưu thành một bản ghi món riêng, ví dụ `Cà phê muối · M`, dùng nguyên mô hình dữ liệu hiện có.

Không thêm màn hình, nút hay luồng quản lý món. Chỉ bổ sung nhóm Trà trái cây vào bộ lọc bán hàng hiện có.

## Dữ liệu mẫu được chấp thuận

Định mức trong `backend/scripts/lib/photo-menu.ts` là công thức ước lượng để kiểm thử giữ/trừ tồn kho; lượng tồn được tạo cũng là số liệu giả lập. **Cả công thức lẫn tồn kho đều không phải công thức hay số liệu thật của quán**, và phiếu nhập được tạo chỉ là dữ liệu thử nghiệm, không phải giao dịch mua hàng thật. Nguyên liệu có hậu tố `(demo)`. Lần nhập đầu tạo một phiếu với nhà cung cấp `DỮ LIỆU DEMO - Tồn kho mẫu menu ảnh`, đơn giá 0, kèm biến động kho.

Chạy lại lệnh không tăng tồn kho, không tạo món trùng và không ghi đè công thức/trạng thái đã chỉnh. Nếu giá hoặc tên của món đã nhập bị sửa, lệnh dừng và hoàn tác toàn bộ lần nhập để tránh ghi đè dữ liệu.

## Nhập bằng lệnh

Mặc định, `npm run local` chỉ khởi tạo tài khoản và ca thử nghiệm; không nhập menu hoặc tồn kho. Để chủ động chạy ứng dụng với dữ liệu menu đầy đủ, từ thư mục gốc:

```sh
npm run local:demo
```

Lệnh trên dùng PostgreSQL nhúng tại `backend/.local/postgres/`, không đọc `DATABASE_URL`, `.env` hay kết nối Supabase/production; đồng thời bật QR mô phỏng, không thể dùng để chuyển khoản. POS xác nhận chế độ qua `GET /api/payments/mode`. Đăng nhập bằng tài khoản `quanly` hoặc `nhanvien`; mật khẩu được lưu trong `backend/.local/access.json`.

Có thể xem trước hoặc nạp thủ công. Các lệnh dưới đây chạy từ `backend/`:

```sh
# Chỉ đọc và kiểm tra dữ liệu, chưa kết nối database
npm run menu:import

# Chỉ database local trong backend/.local/postgres; dừng server local trước
npm run menu:import -- --apply --demo-stock --local

# Database QA cô lập trong backend/.local/qa/postgres
npm run menu:import -- --apply --demo-stock --qa
```

Trước khi dùng lệnh import QA, khởi tạo database và tài khoản QA từ `backend/` (lệnh thường không thêm menu):

```sh
npm run dev:local -- --qa
```

Hoặc chủ động tạo database QA cùng bộ menu demo ngay khi khởi động:

```sh
npm run dev:local -- --qa --demo-menu
```

Tài khoản QA được lưu riêng ở `backend/.local/qa/access.json`. Dừng server QA trước khi gọi `menu:import --qa` thủ công; lệnh apply dùng chung `server.lock` với server và sẽ bị từ chối khi database đang được giữ. Lệnh nhập chỉ cho phép chọn rõ `--local` hoặc `--qa`; không có chế độ dùng `DATABASE_URL`. Không đưa `.env` hay mật khẩu vào Git. Lệnh nhập không tự chạy khi build, deploy hoặc khởi động thông thường.

Nếu file `access.json` bị thiếu hoặc không còn khớp mật khẩu trong database, khởi động local sẽ cảnh báo và không tự đổi mật khẩu. Dừng đúng server rồi khôi phục tài khoản thử nghiệm bằng một trong các lệnh từ thư mục gốc:

```sh
npm run local:credentials -- --local
npm run local:credentials -- --qa
```

Chỉ chạy một lệnh với một đích. Lệnh cập nhật tài khoản `quanly` và `nhanvien` trong embedded database đã chọn, thu hồi các phiên cũ và ghi mật khẩu mới vào đúng `access.json`; mật khẩu không xuất hiện trong log. Không dùng lệnh này khi server database tương ứng đang chạy.

Để tạo lại database QA thử nghiệm, dừng server QA bằng Ctrl+C, rồi từ `backend/` chỉ xóa dữ liệu QA và khởi động lại:

```powershell
if (Test-Path .\.local\qa\postgres) { Remove-Item -Recurse -Force .\.local\qa\postgres }
if (Test-Path .\.local\qa\access.json) { Remove-Item -Force .\.local\qa\access.json }
npm run dev:local -- --qa --demo-menu
```

Không xóa `backend/.local/postgres/` nếu muốn giữ database local chính.

## Chưa nhập vì ảnh không rõ

- Cam ép: giá bị che.
- Dòng topping ngay sau Trân châu trắng: bị che/gạch bỏ.
- Dòng trà trái cây sau Trà Hibicus cam đào: bị che/gạch bỏ.
- Trà lựu đỏ thạch dừa và Trà lựu đỏ trân châu: chưa xác định chắc cột size/giá.

Các dòng này được ghi trong trường `pending`, không suy đoán giá. Người dùng đồng ý bỏ qua dòng không rõ.

## Kiểm chứng

Kiểm thử database riêng xác minh giá từng size, bỏ size không bán, nhập lại không trùng hoặc tăng tồn, toàn bộ 160 lựa chọn có công thức và có thể lập/hủy đơn, và thay đổi giá gây hoàn tác lần nhập. Không tạo đơn bán hàng thử trên database online.
