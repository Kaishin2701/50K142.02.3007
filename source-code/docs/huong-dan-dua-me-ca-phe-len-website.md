# Hướng dẫn đưa Mê Cà Phê lên website

Hướng dẫn này bám theo cấu hình hiện tại: React/Vite và Express được build chung; Render chạy backend và phục vụ frontend trên cùng domain; Supabase cung cấp PostgreSQL; SePay gửi webhook xác nhận tiền vào. Cách triển khai cùng domain giúp cookie đăng nhập hoạt động ổn định.

## 1. Chuẩn bị

Cần có quyền quản trị repository, Render, Supabase và SePay. Dự án yêu cầu Node.js 24 trở lên khi build local. Chuẩn bị tài khoản ngân hàng nhận tiền đã được chủ tài khoản xác minh và liên kết với SePay.

Dữ liệu `backend/.local/` là database thử nghiệm bằng PostgreSQL nhúng; nó không được đưa lên website và không phải database production. Website phải kết nối PostgreSQL bền vững. Lệnh build không chuyển dữ liệu local sang Supabase.

Xác nhận đúng ngân hàng, BIN, số tài khoản, và tên chủ tài khoản trước khi cấu hình QR. BIN mẫu hiện tại là `970422` cho MB Bank. Không dùng mã chi nhánh thay BIN. Tên tài khoản phải trùng với cách ngân hàng ghi nhận.

## 2. Tạo PostgreSQL trên Supabase

1. Tạo project Supabase riêng cho website, chọn khu vực phù hợp và lưu mật khẩu database trong trình quản lý mật khẩu.
2. Trong **Connect**, lấy chuỗi PostgreSQL **Session pooler**, phù hợp với máy chủ Render và kết nối IPv4.
3. Mã hóa URL các ký tự đặc biệt trong mật khẩu trước khi đặt vào connection string.
4. Không đặt URL database hoặc khóa Supabase trong frontend, biến `VITE_*`, GitHub hay log.
5. Thiết lập sao lưu database và kiểm tra cách khôi phục trước khi nhập dữ liệu thật.

Các migration và chính sách database đang có được áp dụng khi Render khởi động. Không sửa migration đã áp dụng ở production. Sao lưu trước mọi thay đổi schema về sau.

## 3. Tạo dịch vụ website trên Render

Dự án có Blueprint tại `source-code/render.yaml`. Trong Render, kết nối repository và chọn Blueprint path `source-code/render.yaml`. Kiểm tra **Root Directory** là `source-code`. Blueprint sẽ cài thư viện backend/frontend, build cả hai, áp dụng migration rồi chạy Express. Express phục vụ luôn frontend build trên cùng host.

Sau khi tạo dịch vụ, lấy hostname HTTPS thực tế, ví dụ `https://me-ca-phe.onrender.com`. Thay địa chỉ ví dụ bằng địa chỉ Render cấp; không thêm dấu `/` cuối.

Trong phần **Environment** của web service, đặt:

| Biến | Giá trị |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PG_SSL` | `true` |
| `TRUST_PROXY` | `1` |
| `DATABASE_URL` | Session pooler URL từ Supabase; bí mật backend |
| `FRONTEND_ORIGINS` | `https://<hostname-thuc-te>`; chính xác origin, không có `/` cuối |
| `QR_PROVIDER` | `disabled` cho lần triển khai đầu |

Render tự cung cấp `PORT`; không cố định cổng `3000`. Frontend cùng domain gọi API qua `/api`, nên để `VITE_API_BASE_URL` trống. Không đặt URL localhost trong production.

## 4. Tạo tài khoản quản lý đầu tiên

Tài khoản local `quanly`/`nhanvien` không được đưa lên website. Seed một tài khoản quản lý riêng trên database production:

1. Trong Render Environment, đặt tạm `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_PHONE`. Dùng mật khẩu mạnh, duy nhất.
2. Mở Render Shell, từ thư mục gốc `source-code`, chạy:

   ```sh
   npm run seed --prefix backend
   ```

3. Đăng nhập, xác minh tài khoản. Gỡ `ADMIN_PASSWORD` khỏi Environment sau khi seed.
4. Tạo nhân viên, menu, công thức, nguyên liệu, tồn, ca và phân công trên website. Kiểm tra dữ liệu thật trước khi mở bán.

Không chạy `npm run local`, `npm run local:demo`, `--demo-menu` hoặc `--demo-qr` trên Render.

## 5. Cấu hình VietQR và SePay

### 5.1. QR phải ở trạng thái tắt ban đầu

Giữ `QR_PROVIDER=disabled` trong khi kiểm tra website. Khi tắt, tạo QR phải trả lỗi cấu hình thay vì hiện mã có thể bị hiểu nhầm là thanh toán được.

### 5.2. Đặt tài khoản nhận tiền ở backend

Sau khi xác nhận thông tin ngân hàng, thêm các biến sau trong **Render → Environment**. Thông tin tài khoản bên dưới là thông tin hiện được cấu hình cho dự án; chủ tài khoản cần xác nhận lại trước khi bật thanh toán thật.

```dotenv
QR_PROVIDER=sepay
SEPAY_BANK=970422
SEPAY_ACCOUNT_NUMBER=0333101167
SEPAY_ACCOUNT_NAME=NGUYEN THANH SANG
SEPAY_WEBHOOK_API_KEY=<chuoi-bi-mat-manh-do-ban-tu-tao>
```

`SEPAY_WEBHOOK_API_KEY` là khóa bí mật do bên vận hành đặt và được nhập giống nhau trong Render và cấu hình SePay. Không dùng số tài khoản, mật khẩu Supabase hay `QR_WEBHOOK_SECRET` thay cho khóa này. Không đưa khóa vào frontend, Git hoặc ảnh chụp công khai.

Lưu Environment rồi để dịch vụ khởi động lại để backend nạp cấu hình. Backend hiện tự tạo payload VietQR EMV và ảnh PNG ở phía máy chủ; số tiền lấy từ tổng đơn do backend tính, mã tham chiếu được gắn vào nội dung giao dịch. POS không gọi `img.vietqr.io` trong cấu hình hiện tại.

### 5.3. Cấu hình webhook SePay

Trong trang quản lý webhook SePay, khai báo URL HTTPS thực tế:

```text
https://<hostname-thuc-te>/api/payments/sepay/webhook
```

Dùng POST, JSON và API-key authentication theo giao diện SePay. SePay cần gửi header:

```text
Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>
```

Giá trị sau `Apikey ` phải trùng hoàn toàn với Environment của Render. Không dùng `localhost`, URL LAN, hostname preview tạm, đường dẫn `/api` lặp lại, hoặc hostname thiếu HTTPS. Xác minh SePay báo webhook đang hoạt động.

### 5.4. POS xác nhận giao dịch như thế nào

1. POS yêu cầu QR. Backend tạo giao dịch và mã tham chiếu riêng, tính đúng tổng đơn.
2. Khách quét và chuyển khoản bằng ứng dụng ngân hàng.
3. SePay gọi webhook. Backend kiểm tra API key, tài khoản đích, tiền vào, nội dung tham chiếu và mã giao dịch lặp.
4. Nhân viên bấm **Đối soát**. Backend chỉ hoàn tất khi webhook hợp lệ xác nhận đúng tham chiếu và đủ tiền.
5. Sau khi backend báo thành công, trạng thái đơn, tồn kho và doanh thu được cập nhật. Gọi lại không tiêu hao tồn thêm lần nữa.

Ảnh QR hiển thị hoặc quét thành công chưa chứng minh tiền đã về. Ảnh chụp biên lai/lời báo của khách cũng không thay webhook. Tiền thiếu không được tự coi là đã thanh toán. Hai khoản chuyển riêng cho cùng một đơn hiện không được tự cộng gộp; quản lý cần kiểm tra tài khoản và xử lý với nhà cung cấp trước khi hoàn tất.

## 6. Nếu buộc phải tách domain frontend/backend

Nên dùng một domain như cấu hình Render phía trên. Nếu frontend và API buộc ở hai domain riêng, cấu hình đồng thời:

- Build frontend với `VITE_API_BASE_URL=https://<domain-backend>/api`. Đây là URL công khai, không được chứa bí mật.
- Trên backend đặt `FRONTEND_ORIGINS=https://<domain-frontend>` đúng scheme/domain/port, không có dấu `/` cuối.
- Cả hai host phải dùng HTTPS. Login dựa trên cookie `Secure`, `HttpOnly`, `SameSite=Lax`; CORS đúng chưa đảm bảo cookie hoạt động khi frontend/backend bị trình duyệt xem là khác site. Ưu tiên host dưới cùng site và thử trực tiếp trên browser trước khi dùng thật.
- Webhook SePay vẫn gọi domain backend: `https://<domain-backend>/api/payments/sepay/webhook`.

Không thay `VITE_API_BASE_URL` trong mã nguồn cho mỗi môi trường nếu có thể cấu hình lúc build.

## 7. Kiểm tra sau deploy

Làm lần lượt trước khi cho nhân viên dùng:

1. Mở `https://<hostname-thuc-te>/api/health`; cần nhận JSON có `status: ok`.
2. Đăng nhập quản lý, đăng xuất, rồi đăng nhập nhân viên. Kiểm tra cookie HTTPS và quyền từng vai trò.
3. Tạo đơn thử, thu tiền mặt, xuất hóa đơn. Kiểm tra backend đọc/ghi database Supabase.
4. Khi QR còn tắt, thử tạo QR. Cần nhận lỗi cấu hình; POS không được báo thanh toán thành công.
5. Dùng sandbox/test SePay và tài khoản thử nếu nhà cung cấp hỗ trợ cấu hình đó. Kiểm tra callback, khóa sai, sai tài khoản/tiền ra, khoản thiếu, retry và giao dịch lặp.
6. Trong lượt quét thử, kiểm tra người nhận, số tiền và nội dung trước khi chuyển. Nếu phải gửi tiền thật, xin phép chủ tài khoản, dùng số tiền họ chấp thuận và xác nhận rõ đây là giao dịch thật.
7. Với callback hợp lệ và đủ tiền, xác nhận bấm **Đối soát** hoàn tất đơn; thử gọi lại để chắc tồn chỉ giảm một lần.
8. Sau thử nghiệm, xác minh mode là `live` chứ không phải `demo`; kiểm tra log Render và trạng thái webhook. Ghi lại cách tắt QR bằng `QR_PROVIDER=disabled`.

Nếu SePay không cung cấp sandbox cho cấu hình này thì unit test/ảnh QR không chứng minh giao dịch live hoạt động. Chỉ có thể nghiệm thu live sau callback của nhà cung cấp và giao dịch thử được chủ tài khoản cho phép.

## 8. Bí mật, backup và vận hành

- Bật xác thực nhiều yếu tố và giới hạn người có quyền Render, Supabase, GitHub, SePay.
- Không commit `.env`, `access.json`, URL database, mật khẩu seed hay API key. Nếu lỡ lộ, thu hồi/đổi tại nhà cung cấp; xóa khỏi Git không làm khóa cũ an toàn trở lại.
- Sao lưu Supabase theo mức phù hợp với dữ liệu cửa hàng; thử khôi phục. GitHub và database local không phải bản backup giao dịch production.
- Theo dõi health check, startup logs, webhook lỗi, giao dịch chưa khớp và thông báo quản lý. Chuẩn bị đầu mối khi SePay/hosting gián đoạn.
- Chọn gói hosting không ngủ nếu cửa hàng cần webhook nhận liên tục. Render Free có thể tắt khi rỗi và cold-start; kiểm tra giới hạn dịch vụ hiện hành trước khi dùng thật.
- Khi webhook chậm, nhân viên/QL kiểm tra lịch sử ngân hàng và log/provider. Không đánh dấu đã thanh toán thủ công chỉ vì khách đưa bằng chứng trên điện thoại.

## 9. Gỡ lỗi nhanh

| Vấn đề | Kiểm tra |
|---|---|
| Website không khởi động | Render logs, `DATABASE_URL`, TLS, migration, `HOST=0.0.0.0`, Node version và build. |
| CORS hoặc session hỏng | `FRONTEND_ORIGINS` đúng origin; nếu tách host, xem `VITE_API_BASE_URL`, HTTPS và cookie trên browser. |
| QR báo chưa cấu hình | `QR_PROVIDER=sepay`, đủ ba biến tài khoản, đã lưu Environment và restart service. |
| QR hiện nhưng reconcile từ chối | Đã thực chuyển chưa; webhook URL/header đúng chưa; reference, tài khoản và amount trong callback có khớp không. Tạo QR không chứng minh nhận tiền. |
| Webhook trả 401 | Header phải đúng `Authorization: Apikey <key>`; key khớp Render. |
| Callback không đến | URL HTTPS công khai đúng host và path `/api/payments/sepay/webhook`; xem trạng thái webhook bên SePay. |
| Sai người nhận hoặc số tiền | Tắt QR bằng `QR_PROVIDER=disabled`, kiểm tra bank/account/name, deploy lại rồi kiểm tra QR trước khi bật lại. |
| Website phản hồi chậm sau lúc rỗi | Gói hosting có thể ngủ/cold-start; dùng dịch vụ chạy liên tục cho thanh toán live. |

## 10. Tuyệt đối không làm trên production

Không bật `--demo-qr` hay `npm run local:demo`; không trỏ website tới `backend/.local/postgres`; không dùng `localhost` trong URL database, origin, webhook hoặc API frontend production; không đặt bí mật vào `VITE_*`; không coi QR tạo được là đã thu tiền; không bấm xác nhận chuyển tiền nếu đang chỉ kiểm tra QR.

## Tài liệu đi kèm

- [Blueprint Render](../render.yaml)
- [Mẫu environment backend](../backend/.env.example)
- [Hợp đồng API](./backend-api.md)
- [Deployment và SePay](./deployment.md)
- [Chạy local](../README.md)
- [SePay webhook](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
- [SePay QR](https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan)
- [Render Blueprint](https://render.com/docs/blueprint-spec)
- [Supabase PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres)