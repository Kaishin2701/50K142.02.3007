# Me Ca Phe

Source code for the Me Ca Phe business management system.

## Repository location

This local Code directory corresponds to source-code/ in the GitHub repository Kaishin2701/50K142.02.3007. Repository content outside source-code/ is maintained separately.

## Project structure

- frontend/: shared application for Manager and Employee interfaces on POS and mobile devices.
- backend/: API and business modules for authentication, users, menu, orders, payments, shifts, inventory, and reports.
- database/: PostgreSQL migrations and policies, plus optional local/QA-only menu demo data.
- docs/: technical documentation for the source code.

## Three-layer architecture

1. Presentation: frontend/.
2. Business logic: services within backend/src/modules/.
3. Data access: repositories within backend/src/modules/.

Each backend module will contain routes, controllers, services, repositories, and input validation as implementation begins. The database directory contains database definitions and does not represent a fourth application layer.

## Status

The frontend uses React, TypeScript, Vite, and plain CSS. A persistent application shell hosts business pages for sales, orders, accounts, schedules, inventory and reports. Forms, dialogs and checkout phases update locally within these pages. The original 209 Figma contexts remain in frontend/design-context/ as design references. Runtime components use responsive layouts, local image assets and local Plus Jakarta Sans fonts.

The backend uses Express, TypeScript, and PostgreSQL, with authentication, role checks, menu/recipes, orders/payments, shifts, inventory, closing reports, exports, and refresh events. Database migrations target Supabase PostgreSQL. The application is deployed on Render with Supabase PostgreSQL. SePay QR and authenticated transaction webhooks require bank/service configuration before real payment verification.

See backend/README.md for backend setup and docs/backend-api.md for the API contract.

## Chạy ứng dụng local

Các lệnh dưới đây chạy từ thư mục gốc `source-code/`. Cần Node.js 24 trở lên.

### Chạy local thông thường

```powershell
npm run setup
npm run build
npm run local
```

Mở `http://127.0.0.1:3000/`. Tài khoản thử nghiệm là `quanly` (quản lý) và `nhanvien` (nhân viên); mật khẩu được lưu trong `backend/.local/access.json`. Database local nằm tại `backend/.local/postgres/` và được giữ lại sau khi tắt ứng dụng. Lần chạy đầu sẽ tạo hai tài khoản và một ca thử nghiệm cho nhân viên. Lệnh `npm run local` thông thường không nạp menu, công thức, tồn kho demo hoặc phiếu nhập.

### Chạy local để thử QR mô phỏng

Đặt cấu hình tài khoản nhận tiền trong PowerShell, sau đó chạy local demo:

```powershell
$env:SEPAY_BANK = '970422'
$env:SEPAY_ACCOUNT_NUMBER = '0333101167'
$env:SEPAY_ACCOUNT_NAME = 'NGUYEN THANH SANG'

npm run local:demo
```

`npm run local:demo` dùng PostgreSQL nhúng, nạp menu và tồn kho thử nghiệm, đồng thời bật QR mô phỏng. Cách viết tương đương là `npm run local -- --demo-menu --demo-qr`. Backend tự tạo ảnh PNG VietQR theo tài khoản đã cấu hình và tổng tiền của đơn. Nút đối soát trong chế độ này chỉ mô phỏng xác nhận thanh toán, không cần webhook SePay.

**Lưu ý:** QR có thể được ứng dụng ngân hàng quét để chuyển tiền thật vào tài khoản trên. Chỉ kiểm tra tên người nhận, tài khoản, số tiền và nội dung; thoát trước khi xác nhận hoặc gửi tiền. Menu, công thức và số tồn là dữ liệu thử nghiệm, không phải dữ liệu kinh doanh thật.

Muốn nạp menu demo nhưng không bật QR mô phỏng, chạy `npm run local -- --demo-menu`. Muốn thử QR live, cần cấu hình `QR_PROVIDER=sepay` cùng các biến tài khoản và webhook SePay, rồi chạy không có cờ `--demo-qr`. QR live chỉ được xác nhận sau khi backend nhận webhook hợp lệ; không dùng cờ demo để kiểm tra thanh toán thật.

### Tài khoản local và QA

Nếu mật khẩu tài khoản đã đổi hoặc file `access.json` bị thiếu/không khớp, hãy dừng server tương ứng rồi chạy đúng một trong các lệnh sau từ thư mục gốc:

```powershell
npm run local:credentials -- --local
npm run local:credentials -- --qa
```

Lệnh chỉ cập nhật database được chọn, thu hồi phiên cũ và ghi mật khẩu mới vào `access.json`; mật khẩu không được in ra màn hình. Database local nằm tại `backend/.local/`, còn QA nằm tại `backend/.local/qa/`. Để chạy QA, vào thư mục `backend/` rồi chạy `npm run dev:local -- --qa`; có thể thêm `--port=3001` nếu cổng 3000 bị một dịch vụ không liên quan sử dụng. Không đổi cổng để né một server đang mở chính database đó.

Khi dừng server, nhấn `Ctrl+C` và chờ tiến trình thoát để tự giải phóng `server.lock`. Nếu server dừng bất thường, chỉ xóa đúng file lock sau khi xác nhận PID ghi trong file không còn chạy.

## Frontend development

From this directory:

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` from frontend/ to check TypeScript and create a production build.

The Vite development server proxies `/api` to port 3000. Run the local server in a second terminal. See docs/deployment.md for Supabase, Render and SePay setup, and docs/frontend-design.md for design references and review limitations. Empty scaffold directories contain .gitkeep so Git can track them.

## Shop menu data

The photographed menu contains 160 item/size choices across 11 categories. Unclear entries are excluded. Loading it is opt-in; demo recipes and stock are simulated test data. See [docs/menu-data.md](docs/menu-data.md) for commands and the distinction between menu prices and fictional inventory/recipes. It never runs automatically during normal startup or deployment.
