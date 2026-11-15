import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { migrate } from '../src/shared/migrations.js';
import { requireLocalTarget, resetLocalCredentials } from './lib/local-credentials.js';
import { acquireLocalServerLock } from './lib/local-server-lock.js';

const target = requireLocalTarget(process.argv.slice(2));
const directory = fileURLToPath(new URL(target === 'qa' ? '../.local/qa/' : '../.local/', import.meta.url));
const credentialPath = join(directory, 'access.json');
await mkdir(directory, { recursive: true });

const releaseLock = await acquireLocalServerLock(directory, target);
let db: Awaited<ReturnType<typeof embeddedDatabase>> | undefined;
try {
  db = await embeddedDatabase(join(directory, 'postgres'));
  await migrate(db, fileURLToPath(new URL('../../database/', import.meta.url)));
  await resetLocalCredentials(db, credentialPath);
  console.log(`Đã khôi phục tài khoản thử nghiệm cho database ${target}. Credentials chỉ được lưu trong ${target === 'qa' ? 'backend/.local/qa/access.json' : 'backend/.local/access.json'}; mật khẩu không được in ra log.`);
} finally {
  try {
    if (db) await db.close();
  } finally {
    await releaseLock();
  }
}
