import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = JSON.parse(fs.readFileSync(path.join(root, 'design-context/assets.json'), 'utf8'));
let next = 0;
let downloaded = 0;
const errors = [];
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < assets.length) {
    const asset = assets[next++];
    const destination = path.join(root, asset.path);
    if (fs.existsSync(destination) && fs.statSync(destination).size > 0) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    try {
      await new Promise((resolve, reject) => {
        // Figma explicitly specifies curl -L for these temporary asset URLs.
        const child = spawn('curl.exe', ['-f', '-sS', '-L', '--retry', '2', '--connect-timeout', '20',
          '--max-time', '120', asset.url, '-o', destination]);
        let error = '';
        child.stderr.on('data', chunk => { error += chunk; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(error || `curl ${code}`)));
      });
      if (!fs.statSync(destination).size) throw new Error('Empty downloaded asset');
      downloaded++;
    } catch (error) { errors.push({ path: asset.path, error: String(error) }); }
  }
}));
console.log(JSON.stringify({ assets: assets.length, downloaded, errors }, null, 2));
if (errors.length) process.exitCode = 1;
