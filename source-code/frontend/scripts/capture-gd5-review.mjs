import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(frontendDir, '..');
const qaAccessPath = join(sourceDir, 'backend', '.local', 'qa', 'access.json');
const screenshotDir = join(frontendDir, 'screenshots');
const chromePath =
  process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173/';
const port = 9248;
const profileDir = join(tmpdir(), `me-cafe-gd5-review-${process.pid}`);
const access = JSON.parse(await readFile(qaAccessPath, 'utf8'));

const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let socket;
let sessionId;
let nextId = 1;
const pending = new Map();
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function waitForDevTools() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await wait(250);
    }
  }
  throw new Error('Chrome DevTools did not start.');
}

function send(method, params = {}, targetSessionId) {
  const id = nextId++;
  return new Promise((resolveSend, rejectSend) => {
    pending.set(id, { resolve: resolveSend, reject: rejectSend });
    socket.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(targetSessionId ? { sessionId: targetSessionId } : {}),
      }),
    );
  });
}

async function evaluate(expression) {
  const response = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (response.exceptionDetails) {
    throw new Error(JSON.stringify(response.exceptionDetails));
  }
  return response.result.value;
}

async function waitFor(check, description, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(check)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function click(selector) {
  const found = await evaluate(
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
  );
  if (!found) throw new Error(`Could not find ${selector}.`);
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
  );
}

async function screenshot(filename) {
  const { data } = await send(
    'Page.captureScreenshot',
    { format: 'png', fromSurface: true, captureBeyondViewport: false },
    sessionId,
  );
  await writeFile(join(screenshotDir, filename), Buffer.from(data, 'base64'));
  console.log(`Saved ${filename}`);
}

async function waitForReport(value) {
  await waitFor(
    `document.querySelector('.reports-page') && document.body.innerText.includes(${JSON.stringify(value)})`,
    `report data "${value}"`,
  );
}

async function selectScenario(scenario) {
  await evaluate(
    `sessionStorage.setItem('gd5-capture-scenario', ${JSON.stringify(scenario)}); location.reload()`,
  );
  await waitFor(
    `Boolean(document.querySelector('.reports-page'))`,
    'reports page after reload',
  );
}

async function openExport() {
  await click('.reports-page .page-header button');
  await waitFor(
    `Boolean(document.querySelector('.reports-export-modal[open]'))`,
    'export dialog',
  );
}

try {
  await mkdir(screenshotDir, { recursive: true });
  const version = await waitForDevTools();
  socket = new WebSocket(version.webSocketDebuggerUrl);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(JSON.stringify(message.error)));
    else callbacks.resolve(message.result);
  };
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = rejectOpen;
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  }));
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );

  // Revenue and file responses are deterministic capture fixtures; QA auth stays live.
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const rawUrl = typeof input === 'string' ? input : input.url;
          const url = new URL(rawUrl, window.location.href);
          const scenario = sessionStorage.getItem('gd5-capture-scenario') || 'data';
          if (url.pathname === '/api/reports/revenue') {
            const isTotal = !url.searchParams.has('method');
            if (isTotal && scenario === 'loading') {
              await new Promise((resolve) => setTimeout(resolve, 2200));
            }
            if (isTotal && scenario === 'read-error') {
              return new Response(JSON.stringify({ error: {
                code: 'CAPTURE_READ_ERROR',
                message: 'Fixture: lỗi đọc báo cáo doanh thu.'
              }}), { status: 503, headers: { 'Content-Type': 'application/json' } });
            }
            const empty = scenario === 'empty';
            const data = empty
              ? { doanh_thu: '0', so_ly: '0', tien_mat: '0', chuyen_khoan: '0', items: [] }
              : { doanh_thu: '9250000', so_ly: '185', tien_mat: '3550000', chuyen_khoan: '5700000', items: [{ ngay: '2026-11-12' }] };
            return new Response(JSON.stringify({ data }), {
              status: 200, headers: { 'Content-Type': 'application/json' }
            });
          }
          if (url.pathname === '/api/reports/revenue/export') {
            return new Response(new Uint8Array([37, 80, 68, 70]), {
              status: 200, headers: { 'Content-Type': 'application/octet-stream' }
            });
          }
          return nativeFetch(input, init);
        };
      })();`,
    },
    sessionId,
  );

  await send('Page.navigate', { url: frontendUrl }, sessionId);
  await waitFor(
    `Boolean(document.querySelector('.login-form'))`,
    'login page',
  );
  await evaluate(`(() => {
    const set = (id, value) => {
      const input = document.getElementById(id);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('login-username', ${JSON.stringify(access.manager.username)});
    set('login-password', ${JSON.stringify(access.manager.password)});
    document.querySelector('.login-form').requestSubmit();
  })()`);
  await waitFor(
    `Boolean(document.querySelector('.app-sidebar'))`,
    'QA manager login',
  );
  await evaluate(`location.hash = '/reports'`);
  await waitForReport('9.250.000');

  await openExport();
  await screenshot('gd5-export-excel-1440x1024.png');
  await click('.reports-export-modal input[value="pdf"]');
  await screenshot('gd5-export-pdf-1440x1024.png');
  await click('.reports-export-modal button[aria-label="Đóng"]');

  await selectScenario('empty');
  await waitForReport('0 đ');
  await openExport();
  await waitFor(
    `Boolean(document.querySelector('.export-empty-state'))`,
    'empty report state',
  );
  await screenshot('gd5-export-empty-1440x1024.png');
  await click('.reports-export-modal button[aria-label="Đóng"]');

  await selectScenario('loading');
  await openExport();
  await waitFor(
    `Boolean(document.querySelector('.export-report-loading'))`,
    'loading report state',
  );
  await screenshot('gd5-export-report-loading-1440x1024.png');
  await waitForReport('9.250.000');

  await selectScenario('read-error');
  await waitFor(
    `Boolean(document.querySelector('.reports-page .report-alert'))`,
    'report read error',
  );
  await openExport();
  await waitFor(
    `Boolean(document.querySelector('.export-report-state'))`,
    'export dialog report error',
  );
  await screenshot('gd5-export-report-read-error-1440x1024.png');
  await click('.reports-export-modal button[aria-label="Đóng"]');

  await selectScenario('data');
  await waitForReport('9.250.000');
  await openExport();
  await click('.reports-export-modal .export-dialog-actions button');
  await waitFor(
    `!document.querySelector('.reports-export-modal[open]') && document.body.innerText.includes('Xuất file thành công')`,
    'successful export notice',
  );
  await screenshot('gd5-export-success-1440x1024.png');

  console.log(
    'Capture complete. Revenue and exported files are fixtures; manager authentication and app shell use the QA backend.',
  );
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      await send('Browser.close');
    } catch {
      socket.close();
    }
  }
  chrome.kill();
  await wait(500);
  try {
    await rm(profileDir, { recursive: true, force: true });
  } catch {
    console.warn(`Chrome profile cleanup deferred: ${profileDir}`);
  }
}