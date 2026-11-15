import type { Database } from '../../src/shared/database.js';

export function cleanDisplayLabel(value: string, fallback = 'Thông tin') {
  if (/^DỮ LIỆU DEMO\s*-\s*Tồn kho mẫu menu ảnh$/iu.test(value)) return 'Nhập nguyên liệu ban đầu';
  if (/^Quản lý thử nghiệm$/iu.test(value)) return 'Nguyễn Văn A';
  if (/^Nhân viên thử nghiệm$/iu.test(value)) return 'Nguyễn Văn B';
  if (/^Nguyên liệu thử nghiệm$/iu.test(value)) return 'Nguyên liệu pha chế';
  const cleaned = value
    .replace(/(?<![\p{L}\p{N}_])(?:demo|thử\s+nghiệm|kiểm\s+thử|test(?:ing)?|dữ\s+liệu\s+mẫu|mẫu)(?![\p{L}\p{N}_])/giu, '')
    .replace(/\(\s*\)|\[\s*\]/g, '').replace(/\s{2,}/g, ' ')
    .replace(/^[\s·:;,\-–—]+|[\s·:;,\-–—]+$/g, '').trim();
  return cleaned || fallback;
}

const fields: Record<string, { keys: string[]; columns: string[]; fallback: string }> = {
  nguoi_dung: { keys: ['ma_nguoi_dung'], columns: ['ho_ten'], fallback: 'Nhân viên' },
  mon: { keys: ['ma_mon'], columns: ['ten_mon', 'danh_muc'], fallback: 'Đồ uống' },
  nguyen_lieu: { keys: ['ma_nguyen_lieu'], columns: ['ten_nguyen_lieu'], fallback: 'Nguyên liệu pha chế' },
  chi_tiet_don_hang: { keys: ['ma_don', 'ma_mon'], columns: ['ten_mon_luc_lap'], fallback: 'Đồ uống' },
  don_nhap_hang: { keys: ['ma_po'], columns: ['ten_nha_cung_cap'], fallback: 'Nhập nguyên liệu' },
  yeu_cau_thay_doi_ca: { keys: ['ma_yeu_cau'], columns: ['ly_do'], fallback: 'Điều chỉnh lịch làm việc' },
  phieu_kiem_kho: { keys: ['ma_phieu'], columns: ['ly_do_chenh_lech_tien'], fallback: 'Điều chỉnh kiểm kê' },
  chi_tiet_phieu_kiem_kho: { keys: ['ma_phieu', 'ma_nguyen_lieu'], columns: ['ghi_chu'], fallback: 'Điều chỉnh kiểm kê' },
  thong_bao: { keys: ['ma_thong_bao'], columns: ['noi_dung', 'du_lieu'], fallback: 'Thông báo' },
};
const labelKeys = new Set(['ten_mon', 'ten_mon_luc_lap', 'ten_nguyen_lieu', 'ho_ten', 'ho_ten_nguoi_lap', 'ho_ten_nguoi_xac_nhan', 'nguoi_gui', 'noi_dung', 'ten_nha_cung_cap', 'ghi_chu']);
function cleanPayload(value: any): any {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    typeof item === 'string' && labelKeys.has(key) ? cleanDisplayLabel(item) : cleanPayload(item)]));
  return value;
}
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export type LabelChange = { table: string; keys: Record<string, unknown>; column: string; before: any; after: any; json: boolean };

export async function planDisplayLabelCleanup(db: Database): Promise<LabelChange[]> {
  const changes: LabelChange[] = [];
  const columns = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
  for (const [table, spec] of Object.entries(fields)) {
    const available = new Set(columns.filter(c => c.table_name === table).map(c => c.column_name));
    const selected = spec.columns.filter(column => available.has(column));
    if (!selected.length || spec.keys.some(key => !available.has(key))) continue;
    const rows = (await db.query(`SELECT ${[...spec.keys, ...selected].map(quote).join(',')} FROM ${quote(table)}`)).rows;
    for (const row of rows) for (const column of selected) {
      const before = row[column];
      if (before === null || before === undefined) continue;
      const json = column === 'du_lieu';
      const after = json ? cleanPayload(before) : cleanDisplayLabel(before, spec.fallback);
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ table, keys: Object.fromEntries(spec.keys.map(key => [key, row[key]])), column, before, after, json });
    }
  }
  return changes;
}

export async function applyDisplayLabelCleanup(db: Database, changes: LabelChange[]) {
  return db.transaction(async tx => {
    for (const change of changes) {
      const spec = fields[change.table];
      if (!spec || !spec.columns.includes(change.column) || JSON.stringify(Object.keys(change.keys)) !== JSON.stringify(spec.keys)) throw Error('Invalid cleanup plan');
      const values: unknown[] = spec.keys.map(key => change.keys[key]);
      const where = spec.keys.map((key, index) => `${quote(key)}=$${index + 1}`);
      values.push(change.json ? JSON.stringify(change.before) : change.before);
      where.push(`${quote(change.column)}=$${values.length}${change.json ? '::jsonb' : ''}`);
      values.push(change.json ? JSON.stringify(change.after) : change.after);
      const result = await tx.query(`UPDATE ${quote(change.table)} SET ${quote(change.column)}=$${values.length}${change.json ? '::jsonb' : ''} WHERE ${where.join(' AND ')} RETURNING ${spec.keys.map(quote).join(',')}`, values);
      if (result.rows.length !== 1) throw Error('Data changed during cleanup; transaction rolled back');
    }
    return changes.length;
  });
}
