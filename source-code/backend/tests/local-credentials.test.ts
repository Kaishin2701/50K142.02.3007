import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { migrate } from '../src/shared/migrations.js';
import { httpGateway } from '../src/modules/payments/payments.service.js';
import {
  createInitialLocalAccounts,
  inspectLocalCredentials,
  requireLocalTarget,
  resetLocalCredentials,
} from '../scripts/lib/local-credentials.js';
import { acquireLocalServerLock, assertLocalPortAvailable } from '../scripts/lib/local-server-lock.js';
import { addLocalLoopbackOrigins } from '../scripts/lib/local-origins.js';

async function createDatabase(directory: string) {
  const db = await embeddedDatabase(join(directory, 'postgres'));
  await migrate(db, fileURLToPath(new URL('../../database/', import.meta.url)));
  return db;
}

test('local credentials match persisted users, remain stable on startup, and can be reset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'me-cafe-local-credentials-'));
  const credentialPath = join(directory, 'access.json');
  const db = await createDatabase(directory);
  try {
    assert.equal(await inspectLocalCredentials(db, credentialPath), 'missing');
    assert.equal(await createInitialLocalAccounts(db, credentialPath), true);
    const originalFile = await readFile(credentialPath, 'utf8');
    const original = JSON.parse(originalFile);
    assert.equal(await inspectLocalCredentials(db, credentialPath), 'valid');
    assert.equal(await createInitialLocalAccounts(db, credentialPath), false);
    assert.equal(await readFile(credentialPath, 'utf8'), originalFile);

    const origins = ['http://localhost:5173'];
    const app = createApp({ db, origins, gateway: httpGateway() });
    addLocalLoopbackOrigins(origins, 3000);
    const managerLogin = await request(app).post('/api/auth/login')
      .set('Origin', 'http://127.0.0.1:3000')
      .send({ ten_dang_nhap: original.manager.username, mat_khau: original.manager.password });
    assert.equal(managerLogin.status, 200);
    const otherPortBeforeListening = await request(app).post('/api/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ ten_dang_nhap: original.employee.username, mat_khau: original.employee.password });
    assert.equal(otherPortBeforeListening.status, 403);
    addLocalLoopbackOrigins(origins, 3001);
    const employeeLogin = await request(app).post('/api/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ ten_dang_nhap: original.employee.username, mat_khau: original.employee.password });
    assert.equal(employeeLogin.status, 200);
    const wrongOrigin = await request(app).post('/api/auth/login')
      .set('Origin', 'http://localhost:3002')
      .send({ ten_dang_nhap: original.manager.username, mat_khau: original.manager.password });
    assert.equal(wrongOrigin.status, 403);

    await db.query("UPDATE nguoi_dung SET mat_khau_bam=$1 WHERE ten_dang_nhap='quanly'", [await hashPassword('changed-outside-startup')]);
    assert.equal(await inspectLocalCredentials(db, credentialPath), 'stale');
    assert.equal(await createInitialLocalAccounts(db, credentialPath), false);
    assert.equal(await readFile(credentialPath, 'utf8'), originalFile);

    await resetLocalCredentials(db, credentialPath);
    const recoveredFile = JSON.parse(await readFile(credentialPath, 'utf8'));
    assert.equal(await inspectLocalCredentials(db, credentialPath), 'valid');
    for (const [index, account] of [recoveredFile.manager, recoveredFile.employee].entries()) {
      const login = await request(app).post('/api/auth/login')
        .set('Origin', index === 0 ? 'http://127.0.0.1:3000' : 'http://localhost:3001')
        .send({ ten_dang_nhap: account.username, mat_khau: account.password });
      assert.equal(login.status, 200);
    }
    assert.notEqual(recoveredFile.manager.password, original.manager.password);
    assert.notEqual(recoveredFile.employee.password, original.employee.password);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('credential recovery requires exactly one local target before database setup', () => {
  assert.throws(() => requireLocalTarget([]), /Chọn đúng một database cô lập/);
  assert.throws(() => requireLocalTarget(['--local', '--qa']), /Chọn đúng một database cô lập/);
  assert.equal(requireLocalTarget(['--local']), 'local');
  assert.equal(requireLocalTarget(['--qa']), 'qa');
  assert.throws(() => requireLocalTarget(['--qa', '--demo']), /Tham số không được hỗ trợ/);
});

test('local server lock prevents opening the same embedded database twice', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'me-cafe-local-lock-'));
  try {
    const release = await acquireLocalServerLock(directory, 'qa');
    await assert.rejects(acquireLocalServerLock(directory, 'qa'), /đã có tiến trình local khác/);
    await release();
    const releaseAgain = await acquireLocalServerLock(directory, 'qa');
    await releaseAgain();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('local startup detects an occupied HTTP port before opening its database', async () => {
  const listener = createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  assert.ok(address && typeof address === 'object');
  try {
    await assert.rejects(assertLocalPortAvailable(address.port), /Cổng local/);
  } finally {
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }
  await assertLocalPortAvailable(0);
});

test('embedded PostgreSQL startup errors include PostgreSQL stderr and preserve the original cause', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'me-cafe-pglite-invalid-'));
  const databaseDirectory = join(directory, 'postgres');
  await mkdir(databaseDirectory);
  await writeFile(join(databaseDirectory, 'PG_VERSION'), '99');
  try {
    await assert.rejects(
      embeddedDatabase(databaseDirectory),
      error => {
        if (!(error instanceof Error)) return false;
        assert.match(error.message, /Failed to initialize embedded PostgreSQL/);
        assert.match(error.message, /PGlite failed to initialize properly/);
        assert.match(error.message, /postgresql\.conf/);
        assert.ok(error.cause instanceof Error);
        assert.equal(error.cause.message, 'PGlite failed to initialize properly');
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
