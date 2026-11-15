import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { migrate } from '../src/shared/migrations.js';
import { createApp } from '../src/app.js';
import { paymentConfiguration } from '../src/config/payments.js';
import { importPhotoMenu, readPhotoMenu } from './lib/photo-menu.js';
import { createInitialLocalAccounts, inspectLocalCredentials } from './lib/local-credentials.js';
import { acquireLocalServerLock, assertLocalPortAvailable } from './lib/local-server-lock.js';
import { addLocalLoopbackOrigins } from './lib/local-origins.js';

const args = new Set(process.argv.slice(2));
if (args.has('--local') && args.has('--qa')) throw new Error('Chọn đúng một database local: --local hoặc --qa.');
const portArgument = [...args].find(value => value.startsWith('--port='));
const portValue = portArgument?.slice('--port='.length);
const port = portValue === undefined ? 3000 : Number(portValue);
if (portValue !== undefined && (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port > 65535)) {
  throw new Error('--port phải là số nguyên từ 0 đến 65535.');
}
const supported = new Set(['--local', '--qa', '--demo-menu', '--demo', '--demo-qr', ...(portArgument ? [portArgument] : [])]);
const unexpected = [...args].find(value => !supported.has(value));
if (unexpected) throw new Error(`Tham số không được hỗ trợ: ${unexpected}`);

const target = args.has('--qa') ? 'qa' : 'local';
await assertLocalPortAvailable(port);
const directory = fileURLToPath(new URL(target === 'qa' ? '../.local/qa/' : '../.local/', import.meta.url));
const databaseDirectory = join(directory, 'postgres');
const credentialPath = join(directory, 'access.json');
await mkdir(directory, { recursive: true });

const releaseLock = await acquireLocalServerLock(directory, target);
let db: Awaited<ReturnType<typeof embeddedDatabase>> | undefined;
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
let phase = 'initialize embedded PostgreSQL';
try {
  db = await embeddedDatabase(databaseDirectory);
  phase = 'apply database migrations';
  await migrate(db, fileURLToPath(new URL('../../database/', import.meta.url)));
  phase = 'initialize test accounts';
  const createdAccounts = await createInitialLocalAccounts(db, credentialPath);
  if (!createdAccounts) {
    const credentialsState = await inspectLocalCredentials(db, credentialPath);
    if (credentialsState !== 'valid') {
      console.warn(
        `File credentials ${credentialsState === 'missing' ? 'bị thiếu hoặc không đúng định dạng' : 'không khớp với tài khoản trong database'}; mật khẩu hiện có không bị đổi. Khôi phục bằng: npm run local:credentials -- --${target}`,
      );
    }
  }

  const employee = (await db.query(
    "SELECT ma_nguoi_dung FROM nguoi_dung WHERE ten_dang_nhap='nhanvien' AND vai_tro='Nhân viên' AND trang_thai='Đang hoạt động'",
  )).rows[0];
  if (employee) {
    const shiftDate = (await db.query("SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS ngay")).rows[0].ngay;
    await db.query(
      `INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da)
       VALUES($1,'00:00','23:59:59',1,3) ON CONFLICT(ngay_lam,gio_bat_dau,gio_ket_thuc) DO NOTHING`,
      [shiftDate],
    );
    const shift = (await db.query(
      "SELECT ma_ca FROM ca_lam WHERE ngay_lam=$1 AND gio_bat_dau='00:00' AND gio_ket_thuc='23:59:59'",
      [shiftDate],
    )).rows[0];
    if (shift) {
      await db.query(
        'INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [shift.ma_ca, employee.ma_nguoi_dung],
      );
    }
  }

  if (args.has('--demo-menu') || args.has('--demo')) {
    phase = 'import demo menu';
    const manager = (await db.query(
      "SELECT ma_nguoi_dung FROM nguoi_dung WHERE ten_dang_nhap='quanly' AND vai_tro='Quản lý' AND trang_thai='Đang hoạt động'",
    )).rows[0];
    if (!manager) throw Error('Cần tài khoản quản lý quanly đang hoạt động để nạp bộ menu demo.');
    const result = await importPhotoMenu(db, (await readPhotoMenu()).items, manager.ma_nguoi_dung);
    console.log(`Đã nạp menu demo: ${result.added} món mới / ${result.total} lựa chọn, ${result.materials} nguyên liệu; tạo phiếu tồn demo: ${result.stockAdded}.`);
  }

  phase = 'start local HTTP server';
  const origins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
  const payments = paymentConfiguration(process.env);
  const app = createApp({
    db,
    origins,
    gateway: args.has('--demo-qr') ? payments.vietQrGateway : payments.gateway,
    qrMode: payments.qrMode,
    sepay: args.has('--demo-qr') ? undefined : payments.sepay,
    demoQr: args.has('--demo-qr'),
    logErrors: true,
    staticDir: fileURLToPath(new URL('../../frontend/dist/', import.meta.url)),
  });
  server = app.listen(port, '127.0.0.1');
  let listeningPort = port;
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server?.off('error', onError);
      const address = server?.address();
      if (address && typeof address === 'object') listeningPort = address.port;
      addLocalLoopbackOrigins(origins, listeningPort);
      resolve();
    };
    const onError = (error: Error) => {
      server?.off('listening', onListening);
      reject(error);
    };
    server?.once('listening', onListening);
    server?.once('error', onError);
  });
  console.log(`Local app: http://127.0.0.1:${listeningPort}/`);
  console.log(`Local credentials are saved in ${target === 'qa' ? 'backend/.local/qa/access.json' : 'backend/.local/access.json'} (not a production account).`);
  console.log(
    `Chế độ QR: ${args.has('--demo-qr') ? 'demo (ảnh VietQR dùng tài khoản thật đã cấu hình; đối soát mô phỏng, KHÔNG chuyển tiền)' : payments.qrMode}. POS xác nhận chế độ qua GET /api/payments/mode.`,
  );

  await new Promise<void>((resolve, reject) => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void (async () => {
        try {
          await app.closeEventStreams();
          await new Promise<void>((serverResolve, serverReject) => {
            if (!server) {
              serverResolve();
              return;
            }
            server.close(error => error ? serverReject(error) : serverResolve());
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      })();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    server?.once('close', () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    });
  });
} catch (error) {
  throw new Error(`Local ${target} startup failed during: ${phase}.`, { cause: error });
} finally {
  try {
    if (server?.listening) await new Promise<void>(resolve => server?.close(() => resolve()));
  } finally {
    try {
      if (db) await db.close();
    } finally {
      await releaseLock();
    }
  }
}
