import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9227;
const OUTPUT_DIR = 'D:\\frontend\\50K142.02.3007-main (1)\\50K142.02.3007-main\\screenshots';

const access = JSON.parse(
  await readFile('D:\\frontend\\50K142.02.3007-main (1)\\50K142.02.3007-main\\source-code\\backend\\.local\\access.json', 'utf8')
);

// Spawn Chrome headless with remote debugging
const chrome = spawn(CHROME_PATH, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=C:\\Users\\Admin\\.gemini\\antigravity\\brain\\1efcd0c0-19fc-468f-a5f3-e04effb61902\\scratch\\chrome-profile-cap-v2',
  'about:blank',
]);

await new Promise((r) => setTimeout(r, 2000));

// Get WebSocket debugger URL
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

// Create new target/tab
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

  // Login via API directly
  console.log('Logging in as employee via API...');
  await evalCode(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ten_dang_nhap: '${access.employee.username}',
        mat_khau: '${access.employee.password}'
      })
    }).then(r => r.json())
  `);
  await evalCode(`sessionStorage.clear(); location.hash = '/sales'; location.reload();`);
  await wait(2500);

  // 1. Chọn món (Desktop 1440x1024)
  console.log('Capturing 01_chon_mon_desktop...');
  await setViewport(1440, 1024);
  await wait(1000);
  await takeScreenshot('01_chon_mon_desktop_1440.png');

  // 1b. Mobile (390x844)
  console.log('Capturing 01_chon_mon_mobile...');
  await setViewport(390, 844);
  await wait(800);
  await takeScreenshot('01_chon_mon_mobile_390.png');

  // Back to Desktop
  await setViewport(1440, 1024);
  await wait(500);

  // Add items
  console.log('Adding items to cart...');
  await evalCode(`(() => {
    const addBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Thêm') || b.getAttribute('aria-label')?.startsWith('Thêm'));
    if (addBtns.length > 0) addBtns[0].click();
    if (addBtns.length > 1) addBtns[1].click();
  })()`);
  await wait(1000);
  await takeScreenshot('02_gio_hang_desktop_1440.png');

  // Switch to order processing view ("Tiếp tục lập hóa đơn")
  console.log('Clicking Tiếp tục lập hóa đơn...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tiếp tục lập hóa đơn') || b.getAttribute('aria-label') === 'Tiếp tục lập hóa đơn');
    if (btn) btn.click();
  })()`);
  await wait(1000);
  await takeScreenshot('03_don_hang_truoc_kiem_tra.png');

  // Click "Kiểm tra đơn"
  console.log('Clicking Kiểm tra đơn...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Kiểm tra đơn') || b.getAttribute('aria-label') === 'Kiểm tra đơn');
    if (btn) btn.click();
  })()`);
  await wait(1500);
  await takeScreenshot('04_kiem_tra_don_giu_ton.png');

  // Click "Xác nhận đơn"
  console.log('Clicking Xác nhận đơn...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Xác nhận đơn') || b.getAttribute('aria-label') === 'Xác nhận đơn');
    if (btn) btn.click();
  })()`);
  await wait(1500);
  await takeScreenshot('05_xac_nhan_don_chon_thanh_toan.png');

  // Click "Tiền mặt"
  console.log('Opening cash payment view...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Tiền mặt' || b.textContent.includes('Tiền mặt'));
    if (btn) btn.click();
  })()`);
  await wait(1000);
  await takeScreenshot('06_thanh_toan_tien_mat_dialog.png');

  // Enter insufficient cash to show deficit error
  console.log('Entering insufficient cash (10,000)...');
  await evalCode(`(() => {
    const input = document.querySelector('.sales-cash-container input[type="number"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '10000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const btn = document.querySelector('.sales-cash-container button[type="submit"]');
    if (btn) btn.click();
  })()`);
  await wait(800);
  await takeScreenshot('07_tien_mat_thieu_canh_bao.png');

  // Enter sufficient cash (e.g. 100,000)
  console.log('Entering sufficient cash (100,000)...');
  await evalCode(`(() => {
    const input = document.querySelector('.sales-cash-container input[type="number"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '100000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  await wait(800);
  await takeScreenshot('08_tien_mat_tinh_tien_thua.png');

  // Confirm cash payment
  console.log('Confirming cash payment...');
  await evalCode(`(() => {
    const btn = document.querySelector('.sales-cash-container button[type="submit"]');
    if (btn) btn.click();
  })()`);
  await wait(2000);
  await takeScreenshot('09_da_thanh_toan_xuat_hoa_don.png');

  // Click "Xuất hóa đơn" to preview thermal receipt
  console.log('Opening thermal receipt preview...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Xuất hóa đơn') || b.getAttribute('aria-label') === 'Xuất hóa đơn');
    if (btn) btn.click();
  })()`);
  await wait(1000);
  await takeScreenshot('10_hoa_don_in_nhiet_preview.png');

  // Close thermal preview dialog
  await evalCode(`(() => {
    const closeBtn = document.querySelector('.sales-modal-close') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đóng'));
    if (closeBtn) closeBtn.click();
  })()`);
  await wait(800);

  // Start brewing ("Bắt đầu pha chế")
  console.log('Clicking Bắt đầu pha chế...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bắt đầu pha chế') || b.getAttribute('aria-label') === 'Bắt đầu pha chế');
    if (btn) btn.click();
  })()`);
  await wait(1500);
  await takeScreenshot('11_bat_dau_pha_che.png');

  // Complete brewing ("Hoàn tất pha chế")
  console.log('Clicking Hoàn tất pha chế...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Hoàn tất pha chế') || b.getAttribute('aria-label') === 'Hoàn tất pha chế');
    if (btn) btn.click();
  })()`);
  await wait(1500);
  await takeScreenshot('12_hoan_tat_pha_che_don_moi.png');

  // Click "Lập đơn mới" to reset POS
  console.log('Clicking Lập đơn mới...');
  await evalCode(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lập đơn mới') || b.getAttribute('aria-label') === 'Lập đơn mới');
    if (btn) btn.click();
  })()`);
  await wait(1500);

  // Add item, check, confirm for Cancel flow
  console.log('Testing cancellation flow...');
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

  // Confirm cancel inside modal
  console.log('Confirming cancellation inside modal...');
  await evalCode(`(() => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) {
      const btn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent.trim() === 'Xác nhận' || b.getAttribute('aria-label') === 'Xác nhận');
      if (btn) btn.click();
    }
  })()`);
  await wait(1500);
  await takeScreenshot('14_ket_qua_huy_don.png');

  console.log('ALL SCREENSHOTS CAPTURED PERFECTLY!');
} catch (err) {
  console.error('Error during capture:', err);
} finally {
  ws.close();
  chrome.kill();
  process.exit(0);
}
