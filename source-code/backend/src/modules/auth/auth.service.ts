import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, check } from '../../shared/errors.js';
import { lock, type Database, type Row } from '../../shared/database.js';
import { authRepository as repo } from './auth.repository.js';
const scrypt = promisify(derive);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verify(password: string, stored: string) {
  const [algorithm,salt,hex] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hex) return false;
  const actual = await scrypt(password,salt,64) as Buffer;
  const expected = Buffer.from(hex,'hex');
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
export type Actor = { id: string; role: 'Quản lý' | 'Nhân viên'; sessionId: string };
export const publicUser = (user: Row) => ({ ma_nguoi_dung:user.ma_nguoi_dung, ten_dang_nhap:user.ten_dang_nhap,
  ho_ten:user.ho_ten,so_dien_thoai:user.so_dien_thoai,vai_tro:user.vai_tro,trang_thai:user.trang_thai });
// Same-cost verification for usernames that do not exist.
const dummy = hashPassword(randomBytes(32).toString('hex'));
export function authService(db: Database, hours: number) {
  return {
    login: async (username: string, password: string) => {
      const user = await repo.byUsername(db,username);
      const valid = await verify(password,user?.mat_khau_bam ?? await dummy);
      check(user && valid && user.trang_thai==='Đang hoạt động', 'Tài khoản hoặc mật khẩu không chính xác', 'INVALID_CREDENTIALS',401);
      const token = randomBytes(32).toString('base64url');
      await db.transaction(async tx => {
        await lock(tx,'tai_khoan');
        const current = await repo.byUsername(tx,username);
        check(current && current.trang_thai==='Đang hoạt động' && current.mat_khau_bam===user.mat_khau_bam,
          'Tài khoản hoặc mật khẩu không chính xác','INVALID_CREDENTIALS',401);
        await repo.createSession(tx,user.ma_nguoi_dung,tokenHash(token),hours);
      });
      return { token, user:publicUser(user) };
    },
    authenticate: async (token?: string): Promise<{actor:Actor;user:Row}> => {
      if (typeof token!=='string' || !token || token.length>256) throw new AppError(401,'UNAUTHENTICATED','Vui lòng đăng nhập.');
      const user = await repo.session(db,tokenHash(token));
      check(user,'Phiên đăng nhập đã hết hạn hoặc tài khoản bị khóa.','UNAUTHENTICATED',401);
      return { actor:{id:user.ma_nguoi_dung,role:user.vai_tro,sessionId:user.ma_phien}, user:publicUser(user) };
    },
    logout: (actor: Actor) => repo.revoke(db,actor.sessionId),
  };
}
