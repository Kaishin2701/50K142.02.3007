# Hợp đồng API Mê Cà Phê

Base URL: `http://127.0.0.1:3000/api`. Mặc định trả JSON. `:id` là UUID. QL = Quản lý; NV = Nhân viên. Tất cả API ngoài health, login và webhook cần đăng nhập. POST/PATCH/PUT/DELETE từ phiên cookie cần Origin nằm trong FRONTEND_ORIGINS.

## Xác thực và tài khoản

| Phương thức | Đường dẫn | Quyền | Nội dung |
|---|---|---|---|
| GET | /health | Công khai | Kết nối DB |
| POST | /auth/login | Công khai | ten_dang_nhap, mat_khau |
| GET | /auth/me | QL/NV | Người dùng hiện tại |
| POST | /auth/logout | QL/NV | Thu hồi phiên |
| GET | /users | QL | search, page, limit |
| POST | /users | QL | Tạo tài khoản |
| GET | /users/:id | QL | Chi tiết |
| PATCH | /users/:id | QL | Sửa thông tin |
| PATCH | /users/:id/status | QL | trang_thai: Đang hoạt động hoặc Đã khóa |

Tạo tài khoản: ten_dang_nhap (3–50 ký tự chữ/số/_.-), ho_ten, so_dien_thoai (9–15 chữ số, có thể có +), vai_tro (Quản lý/Nhân viên), mat_khau, xac_nhan_mat_khau. Sửa tài khoản gửi các trường tương tự, trừ hai trường mật khẩu. Không được khóa/hạ quyền quản lý hoạt động cuối cùng.

## Menu và đơn hàng

| Phương thức | Đường dẫn | Quyền | Nội dung |
|---|---|---|---|
| GET | /menu | QL/NV | Danh sách món; NV chỉ thấy món đang hoạt động |
| POST | /menu | QL | ten_mon, danh_muc, don_gia_hien_tai, dang_hoat_dong |
| PATCH | /menu/:id | QL | Cùng cấu trúc tạo món |
| GET | /menu/:id/recipe | QL/NV | Định mức |
| PUT | /menu/:id/recipe | QL | Mảng {ma_nguyen_lieu,dinh_luong} |
| GET | /orders | QL/NV | Đơn đang xử lý |
| GET | /orders/history | QL | Chỉ đơn Hoàn tất pha chế |
| POST | /orders/drafts | NV | Kiểm tra và giữ tồn; chưa cấp mã hiển thị |
| POST | /orders | NV | Giữ tồn và xác nhận đơn trong một giao dịch |
| POST | /orders/:id/confirm | NV | Cấp mã hiển thị cho đơn nháp |
| GET | /orders/:id | QL/NV | Đơn, dòng món, giao dịch |
| DELETE | /orders/:id | NV | Hủy và giải phóng tồn khi chưa thanh toán/chưa pha chế |
| POST | /orders/:id/start-preparing | NV | Sau khi thanh toán |
| POST | /orders/:id/complete | NV | Sau khi bắt đầu pha chế |
| GET | /orders/:id/invoice.pdf | QL/NV | Hóa đơn PDF cho đơn đã thanh toán |
| GET | /orders/:id/preparation-ticket | QL/NV | Dữ liệu phiếu pha chế |

Tạo đơn/nháp cần header Idempotency-Key (UUID). Body:

```json
{"ma_ca":"<UUID ca>","items":[{"ma_mon":"<UUID món>","so_luong":2}]}
```

Các chuỗi `<UUID ...>` trong ví dụ cần thay bằng ID thật được trả về khi tạo dữ liệu.

NV cần được phân công vào ca đang diễn ra. Tổng tiền và định mức được tính ở máy chủ. Không có API sửa đơn đã xác nhận; hủy đơn chưa thanh toán để tạo lại nếu cần. NV truy cập đơn thuộc ca được phân công; lịch sử hoàn tất dành cho QL.

Tra cứu đơn: page (mặc định 1), limit (mặc định 20, tối đa 100), code, from/to (YYYY-MM-DD), method (Tiền mặt/Chuyển khoản qua QR). Đơn đang xử lý hỗ trợ status (Chưa pha chế/Bắt đầu pha chế). Giá và tên món lúc lập đơn được lưu cố định.

## Thanh toán

| Phương thức | Đường dẫn | Quyền | Nội dung |
|---|---|---|---|
| POST | /payments/cash | NV | ma_don, so_tien_nhan |
| POST | /payments/qr | NV | ma_don |
| POST | /payments/:id/reconcile | NV | Đối soát giao dịch QR |
| POST | /payments/webhook | Chữ ký máy chủ | Sự kiện từ cổng thanh toán |

Tiền mặt thiếu bị từ chối; đủ/thừa trả thêm tien_thua. Mỗi đơn chỉ có một giao dịch thành công. Chỉ khi thanh toán thành công, phần tồn đã giữ được chuyển thành tiêu hao thực tế trên sổ lý thuyết.

Adapter QR gửi POST JSON tới QR_GATEWAY_URL với Bearer QR_GATEWAY_TOKEN:

```json
{"paymentId":"<UUID>","orderCode":"ME-000001","amount":25000,"reference":"<UUID>"}
```

Cổng cần trả `{ "qrContent": "...", "expiresAt": "ISO timestamp tùy chọn" }`. qrContent phải là mã thanh toán do nhà cung cấp thực tạo. Adapter chưa gắn với nhà cung cấp cụ thể.

Webhook body:

```json
{"eventId":"unique-event-id","paymentId":"<UUID>","orderCode":"ME-000001","reference":"<UUID>","amount":25000,"status":"success"}
```

status nhận success/pending/failed. Header `X-Webhook-Signature` là HMAC-SHA256 của đúng raw body, mã hóa hex, dùng QR_WEBHOOK_SECRET; chấp nhận tiền tố sha256=. Webhook chỉ lưu sự kiện đã xác minh. Nhân viên gọi reconcile để ghi nhận thanh toán, chỉ thành công khi mã đơn/tham chiếu khớp và số tiền đủ. Sự kiện lặp không ghi nhận lại; cùng eventId mà khác nội dung bị từ chối. QR đang chờ hoặc chưa rõ kết quả không được tính vào doanh thu.

## Ca làm

| Phương thức | Đường dẫn | Quyền | Nội dung |
|---|---|---|---|
| GET | /shifts | QL/NV | from/to YYYY-MM-DD, tối đa 31 ngày; QL xem toàn bộ, NV xem lịch cá nhân và đồng nghiệp cùng ca |
| POST | /shifts | QL | Tạo một ca hoặc chuỗi ca |
| PATCH | /shifts/:id | QL | Sửa ca chưa bắt đầu |
| GET | /shifts/:id/candidates | QL | Nhân viên đăng ký phù hợp; ưu tiên Mong muốn |
| PUT | /shifts/:id/assignments | QL | {ma_nhan_vien:[UUID,...]}, thay danh sách phân công |
| POST | /shifts/availability | NV | Đăng ký lịch rảnh/mong muốn |
| DELETE | /shifts/availability/:id | NV | Không cho hủy đăng ký đã được dùng để phân công |
| GET | /shifts/requests | QL/NV | QL xem yêu cầu Chờ xử lý; NV xem yêu cầu liên quan |
| POST | /shifts/requests | NV | Yêu cầu đổi/làm thay |
| POST | /shifts/requests/:id/respond | NV được đề nghị | {dong_y:true/false} |
| POST | /shifts/requests/:id/decide | QL | {dong_y:true/false} |

Ca làm: ngay_lam YYYY-MM-DD, gio_bat_dau/gio_ket_thuc HH:mm, so_nhan_vien_toi_thieu, so_nhan_vien_toi_da. Kết thúc phải sau bắt đầu trong cùng ngày. Tạo chuỗi thêm `lap: {so_tuan:4}` hoặc `lap: {ngay_ket_thuc:"2027-01-31"}`, chọn đúng một cách, tối đa 52 tuần. Một ca trùng làm toàn bộ chuỗi thất bại. PATCH gửi đủ trường ca, không gửi lap; chỉ chỉnh lần ca được chọn.

Đăng ký: ngay, gio_bat_dau, gio_ket_thuc, loai_dang_ky (Rảnh/Mong muốn). Yêu cầu đổi ca: ma_ca, ma_nhan_vien_duoc_de_nghi, loai_yeu_cau (Đổi ca hai chiều/Nhờ nhân viên khác làm thay), ly_do. Với đổi hai chiều thêm ma_ca_cua_dong_nghiep; làm thay thì bỏ trường này.

Yêu cầu đi Chờ đồng nghiệp → Chờ xử lý → Đã chấp thuận hoặc Bị từ chối. Khi đồng nghiệp từ chối, yêu cầu kết thúc. Máy chủ kiểm tra lại trùng lịch khi gửi, khi đồng nghiệp đồng ý và khi QL duyệt. Thay lịch và cập nhật trạng thái nằm trong cùng giao dịch.

## Kho và cuối ca

| Phương thức | Đường dẫn | Quyền | Nội dung |
|---|---|---|---|
| GET | /inventory/materials | QL | Tồn lý thuyết, thực tế gần nhất, khả dụng và cảnh báo |
| POST | /inventory/materials | QL | Tạo nguyên liệu, tồn khởi tạo 0 |
| PATCH | /inventory/materials/:id | QL | Sửa danh mục/ngưỡng, không sửa trực tiếp số tồn |
| GET | /inventory/receipts | QL | Lịch sử nhập, page/limit |
| POST | /inventory/receipts | QL | Xác nhận nhập và cập nhật kho; cần Idempotency-Key |
| GET | /inventory/receipts/:id | QL | Chi tiết lần nhập |
| GET | /inventory/losses | QL | Chênh lệch có lý do thuộc báo cáo đã xác nhận, page/limit |
| GET | /inventory/counts/preview?ma_ca=UUID | NV trong ca | Lấy số liệu đối chiếu sau khi ca kết thúc |
| POST | /inventory/counts | NV trong ca | Lưu phiếu kiểm kê cố định; hỗ trợ Idempotency-Key để thử lại an toàn |
| POST | /inventory/close-reports | NV lập phiếu | {ma_phieu:UUID}, tạo báo cáo Nháp |
| GET | /inventory/close-reports | QL/NV | Danh sách theo quyền |
| GET | /inventory/close-reports/:id | QL/NV lập phiếu | Chi tiết |
| POST | /inventory/close-reports/:id/send | NV lập phiếu | Nháp → Chờ xác nhận |
| POST | /inventory/close-reports/:id/confirm | QL | Chốt kho và báo cáo cùng giao dịch |
| POST | /inventory/close-reports/:id/low-stock | NV lập phiếu | Gửi thông báo nguyên liệu cần nhập |

Danh mục nguyên liệu: ten_nguyen_lieu, don_vi_tinh, muc_ton_toi_thieu, nguong_chenh_lech, dang_hoat_dong. Không cho đổi đơn vị tính của nguyên liệu đã tạo để tránh sai phép quy đổi.

Nhập hàng: ten_nha_cung_cap, ngay_nhap YYYY-MM-DD, ma_ca tùy chọn, trang_thai_thanh_toan (Đã thanh toán/Công nợ), hinh_thuc_thanh_toan (Tiền mặt/Chuyển khoản, chỉ có khi đã thanh toán), items [{ma_nguyen_lieu,so_luong_dat,so_luong_nhan,don_gia}]. Lịch sử nhập chỉ đọc.

Phiếu kiểm kê:

```json
{
  "ma_ca":"<UUID>",
  "tien_mat_thuc_thu":50000,
  "chuyen_khoan_thuc_thu":0,
  "items":[{"ma_nguyen_lieu":"<UUID>","ton_ly_thuyet":8,"ton_thuc_te":7.5,"ly_do_chenh_lech":"Hao hụt"}]
}
```

Phải gửi đủ mọi nguyên liệu đang hoạt động. ton_ly_thuyet là số lấy từ preview; nếu số liệu đổi, API trả STALE_COUNT để tải lại và đối chiếu lại. Chênh lệch đúng bằng ngưỡng vẫn coi là khớp. Vượt ngưỡng cần ly_do_chenh_lech (Hao hụt/Đổ vỡ/Hết hạn/Khác); Khác cần ghi_chu. Tiền lệch cần ly_do_chenh_lech_tien. Phải xử lý xong các đơn trong ca trước kiểm kê. Báo cáo kiểm kho trước đó phải được QL xác nhận trước khi lập phiếu tiếp theo trong cửa hàng.

## Doanh thu và cập nhật trực tiếp

| Phương thức | Đường dẫn | Quyền | Nội dung |
|---|---|---|---|
| GET | /reports/revenue | QL | period=day/month/year, date=YYYY-MM-DD, method tùy chọn |
| GET | /reports/revenue/export | QL | Cùng bộ lọc, thêm format=xlsx/pdf |
| GET | /notifications | QL/NV | Chỉ thông báo của người đang đăng nhập, page/limit |
| POST | /notifications/:id/read | QL/NV | Đánh dấu đã đọc thông báo của mình |
| GET | /events | QL/NV | SSE ready, refresh và session-ended |

Doanh thu theo múi giờ Asia/Ho_Chi_Minh. API trả doanh_thu, so_ly, tien_mat, chuyen_khoan, doanh_thu_da_chot, doanh_thu_chua_chot và items theo ngày/phương thức. Dữ liệu đã chốt chỉ gồm ca có báo cáo Đã xác nhận. Xuất file dùng cùng bộ lọc; không có dữ liệu trả NO_REPORT_DATA. Hệ thống không tự tính lợi nhuận/khấu hao khi chưa có đặc tả chi phí và dữ liệu tương ứng.

FrontEnd có thể mở `new EventSource(apiUrl + '/events', {withCredentials:true})`, lắng nghe refresh rồi gọi lại API được phân quyền. Luồng SSE kiểm tra phiên và thông báo mỗi 2 giây; khi kết nối lại cần tải lại dữ liệu hiện tại. Không dùng thông báo làm nguồn dữ liệu giao dịch.

## Mã lỗi thường gặp

401 UNAUTHENTICATED/INVALID_CREDENTIALS; 403 FORBIDDEN/INVALID_ORIGIN; 404 NOT_FOUND; 409 khi thao tác xung đột hoặc dữ liệu trùng; 422 VALIDATION_ERROR và các lỗi số tiền/kiểm kê; 503 PAYMENT_NOT_CONFIGURED hoặc PDF_FONT_NOT_CONFIGURED khi cấu hình phụ thuộc chưa có.
