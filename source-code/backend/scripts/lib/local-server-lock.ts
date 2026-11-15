import { randomUUID } from 'node:crypto';
import { open, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { LocalTarget } from './local-credentials.js';

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

export async function assertLocalPortAvailable(port: number): Promise<void> {
  if (port === 0) return;
  const probe = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        probe.off('error', onError);
        probe.close(error => error ? reject(error) : resolve());
      };
      const onError = (error: Error) => {
        probe.off('listening', onListening);
        reject(error);
      };
      probe.once('listening', onListening);
      probe.once('error', onError);
      probe.listen(port, '127.0.0.1');
    });
  } catch (error) {
    throw new Error(
      `Cổng local ${port} đã được sử dụng hoặc không thể bind; dừng server đang chạy. Chỉ chọn --port=<cổng khác> nếu không có tiến trình nào đang mở database local/QA đã chọn.`,
      { cause: error },
    );
  } finally {
    if (probe.listening) await new Promise<void>(resolve => probe.close(() => resolve()));
  }
}

export async function acquireLocalServerLock(directory: string, target: LocalTarget): Promise<() => Promise<void>> {
  const path = join(directory, 'server.lock');
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch (error) {
    if (!isNodeError(error, 'EEXIST')) throw error;
    let owner = '';
    try {
      const content = JSON.parse(await readFile(path, 'utf8')) as { pid?: unknown };
      if (Number.isInteger(content.pid)) owner = ` Recorded process ID: ${content.pid}.`;
    } catch (readError) {
      if (!isNodeError(readError, 'ENOENT')) owner = ' The lock file could not be read.';
    }
    throw new Error(
      `Không mở được database ${target}: đã có tiến trình local khác hoặc lock còn lại từ lần dừng bất thường tại ${path}.${owner} Dừng tiến trình đó trước; chỉ xóa server.lock sau khi xác nhận không còn server dùng database này.`,
      { cause: error },
    );
  }

  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, token, target })}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(path, { force: true });
    throw error;
  }

  return async () => {
    await handle.close();
    try {
      const content = JSON.parse(await readFile(path, 'utf8')) as { token?: unknown };
      if (content.token === token) await rm(path);
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
  };
}
