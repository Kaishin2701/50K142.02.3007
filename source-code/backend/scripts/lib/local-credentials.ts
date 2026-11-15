import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Database } from '../../src/shared/database.js';
import { hashPassword, verifyPassword } from '../../src/modules/auth/auth.service.js';
import { usersRepository } from '../../src/modules/users/users.repository.js';

export type LocalTarget = 'local' | 'qa';
type Credential = { username: string; password: string };
type CredentialFile = { localOnly: true; manager: Credential; employee: Credential };
type Account = { username: string; fullName: string; phone: string; role: 'Quản lý' | 'Nhân viên' };

const accounts: Account[] = [
  { username: 'quanly', fullName: 'Quản lý thử nghiệm', phone: '0900000001', role: 'Quản lý' },
  { username: 'nhanvien', fullName: 'Nhân viên thử nghiệm', phone: '0900000002', role: 'Nhân viên' },
];

export function requireLocalTarget(args: Iterable<string>): LocalTarget {
  const values = [...args];
  const local = values.includes('--local');
  const qa = values.includes('--qa');
  if (local === qa) {
    throw new Error('Chọn đúng một database cô lập: --local hoặc --qa.');
  }
  const unexpected = values.find(value => value !== '--local' && value !== '--qa');
  if (unexpected) throw new Error(`Tham số không được hỗ trợ: ${unexpected}`);
  return qa ? 'qa' : 'local';
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function parseCredentialFile(contents: string): CredentialFile | undefined {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  if (!value || typeof value !== 'object') return undefined;
  const file = value as Partial<CredentialFile>;
  if (
    file.localOnly !== true ||
    !file.manager || typeof file.manager.username !== 'string' || typeof file.manager.password !== 'string' ||
    !file.employee || typeof file.employee.username !== 'string' || typeof file.employee.password !== 'string'
  ) return undefined;
  return file as CredentialFile;
}

async function readCredentialFile(path: string): Promise<CredentialFile | undefined> {
  try {
    return parseCredentialFile(await readFile(path, 'utf8'));
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return undefined;
    throw error;
  }
}

async function writeCredentialFile(path: string, credentials: CredentialFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const file = await open(temporaryPath, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    renamed = true;
  } finally {
    if (!renamed) await rm(temporaryPath, { force: true });
  }
}

function generateCredentials(): CredentialFile {
  return {
    localOnly: true,
    manager: { username: accounts[0].username, password: randomBytes(18).toString('base64url') },
    employee: { username: accounts[1].username, password: randomBytes(18).toString('base64url') },
  };
}

export async function createInitialLocalAccounts(db: Database, credentialPath: string): Promise<boolean> {
  if ((await usersRepository.managers(db)).length) return false;

  const existing = (await db.query(
    "SELECT ten_dang_nhap FROM nguoi_dung WHERE ten_dang_nhap IN ($1, $2)",
    accounts.map(account => account.username),
  )).rows;
  if (existing.length) {
    throw new Error('Không có quản lý đang hoạt động nhưng tên tài khoản thử nghiệm đã tồn tại; dùng lệnh khôi phục credentials để xử lý rõ ràng.');
  }

  const credentials = generateCredentials();
  const hashes = await Promise.all([
    hashPassword(credentials.manager.password),
    hashPassword(credentials.employee.password),
  ]);
  await db.transaction(async tx => {
    await usersRepository.create(tx, {
      ten_dang_nhap: accounts[0].username, ho_ten: accounts[0].fullName, so_dien_thoai: accounts[0].phone,
      vai_tro: accounts[0].role, mat_khau_bam: hashes[0],
    });
    await usersRepository.create(tx, {
      ten_dang_nhap: accounts[1].username, ho_ten: accounts[1].fullName, so_dien_thoai: accounts[1].phone,
      vai_tro: accounts[1].role, mat_khau_bam: hashes[1],
    });
  });
  try {
    await writeCredentialFile(credentialPath, credentials);
  } catch (error) {
    throw new Error('Đã tạo tài khoản thử nghiệm nhưng không lưu được access.json; chạy lại lệnh khôi phục credentials cho đúng database.', { cause: error });
  }
  return true;
}

export async function inspectLocalCredentials(db: Database, credentialPath: string): Promise<'valid' | 'missing' | 'stale'> {
  const credentials = await readCredentialFile(credentialPath);
  if (!credentials) return 'missing';

  const users = (await db.query(
    `SELECT ten_dang_nhap, vai_tro, trang_thai, mat_khau_bam
       FROM nguoi_dung WHERE ten_dang_nhap IN ($1, $2)`,
    [credentials.manager.username, credentials.employee.username],
  )).rows;
  const manager = users.find(user => user.ten_dang_nhap === credentials.manager.username);
  const employee = users.find(user => user.ten_dang_nhap === credentials.employee.username);
  if (
    !manager || manager.vai_tro !== 'Quản lý' || manager.trang_thai !== 'Đang hoạt động' ||
    !employee || employee.vai_tro !== 'Nhân viên' || employee.trang_thai !== 'Đang hoạt động'
  ) return 'stale';

  const [managerMatches, employeeMatches] = await Promise.all([
    verifyPassword(credentials.manager.password, manager.mat_khau_bam),
    verifyPassword(credentials.employee.password, employee.mat_khau_bam),
  ]);
  return managerMatches && employeeMatches ? 'valid' : 'stale';
}

export async function resetLocalCredentials(db: Database, credentialPath: string): Promise<void> {
  const credentials = generateCredentials();
  const hashes = await Promise.all([
    hashPassword(credentials.manager.password),
    hashPassword(credentials.employee.password),
  ]);

  await db.transaction(async tx => {
    const existing = (await tx.query(
      `SELECT ma_nguoi_dung, ten_dang_nhap, vai_tro
         FROM nguoi_dung WHERE ten_dang_nhap IN ($1, $2) FOR UPDATE`,
      accounts.map(account => account.username),
    )).rows;
    for (const [index, account] of accounts.entries()) {
      const current = existing.find(user => user.ten_dang_nhap === account.username);
      if (current && current.vai_tro !== account.role) {
        throw new Error(`Tài khoản thử nghiệm ${account.username} đang có vai trò khác; không tự ghi đè tài khoản này.`);
      }
      if (current) {
        await tx.query(
          "UPDATE nguoi_dung SET mat_khau_bam=$2, trang_thai='Đang hoạt động' WHERE ma_nguoi_dung=$1",
          [current.ma_nguoi_dung, hashes[index]],
        );
        await tx.query(
          'UPDATE phien_dang_nhap SET thu_hoi_luc=now() WHERE ma_nguoi_dung=$1 AND thu_hoi_luc IS NULL',
          [current.ma_nguoi_dung],
        );
      } else {
        await usersRepository.create(tx, {
          ten_dang_nhap: account.username, ho_ten: account.fullName, so_dien_thoai: account.phone,
          vai_tro: account.role, mat_khau_bam: hashes[index],
        });
      }
    }
  });

  try {
    await writeCredentialFile(credentialPath, credentials);
  } catch (error) {
    throw new Error('Đã cập nhật tài khoản thử nghiệm nhưng không lưu được access.json; chạy lại lệnh khôi phục cho đúng database.', { cause: error });
  }
}
