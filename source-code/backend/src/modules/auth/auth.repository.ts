import { first, type Database } from '../../shared/database.js';
export const publicColumns = 'ma_nguoi_dung,ten_dang_nhap,ho_ten,so_dien_thoai,vai_tro,trang_thai';
export const authRepository = {
  byUsername: (db: Database, username: string) => first(db, 'SELECT * FROM nguoi_dung WHERE lower(ten_dang_nhap)=lower($1)', [username]),
  session: (db: Database, hash: string) => first(db, `SELECT u.*,s.ma_phien FROM phien_dang_nhap s JOIN nguoi_dung u USING(ma_nguoi_dung)
    WHERE s.token_bam=$1 AND s.thu_hoi_luc IS NULL AND s.het_han_luc>now() AND u.trang_thai='Đang hoạt động'`, [hash]),
  createSession: (db: Database, user: string, hash: string, hours: number) => db.query(`INSERT INTO phien_dang_nhap(ma_nguoi_dung,token_bam,het_han_luc)
    VALUES($1,$2,now()+($3::text||' hours')::interval)`, [user,hash,hours]),
  revoke: (db: Database, session: string) => db.query('UPDATE phien_dang_nhap SET thu_hoi_luc=now() WHERE ma_phien=$1', [session]),
};
