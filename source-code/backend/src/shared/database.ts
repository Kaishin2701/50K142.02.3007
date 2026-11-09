import pg from 'pg';
import { readFileSync } from 'node:fs';
export type Row = Record<string, any>;
export interface Database {
  query<T extends Row = Row>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
  transaction<T>(work: (db: Database) => Promise<T>): Promise<T>;
}
pg.types.setTypeParser(1082, value => value);
export function connectDatabase(url: string, ssl: boolean): Database & { close(): Promise<void> } {
  const hostname = new URL(url).hostname;
  const usesSupabase = hostname.endsWith('.pooler.supabase.com') || hostname.endsWith('.supabase.co');
  const ca = ssl && usesSupabase
    ? readFileSync(new URL('../../assets/certificates/supabase-ca.crt', import.meta.url), 'utf8')
    : undefined;
  const pool = new pg.Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: true, ca } : false,
    max: 10, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  const wrap = (client: pg.Pool | pg.PoolClient): Database => ({
    query: (text, values) => client.query(text, values),
    transaction: async work => {
      if (!(client instanceof pg.Pool)) throw new Error('Nested transactions are not supported');
      const connection = await client.connect();
      try {
        await connection.query('BEGIN');
        const result = await work(wrap(connection));
        await connection.query('COMMIT');
        return result;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
  });
  return { ...wrap(pool), close: () => pool.end() };
}
export async function lock(db: Database, name: 'kho' | 'ca_lam' | 'tai_khoan') {
  await db.query('SELECT ten FROM khoa_nghiep_vu WHERE ten=$1 FOR UPDATE', [name]);
}
export const rows = async (db: Database, sql: string, values: unknown[] = []) => (await db.query(sql, values)).rows;
export const first = async (db: Database, sql: string, values: unknown[] = []) => (await rows(db, sql, values))[0];
