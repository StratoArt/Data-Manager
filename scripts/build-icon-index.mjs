// Membuat assets/icons/index.json (daftar icon untuk pemilih icon di Data Manager).
// Jalankan: node scripts/build-icon-index.mjs   — jalankan lagi bila menambah file icon secara manual.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'assets/icons');
const EXT = /\.(svg|png|webp|jpe?g)$/i;
const icons = [], seen = new Map();
for (const dir of ['opt', 'crops', 'categories', 'custom']) {
  const d = path.join(base, dir);
  if (!fs.existsSync(d)) continue;
  for (const name of fs.readdirSync(d).filter(f => EXT.test(f)).sort()) {
    const value = dir === 'custom' ? `custom/${name}` : name;
    if (seen.has(value)) {
      const a = fs.readFileSync(path.join(base, seen.get(value), name)), b = fs.readFileSync(path.join(d, name));
      if (!a.equals(b)) console.warn(`[WARN] icon ${value} ada di ${seen.get(value)}/ dan ${dir}/ dengan isi berbeda (dipakai yang pertama)`);
      continue;
    }
    seen.set(value, dir);
    icons.push({ value, path: `${dir}/${name}`, name, dir, label: name.replace(EXT, '').replace(/[-_]+/g, ' ') });
  }
}
fs.writeFileSync(path.join(base, 'index.json'), JSON.stringify({ version: 1, icons }, null, 2) + '\n');
console.log(`assets/icons/index.json: ${icons.length} icon`);
