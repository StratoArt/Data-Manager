// Audit media OPT. Jalankan: node scripts/audit-opt-media.mjs   (exit 1 bila ada ERROR)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasets = [['hama', 'data/opt/hama.json'], ['penyakit', 'data/opt/penyakit.json'], ['gulma', 'data/opt/gulma.json']];
const MEDIA_ROOT = 'assets/opt-media';
const LEGACY = /^assets\/opt\/(photos|reference)\//;
let errors = 0, warns = 0;
const err = m => { console.error('[ERROR] ' + m); errors++; };
const warn = m => { console.warn('[WARN]  ' + m); warns++; };
const magic = buf => buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'png'
  : buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpg'
  : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' ? 'webp'
  : buf.subarray(0, 3).toString() === 'GIF' ? 'gif' : 'unknown';

const referenced = new Map(); // path -> [category/id]
let records = 0, entries = 0, hotlinks = 0;
for (const [category, relative] of datasets) {
  const list = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const ids = new Set();
  for (const r of list) {
    records++;
    if (!r.id) { err(`${category}: record tanpa id (${r.name || '?'})`); continue; }
    if (ids.has(r.id)) err(`${category}: id ganda ${r.id}`);
    ids.add(r.id);
    for (const im of Array.isArray(r.images) ? r.images : []) {
      entries++;
      const where = `${category}/${r.id}`;
      if (im.data) err(`${where}: entri berisi base64 "data" — tidak akan tampil di PestiApps. Pakai local_path.`);
      const lp = String(im.local_path || '').trim();
      if (!lp) { if (im.remote_url || im.url) hotlinks++; else warn(`${where}: entri gambar tanpa local_path/remote_url`); continue; }
      if (LEGACY.test(lp)) err(`${where}: local_path memakai prefix lama (${lp}); gunakan ${MEDIA_ROOT}/…`);
      else if (!lp.startsWith(MEDIA_ROOT + '/')) err(`${where}: local_path di luar ${MEDIA_ROOT}/ (${lp})`);
      const canonical = lp.replace(LEGACY, `${MEDIA_ROOT}/$1/`); // cek file di lokasi kanonik agar error tidak dobel
      if (!fs.existsSync(path.join(root, canonical))) err(`${where}: file tidak ada: ${canonical}`);
      (referenced.get(canonical) || referenced.set(canonical, []).get(canonical)).push(where);
    }
  }
  console.log(`${category}: ${list.length} record, ${ids.size} id unik`);
}

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } })(path.join(root, MEDIA_ROOT));
const hashes = new Map();
for (const abs of files) {
  const rel = path.relative(root, abs).split(path.sep).join('/'), buf = fs.readFileSync(abs);
  const ext = path.extname(rel).slice(1).toLowerCase().replace('jpeg', 'jpg'), real = magic(buf);
  if (real !== ext) err(`${rel}: ekstensi .${ext} tapi isi ${real}`);
  const h = crypto.createHash('sha1').update(buf).digest('hex');
  (hashes.get(h) || hashes.set(h, []).get(h)).push(rel);
  if (!referenced.has(rel)) warn(`${rel}: tidak dipakai record mana pun (tautkan lewat Data Manager atau hapus)`);
  else if (rel.includes('/photos/') && referenced.get(rel).length > 1) warn(`${rel}: foto dipakai ${referenced.get(rel).length} record (${referenced.get(rel).join(', ')}) — pastikan memang sama spesies`);
}
for (const group of hashes.values()) if (group.length > 1) err(`isi file identik: ${group.join(' = ')}`);

console.log(`TOTAL: ${records} record; ${entries} entri gambar (${hotlinks} hotlink remote); ${files.length} file media; ${warns} peringatan; ${errors} error`);
process.exitCode = errors ? 1 : 0;
