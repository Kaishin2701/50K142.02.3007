# Menu từ ảnh của quán

Nguồn: ảnh Mê Tea & More do người dùng cung cấp ngày 09/11/2026. Dữ liệu tại `database/seeds/menu-photo.json` gồm 11 nhóm, 160 lựa chọn món/size. Giá tính bằng VND. Dấu `null` nghĩa là size không được bán trên bảng, không phải giá 0. Topping bán theo phần, không gắn size. Mỗi size được lưu thành một bản ghi món riêng, ví dụ `Cà phê muối · M`, dùng nguyên mô hình dữ liệu hiện có.

Không thêm màn hình, nút hay luồng quản lý món. Chỉ bổ sung nhóm Trà trái cây vào bộ lọc bán hàng hiện có.

## Dữ liệu mẫu được chấp thuận

Người dùng chấp thuận dùng công thức mẫu cho bài demo. Định mức trong `backend/scripts/lib/photo-menu.ts` là ước lượng để kiểm thử giữ/trừ tồn kho, **không phải công thức thật của quán**. Nguyên liệu có hậu tố `(demo)`. Lần nhập đầu tạo một phiếu nhập với nhà cung cấp `DỮ LIỆU DEMO - Tồn kho mẫu menu ảnh`, đơn giá 0, kèm biến động kho. Đây là dữ liệu mô phỏng, không phải giao dịch mua hàng thật.

Chạy lại lệnh không tăng tồn kho, không tạo món trùng và không ghi đè công thức/trạng thái đã chỉnh. Nếu giá hoặc tên của món đã nhập bị sửa, lệnh dừng và hoàn tác toàn bộ lần nhập để tránh ghi đè dữ liệu.

## Nhập bằng lệnh

Từ `backend/`:

```sh
# Chỉ đọc và kiểm tra dữ liệu, chưa kết nối database
npm run menu:import

# Database trong backend/.env, cần có tài khoản quản lý quanly
npm run menu:import -- --apply --demo-stock

# Database local đã được khởi tạo bởi npm run dev:local
# Dừng server local trước khi chạy để tránh mở database hai lần
npm run menu:import -- --apply --demo-stock --local
```

Không đưa `.env` hay mật khẩu vào Git. Lệnh nhập không tự chạy khi build, deploy hoặc khởi động server.

## Chưa nhập vì ảnh không rõ

- Cam ép: giá bị che.
- Dòng topping ngay sau Trân châu trắng: bị che/gạch bỏ.
- Dòng trà trái cây sau Trà Hibicus cam đào: bị che/gạch bỏ.
- Trà lựu đỏ thạch dừa và Trà lựu đỏ trân châu: chưa xác định chắc cột size/giá.

Các dòng này được ghi trong trường `pending`, không suy đoán giá. Người dùng đồng ý bỏ qua dòng không rõ.

## Kiểm chứng

Kiểm thử database riêng xác minh giá từng size, bỏ size không bán, nhập lại không trùng hoặc tăng tồn, toàn bộ 160 lựa chọn có công thức và có thể lập/hủy đơn, và thay đổi giá gây hoàn tác lần nhập. Không tạo đơn bán hàng thử trên database online.
