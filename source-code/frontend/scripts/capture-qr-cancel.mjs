import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9223;
const OUTPUT_DIR = 'D:\\frontend\\50K142.02.3007-main (1)\\50K142.02.3007-main\\screenshots';

const access = JSON.parse(
  await readFile('D:\\frontend\\50K142.02.3007-main (1)\\50K142.02.3007-main\\source-code\\backend\\.local\\access.json', 'utf8')
);

const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\Admin\\.gemini\\antigravity\\brain\\1efcd0c0-19fc-468f-a5f3-e04effb61902\\scratch\\chrome-profile-qr',
  'about:blank',
]);

await new Promise((r) => setTimeout(r, 2000));

const versionRes = await fetch(`http://127.0.0.1:${PORT}/json/version`);
const version = await versionRes.json();
const wsUrl = version.webSocketDebuggerUrl;

const ws = new WebSocket(wsUrl);
let idCounter = 1;
const callbacks = new Map();

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && callbacks.has(data.id)) {
    const cb = callbacks.get(data.id);
    callbacks.delete(data.id);
    if (data.error) cb.reject(new Error(JSON.stringify(data.error)));
    else cb.resolve(data.result);
  }
};

await new Promise((resolve) => ws.onopen = resolve);

function send(method, params = {}) {
  const id = idCounter++;
  return new Promise((resolve, reject) => {
    callbacks.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const { targetId } = await send('Target.createTarget', { url: 'http://127.0.0.1:3000/' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

function sendSession(method, params = {}) {
  const id = idCounter++;
  return new Promise((resolve, reject) => {
    callbacks.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, sessionId, method, params }));
  });
}

await sendSession('Page.enable');
await sendSession('Runtime.enable');
await sendSession('DOM.enable');

async function setViewport(width, height) {
  await sendSession('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}

async function evalCode(expression) {
  const res = await sendSession('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
}

async function takeScreenshot(fileName) {
  const { data } = await sendSession('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(OUTPUT_DIR, fileName), Buffer.from(data, 'base64'));
  console.log(`Saved screenshot: ${fileName}`);
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  await setViewport(1440, 1024);
  await sendSession('Page.navigate', { url: 'http://127.0.0.1:3000/#/sales' });
  await wait(1500);

  // Login
  const isLogin = await evalCode(`Boolean(document.querySelector('input[type="password"]'))`);
  if (isLogin) {
    await evalCode(`(() => {
      const inputs = document.querySelectorAll('input');
      const user = "${access.employee.username}";
      const pass = "${access.employee.password}";
      for (const input of inputs) {
        if (input.type === 'text') {
          input.value = user;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (input.type === 'password') {
          input.value = pass;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đăng nhập'));
      if (btn) btn.click();
    })()`);
    await wait(2000);
  }

  // Add item, check, confirm
  await evalCode(`(() => {
    const addBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Thêm') || b.getAttribute('aria-label')?.startsWith('Thêm'));
    if (addBtns.length > 0) addBtns[0].click();
  })()`);
  await wait(800);

  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tiếp tục lập hóa đơn') || b.getAttribute('aria-label') === 'Tiếp tục lập hóa đơn');
    if (btn) btn.click();
  })()`);
  await wait(800);

  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kiểm tra đơn') || b.getAttribute('aria-label') === 'Kiểm tra đơn');
    if (btn) btn.click();
  })()`);
  await wait(1200);

  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Xác nhận đơn') || b.getAttribute('aria-label') === 'Xác nhận đơn');
    if (btn) btn.click();
  })()`);
  await wait(1200);

  // Click Cancel ("Hủy đơn") to test cancellation dialog
  console.log('Clicking Hủy đơn to open cancel confirmation modal...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Hủy đơn') || b.getAttribute('aria-label') === 'Hủy đơn');
    if (btn) btn.click();
  })()`);
  await wait(800);
  await takeScreenshot('13_huy_don_xac_nhan_dialog.png');

  // Confirm cancel
  console.log('Confirming cancellation...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('dialog[open] button')).find(b => b.textContent.includes('Xác nhận hủy'));
    if (btn) btn.click();
  })()`);
  await wait(1500);
  await takeScreenshot('14_ket_qua_huy_don.png');

  console.log('Cancel flow screenshots captured successfully!');
} catch (err) {
  console.error('Error during QR/cancel capture:', err);
} finally {
  ws.close();
  chrome.kill();
  process.exit(0);
}
