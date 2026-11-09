import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screens = JSON.parse(fs.readFileSync(path.join(root, '../docs/figma/screens.json'), 'utf8'));
const rules = new Map();
const assets = [];
const unsupported = new Set();

function declaration(token) {
  const fixed = {
    absolute: 'position:absolute', relative: 'position:relative', block: 'display:block',
    flex: 'display:flex', 'flex-col': 'flex-direction:column', 'justify-center': 'justify-content:center',
    'content-stretch': 'align-content:stretch', 'items-start': 'align-items:flex-start',
    'h-full': 'height:100%', 'shrink-0': 'flex-shrink:0', 'min-w-px': 'min-width:1px',
    'right-3/4': 'right:75%', 'h-0': 'height:0', 'top-1/2': 'top:50%',
    'size-full': 'width:100%;height:100%', 'inset-0': 'inset:0', 'left-0': 'left:0', 'top-0': 'top:0',
    'h-px': 'height:1px', 'w-px': 'width:1px', 'bg-white': 'background-color:#fff',
    'bg-black': 'background-color:#000', 'text-white': 'color:#fff', 'text-black': 'color:#000',
    'text-center': 'text-align:center', 'text-left': 'text-align:left', 'text-right': 'text-align:right',
    'font-bold': 'font-weight:700', 'font-semibold': 'font-weight:600', 'font-medium': 'font-weight:500',
    'font-normal': 'font-weight:400', 'max-w-none': 'max-width:none',
    'overflow-clip': 'overflow:clip', 'overflow-hidden': 'overflow:hidden',
    'object-contain': 'object-fit:contain', 'object-cover': 'object-fit:cover',
    'pointer-events-none': 'pointer-events:none', 'whitespace-nowrap': 'white-space:nowrap',
    border: 'border-width:1px', 'border-2': 'border-width:2px', 'border-b': 'border-bottom-width:1px', 'border-t': 'border-top-width:1px',
    'border-solid': 'border-style:solid',
    '-translate-x-1/2': '--translate-x:-50%;transform:translate(var(--translate-x,0),var(--translate-y,0))',
    '-translate-y-1/2': '--translate-y:-50%;transform:translate(var(--translate-x,0),var(--translate-y,0))',
    '-translate-x-full': '--translate-x:-100%;transform:translate(var(--translate-x,0),var(--translate-y,0))',
    'mb-0': 'margin-bottom:0',
  };
  if (fixed[token]) return fixed[token];
  if (/^opacity-\d+$/.test(token)) return `opacity:${Number(token.slice(8)) / 100}`;
  if (token.startsWith('font-[')) return 'font-family:"Plus Jakarta Sans",sans-serif';
  const arbitrary = token.match(/^\[(.+?):(.+)\]$/);
  if (arbitrary) return `${arbitrary[1]}:${arbitrary[2].replaceAll('_', ' ')}`;
  const match = token.match(/^([a-z-]+)-\[(.+)\]$/);
  if (match) {
    const [, key, raw] = match;
    const value = raw.replaceAll('_', ' ');
    const properties = { left: 'left', right: 'right', top: 'top', bottom: 'bottom', w: 'width',
      h: 'height', 'min-w': 'min-width', 'min-h': 'min-height', 'max-w': 'max-width',
      rounded: 'border-radius', leading: 'line-height', shadow: 'box-shadow',
      inset: 'inset', bg: 'background-color', border: 'border-color', opacity: 'opacity',
      gap: 'gap', p: 'padding', flex: 'flex' };
    if (key === 'size') return `width:${value};height:${value}`;
    if (key === 'text') return /^(#|rgb|hsl|var\()/.test(value) ? `color:${value}` : `font-size:${value}`;
    if (key === 'drop-shadow') return `filter:drop-shadow(${value})`;
    if (properties[key]) return `${properties[key]}:${value}`;
  }
  unsupported.add(token);
  return '';
}

function cssClass(classes) {
  const name = 'f' + crypto.createHash('sha1').update(classes).digest('hex').slice(0, 12);
  if (!rules.has(name)) rules.set(name, classes.split(/\s+/).map(declaration).filter(Boolean).join(';'));
  return name;
}

function feature(name) {
  if (/^GD[07]/.test(name)) return 'auth';
  if (/^GD1\.3|^GD1\.4/.test(name)) return 'sales';
  if (/^GD1/.test(name)) return 'orders';
  if (/^GD2/.test(name)) return 'users';
  if (/^GD[36]/.test(name)) return 'shifts';
  if (/^GD4/.test(name)) return 'inventory';
  return 'reports';
}

const manifest = [];
for (const screen of screens) {
  const slug = screen.id.replace(':', '-');
  const contextPath = path.join(root, 'design-context', `${slug}.txt`);
  const oldContextPath = path.join(root, 'design-context', `${slug}.tsx`);
  if (!fs.existsSync(contextPath) && fs.existsSync(oldContextPath)) fs.renameSync(oldContextPath, contextPath);
  if (!fs.existsSync(contextPath)) continue;
  let source = fs.readFileSync(contextPath, 'utf8');
  // Generated snapshots are visual references outside the running application.
  source = source.split('SUPER CRITICAL:')[0].trim();
  const prefix = source.match(/const assetPathPrefix = "([^"]+)";/)?.[1];
  if (prefix) {
    for (const m of source.matchAll(/\$\{assetPathPrefix\}\/([^`]+)`/g)) {
      assets.push({ url: `${prefix}/${m[1]}`, path: `public/assets/figma/${slug}/${m[1]}` });
    }
    source = source.replace(prefix, `/assets/figma/${slug}`);
  }
  source = source.replace(/className="([^"]*)"/g, (_, value) => `className="${cssClass(value)}"`);
  const group = feature(screen.name);
  const output = path.join(root, 'design-context/generated', group, `${slug}.tsx`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `// Figma ${screen.id}: ${screen.name}\n// Generated from the saved high-fidelity design context; edit the compiler or interaction layer.\n${source}\n`);
  manifest.push({ ...screen, feature: group, module: `./${group}/${slug}.tsx` });
}

if (unsupported.size) throw new Error(`Unsupported Figma style tokens: ${[...unsupported].join(', ')}`);
fs.mkdirSync(path.join(root, 'design-context/generated'), { recursive: true });
fs.writeFileSync(path.join(root, 'design-context/generated/figma.css'),
  `/* Exact Figma declarations, converted to plain CSS. No Tailwind runtime. */\n` +
  [...rules].map(([name, value]) => `.${name}{${value}}`).join('\n') + '\n');
fs.writeFileSync(path.join(root, 'design-context/generated/screens.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'design-context/assets.json'), JSON.stringify(assets, null, 2) + '\n');
console.log(`Compiled ${manifest.length}/${screens.length} screens, ${rules.size} CSS rules, ${assets.length} assets.`);
