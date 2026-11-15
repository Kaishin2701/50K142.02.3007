import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { connectDatabase } from '../src/shared/database.js';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { planDisplayLabelCleanup, applyDisplayLabelCleanup } from './lib/clean-display-labels.js';

const root = fileURLToPath(new URL('../.local/', import.meta.url));
const localIndex = process.argv.indexOf('--local-dir');
if (!process.argv.includes('--production') && localIndex < 0) throw Error('Choose --production or --local-dir explicitly');
if (process.argv.includes('--production') && localIndex >= 0) throw Error('Choose only one database');
const local = localIndex >= 0 ? resolve(process.argv[localIndex + 1] ?? '') : undefined;
if (local && (relative(root, local).startsWith('..') || relative(root, local).includes(':'))) throw Error('Local database must be inside backend/.local');
const env = local ? undefined : loadEnv();
const db = local ? await embeddedDatabase(local) : connectDatabase(env!.DATABASE_URL, env!.PG_SSL === 'true');
try {
  const changes = await planDisplayLabelCleanup(db);
  const counts: Record<string, number> = {};
  for (const change of changes) counts[change.table] = (counts[change.table] ?? 0) + 1;
  if (process.argv.includes('--apply') && changes.length) {
    await mkdir(root, { recursive: true });
    const backup = resolve(root, `label-cleanup-${local ? 'local' : 'production'}-${Date.now()}.json`);
    await writeFile(backup, JSON.stringify(changes, null, 2), { mode: 0o600 });
    await applyDisplayLabelCleanup(db, changes);
    const remaining = await planDisplayLabelCleanup(db);
    if (remaining.length) throw Error('Cleanup verification failed');
    console.log(JSON.stringify({ target: local ? 'local' : 'production', applied: changes.length, byTable: counts, remaining: remaining.length, backup }));
  } else console.log(JSON.stringify({ target: local ? 'local' : 'production', planned: changes.length, byTable: counts, samples: changes.filter(c => !c.json).slice(0, 8).map(c => ({ table: c.table, before: c.before, after: c.after })) }));
} finally { await db.close(); }
