// Jalankan: node tests/github-sync.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { MockGitHub } from './mock-github.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GH = require('../src/github-sync.js');
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; } };
const mk = () => { const m = new MockGitHub(root); return { m, c: new GH.Client({ token: 'ghp_test', fetchImpl: m.fetchImpl }) }; };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const meta = (o = {}) => Object.assign({ image_type: 'organism', stage: 'larva', attribution: 'Foto pengguna — Crop Expert', notes: '', source_url: '' }, o);

await test('serializeLike menghasilkan byte yang sama untuk 3 file OPT asli', () => {
  for (const f of Object.values(GH.OPT_FILES)) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    assert.equal(GH.serializeLike(t, JSON.parse(t)), t, f);
  }
});
await test('pickFilename menghindari tabrakan', () => {
  const taken = new Set(['spodoptera-litura-larva.webp']);
  assert.equal(GH.pickFilename('spodoptera-litura', { stage: 'larva' }, 'webp', taken), 'spodoptera-litura-larva-02.webp');
  assert.equal(GH.pickFilename('spodoptera-litura', { stage: 'larva' }, '.JPEG', taken), 'spodoptera-litura-larva.jpg');
  assert.equal(GH.pickFilename('X Y', { image_type: 'symptom_reference' }, 'webp', taken), 'x-y-symptom-reference.webp');
});
await test('applyOps: add/replace/remove + error', () => {
  const recs = [{ id: 'a', images: [{ local_path: 'assets/opt-media/photos/a.webp' }, { remote_url: 'https://x/y.jpg' }] }, { id: 'b' }];
  let r = GH.applyOps(recs, 'a', [{ op: 'add', entry: { local_path: 'n.webp' } }, { op: 'remove', match: 'https://x/y.jpg' }]);
  assert.deepEqual(r.records[0].images.map(GH.imageKey), ['assets/opt-media/photos/a.webp', 'n.webp']);
  assert.equal(recs[0].images.length, 2, 'input tidak boleh berubah');
  r = GH.applyOps(recs, 'a', [{ op: 'replace', match: 'assets/opt-media/photos/a.webp', entry: { local_path: 'z.webp' } }]);
  assert.deepEqual(r.removed, [{ path: 'assets/opt-media/photos/a.webp', deleteFile: true }]);
  assert.equal(GH.applyOps(recs, 'b', [{ op: 'add', entry: { local_path: 'q' } }]).records[1].images.length, 1);
  assert.throws(() => GH.applyOps(recs, 'nope', []), /belum ada di repo/);
  assert.throws(() => GH.applyOps(recs, 'a', [{ op: 'remove', match: 'tidak-ada' }]), /sudah tidak ada/);
});
await test('verify: sukses, token salah, repo salah', async () => {
  const { c, m } = mk();
  const v = await c.verify(); assert.equal(v.login, 'tester'); assert.equal(v.canPush, true);
  await assert.rejects(new GH.Client({ token: 'salah', fetchImpl: m.fetchImpl }).verify(), /Token ditolak/);
  await assert.rejects(new GH.Client({ token: 'ghp_test', repo: 'Lain', fetchImpl: m.fetchImpl }).verify(), /tidak ditemukan/);
});
await test('tanpa token commit ditolak (401) dan repo tidak berubah', async () => {
  const { m } = mk(); const before = m.head;
  const c = new GH.Client({ token: '', fetchImpl: m.fetchImpl });
  await assert.rejects(GH.publishOptMedia(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', ops: [{ op: 'add', base64: png.toString('base64'), ext: 'png', meta: meta() }] }), /Token ditolak/);
  assert.equal(m.head, before);
});
await test('add 2 foto + attach: SATU commit, nama unik, JSON & biner utuh', async () => {
  const { m, c } = mk(); const orig = JSON.parse(m.files.get('data/opt/hama.json').toString());
  const res = await GH.publishOptMedia(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', message: 'uji', ops: [
    { op: 'add', base64: png.toString('base64'), ext: 'webp', meta: meta({ stage: 'larva' }) },
    { op: 'add', base64: png.toString('base64'), ext: 'webp', meta: meta({ stage: 'gejala', image_type: 'symptom_reference', notes: 'uji' }) },
    { op: 'attach', path: 'assets/opt-media/photos/spodoptera-litura.webp', meta: meta({ stage: '', attribution: 'Ilustrasi pengguna' }) }
  ] });
  assert.equal(m.commits.size, 2, 'tepat satu commit baru'); assert.equal(m.commits.get(m.head).message, 'uji');
  assert.ok(m.files.get('assets/opt-media/photos/spodoptera-litura-larva-02.webp').equals(png));
  assert.ok(m.files.has('assets/opt-media/photos/spodoptera-litura-gejala.webp'));
  const now = JSON.parse(m.files.get('data/opt/hama.json').toString());
  assert.equal(now.length, orig.length);
  now.forEach((r, i) => { if (r.id !== 'spodoptera-litura') assert.deepEqual(r, orig[i], r.id); });
  const lit = now.find(r => r.id === 'spodoptera-litura');
  const n0 = orig.find(r => r.id === 'spodoptera-litura').images.length;
  assert.equal(lit.images.length, n0 + 3);
  assert.ok(lit.images.slice(n0).every(i => i.local_path.startsWith('assets/opt-media/') && i.remote_url === ''));
  assert.equal(res.commit.sha, m.head);
  assert.deepEqual(Object.keys(lit.images[n0]), ['image_type', 'stage', 'local_path', 'remote_url', 'source_url', 'attribution', 'notes']);
});
await test('balapan: ada commit orang lain -> otomatis diulang dari head baru', async () => {
  const { m, c } = mk(); m.raceOnce = true; const msgs = [];
  await GH.publishOptMedia(c, { datasetKey: 'weeds', recordId: 'echinochloa', onProgress: s => msgs.push(s), ops: [{ op: 'add', base64: png.toString('base64'), ext: 'png', meta: meta({ stage: '' }) }] });
  assert.equal(m.files.get('README.md').toString(), 'diubah orang lain\n', 'perubahan orang lain tidak boleh hilang');
  assert.ok(m.files.has('assets/opt-media/photos/echinochloa-organism.png'));
  assert.ok(msgs.some(s => /mengulang/.test(s)));
});
await test('replace: file lama dihapus bila yatim, DIPERTAHANKAN bila dipakai record lain', async () => {
  const { m, c } = mk();
  const all = Object.values(GH.OPT_FILES).flatMap(f => JSON.parse(m.files.get(f).toString()));
  const count = {}; all.forEach(r => (r.images || []).forEach(i => i.local_path && (count[GH.normalizePath(i.local_path)] = (count[GH.normalizePath(i.local_path)] || 0) + 1)));
  const rec = JSON.parse(m.files.get('data/opt/hama.json').toString()).find(r => (r.images || []).some(i => i.local_path && count[GH.normalizePath(i.local_path)] === 1));
  const img = rec.images.find(i => i.local_path && count[GH.normalizePath(i.local_path)] === 1), old = GH.normalizePath(img.local_path);
  await GH.publishOptMedia(c, { datasetKey: 'pests', recordId: rec.id, ops: [{ op: 'replace', match: img.local_path, base64: png.toString('base64'), ext: 'webp', meta: meta({ stage: img.stage || '' }) }] });
  assert.ok(!m.files.has(old), 'yatim -> terhapus: ' + old);
  const shared = Object.entries(count).find(([, n]) => n > 1)[0], owner = rec2 => (rec2.images || []).some(i => GH.normalizePath(i.local_path || '') === shared);
  const { m: m2, c: c2 } = mk(); const holder = JSON.parse(m2.files.get('data/opt/hama.json').toString()).find(owner);
  await GH.publishOptMedia(c2, { datasetKey: 'pests', recordId: holder.id, ops: [{ op: 'remove', match: shared, deleteFile: true }] });
  assert.ok(m2.files.has(shared), 'dipakai record lain -> dipertahankan: ' + shared);
  assert.ok(!JSON.parse(m2.files.get('data/opt/hama.json').toString()).find(r => r.id === holder.id).images.some(i => GH.normalizePath(i.local_path || '') === shared));
});
await test('remove + deleteFile menghapus file yang hanya dipakai satu entri', async () => {
  const { m, c } = mk(); const f = 'assets/opt-media/photos/spodoptera-litura-adult.webp';
  assert.ok(m.files.has(f));
  const res = await GH.publishOptMedia(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', ops: [{ op: 'remove', match: 'assets/opt/photos/spodoptera-litura-adult.webp', deleteFile: true }] });
  assert.ok(!m.files.has(f)); assert.deepEqual(res.deleted, [f]);
});
await test('record tidak ada -> error jelas, tidak ada commit, tidak ada blob terunggah', async () => {
  const { m, c } = mk(); const before = m.head; const calls = m.calls.length;
  await assert.rejects(GH.publishOptMedia(c, { datasetKey: 'pests', recordId: 'PESTS-baru', ops: [{ op: 'add', base64: png.toString('base64'), ext: 'png', meta: meta() }] }), /belum ada di repo/);
  assert.equal(m.head, before); assert.ok(!m.calls.slice(calls).some(x => x.includes('/git/blobs')));
});
await test('listMediaFiles menelusuri subfolder reference/fusarium', async () => {
  const { c } = mk(); const l = await GH.listMediaFiles(c);
  assert.ok(l.includes('assets/opt-media/reference/fusarium/fusarium-bawang-merah-gejala-utama.png')); assert.ok(l.includes('assets/opt-media/photos/spodoptera-litura.webp'));
});

/* ---------------- v0.7: editor detail ---------------- */
const J = (m, f) => JSON.parse(m.files.get(f).toString());
const pairs = m => { const a = new Set(), b = new Set(); J(m, 'data/products/pestisida.json').records.forEach(p => (p.linked_opt_ids || []).forEach(o => a.add(p.id + '|' + o))); J(m, 'data/relations/product_opt.json').records.forEach(r => b.add(r.product_id + '|' + r.opt_id)); return { a, b }; };
await test('edit field: hanya record itu yang berubah, format file & field lain utuh', async () => {
  const { m, c } = mk(); const orig = J(m, 'data/opt/hama.json'); const before = m.commits.size;
  const res = await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', fields: { description: '  Ulat polifag.  ', hosts: 'Cabai\n\n Tomat \nBawang', common: 'Ulat grayak', hacker: 'x', images: 'jangan' } });
  assert.equal(m.commits.size, before + 1);
  const now = J(m, 'data/opt/hama.json'), r = now.find(x => x.id === 'spodoptera-litura'), o = orig.find(x => x.id === 'spodoptera-litura');
  assert.equal(r.description, 'Ulat polifag.'); assert.deepEqual(r.hosts, ['Cabai', 'Tomat', 'Bawang']);
  assert.ok(!('hacker' in r)); assert.deepEqual(r.images, o.images, 'images tidak boleh tersentuh'); assert.deepEqual(r.symptoms, o.symptoms);
  now.forEach((x, i) => { if (x.id !== 'spodoptera-litura') assert.deepEqual(x, orig[i]); });
  const only = [...m.snapshots.get(m.commits.get(m.head).tree).keys()].filter(f => !m.snapshots.get('t0').has(f) || !m.snapshots.get('t0').get(f).equals(m.files.get(f)));
  assert.deepEqual(only, ['data/opt/hama.json']); assert.equal(res.created, false);
});
await test('field kosong tidak membuat key baru; field yang sudah ada boleh dikosongkan', async () => {
  const { m, c } = mk();
  await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', fields: { diagnostic: '', family: '' } });
  const r = J(m, 'data/opt/hama.json').find(x => x.id === 'spodoptera-litura'); assert.ok(!('diagnostic' in r)); assert.equal(r.family, '');
});
await test('bahan aktif: dinormalisasi (trim, dedupe), bisa dikosongkan', async () => {
  const { m, c } = mk();
  await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', activeIngredients: [{ name: ' Emamektin benzoat ', note: 'Larva instar awal' }, { name: 'emamektin BENZOAT' }, { name: '' }, { name: 'Klorantraniliprol' }] });
  let r = J(m, 'data/opt/hama.json').find(x => x.id === 'spodoptera-litura');
  assert.deepEqual(r.active_ingredients, [{ name: 'Emamektin benzoat', note: 'Larva instar awal', status: 'manual' }, { name: 'Klorantraniliprol', status: 'manual' }]);
  await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', activeIngredients: [] });
  r = J(m, 'data/opt/hama.json').find(x => x.id === 'spodoptera-litura'); assert.deepEqual(r.active_ingredients, []);
  await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'thrips-tabaci', activeIngredients: [] });
  assert.ok(!('active_ingredients' in J(m, 'data/opt/hama.json').find(x => x.id === 'thrips-tabaci')), 'daftar kosong tidak membuat key baru');
});
await test('icon: pilih bawaan, hapus, dan validasi nama', async () => {
  const { m, c } = mk();
  await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', icon: { value: 'thrips.svg' } });
  assert.equal(J(m, 'data/opt/hama.json').find(x => x.id === 'spodoptera-litura').icon, 'thrips.svg');
  await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', icon: { value: '' } });
  assert.equal(J(m, 'data/opt/hama.json').find(x => x.id === 'spodoptera-litura').icon, null);
  const n = m.commits.size;
  for (const bad of ['../x.svg', 'a/b/c.svg', 'x y.svg', '/etc/passwd']) await assert.rejects(GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', icon: { value: bad } }), /tidak valid/);
  assert.equal(m.commits.size, n);
});
await test('icon unggahan: file + index.json + record dalam satu commit; unggahan kedua tidak menimpa', async () => {
  const { m, c } = mk(); const n0 = m.commits.size;
  const r1 = await GH.publishRecordEdit(c, { datasetKey: 'crops', recordId: 'padi', icon: { upload: { base64: png.toString('base64'), ext: 'png' } } });
  assert.equal(m.commits.size, n0 + 1); assert.equal(r1.iconPath, 'assets/icons/custom/padi-icon.png');
  assert.ok(m.files.get('assets/icons/custom/padi-icon.png').equals(png));
  assert.equal(J(m, 'data/master/crops.json').find(x => x.id === 'padi').icon, 'custom/padi-icon.png');
  await GH.publishRecordEdit(c, { datasetKey: 'crops', recordId: 'padi', icon: { upload: { base64: png.toString('base64'), ext: 'png' } } });
  assert.ok(m.files.has('assets/icons/custom/padi-icon-02.png')); assert.equal(J(m, 'data/master/crops.json').find(x => x.id === 'padi').icon, 'custom/padi-icon-02.png');
  const idx = J(m, 'assets/icons/index.json'); assert.ok(idx.icons.some(i => i.value === 'custom/padi-icon.png') && idx.icons.some(i => i.value === 'custom/padi-icon-02.png'));
});
await test('produk: tambah/hapus tautan mengubah linked_opt_ids DAN product_opt.json secara konsisten', async () => {
  const { m, c } = mk(); const p0 = J(m, 'data/products/pestisida.json'); const rel0 = J(m, 'data/relations/product_opt.json');
  assert.deepEqual([...pairs(m).a].sort(), [...pairs(m).b].sort(), 'awal konsisten');
  const existing = rel0.records.find(r => r.opt_id === 'bemisia-tabaci'); const unlinked = p0.records.filter(p => !(p.linked_opt_ids || []).length).slice(0, 2).map(p => p.id);
  const res = await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'bemisia-tabaci', products: { add: [...unlinked, unlinked[0]], remove: [existing.product_id] } });
  const p1 = J(m, 'data/products/pestisida.json'), rel1 = J(m, 'data/relations/product_opt.json'); const { a, b } = pairs(m);
  assert.deepEqual([...a].sort(), [...b].sort(), 'tetap konsisten'); assert.equal(rel1.record_count, rel1.records.length);
  unlinked.forEach(id => assert.ok(p1.records.find(p => p.id === id).linked_opt_ids.includes('bemisia-tabaci')));
  assert.ok(!p1.records.find(p => p.id === existing.product_id).linked_opt_ids.includes('bemisia-tabaci'));
  p1.records.forEach((p, i) => { if (![...unlinked, existing.product_id].includes(p.id)) assert.deepEqual(p, p0.records[i]); });
  assert.equal(rel1.records.length, rel0.records.length + 2 - 1); assert.ok(res.productRecords && res.relRecords);
  assert.equal(p1.dataset_version, p0.dataset_version);
});
await test('produk: id tak dikenal -> error, tidak ada commit', async () => {
  const { m, c } = mk(); const n = m.commits.size;
  await assert.rejects(GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'bemisia-tabaci', fields: { notes: 'x' }, products: { add: ['tidak-ada'] } }), /tidak ada di repo/);
  assert.equal(m.commits.size, n);
});
await test('buat record baru: id slug unik, images/provenance, nama wajib', async () => {
  const { m, c } = mk(); const n = m.commits.size;
  await assert.rejects(GH.publishRecordEdit(c, { datasetKey: 'weeds', recordId: null, fields: { name: '  ' } }), /Nama wajib/); assert.equal(m.commits.size, n);
  const res = await GH.publishRecordEdit(c, { datasetKey: 'weeds', recordId: null, fields: { name: 'Echinochloa', common: 'Uji', hosts: 'Padi' }, activeIngredients: [{ name: 'Glifosat' }] });
  assert.equal(res.created, true); assert.equal(res.record.id, 'echinochloa-2'); assert.deepEqual(res.record.images, []); assert.equal(res.record.provenance.source, 'Data Manager manual entry');
  const r = J(m, 'data/opt/gulma.json').find(x => x.id === 'echinochloa-2'); assert.deepEqual(r.hosts, ['Padi']); assert.equal(r.active_ingredients[0].name, 'Glifosat');
  assert.equal(J(m, 'data/opt/gulma.json').length, res.records.length);
});
await test('crops: hanya name/latin + icon; key lain diabaikan; produk ditolak untuk crops', async () => {
  const { m, c } = mk();
  await GH.publishRecordEdit(c, { datasetKey: 'crops', recordId: 'padi', fields: { name: 'Padi sawah', latin: 'Oryza sativa L.', related_opt: 'x', hosts: 'y' }, icon: { value: 'crop-corn.svg' } });
  const r = J(m, 'data/master/crops.json').find(x => x.id === 'padi'); assert.equal(r.name, 'Padi sawah'); assert.equal(r.icon, 'crop-corn.svg'); assert.ok(Array.isArray(r.related_opt) && !('hosts' in r));
});
await test('editor: record tak ada -> error; balapan commit -> otomatis diulang', async () => {
  const { m, c } = mk(); await assert.rejects(GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'nope', fields: {} }), /tidak ditemukan/);
  m.raceOnce = true; await GH.publishRecordEdit(c, { datasetKey: 'pests', recordId: 'spodoptera-litura', fields: { notes: 'catatan baru' } });
  assert.equal(m.files.get('README.md').toString(), 'diubah orang lain\n'); assert.equal(J(m, 'data/opt/hama.json').find(x => x.id === 'spodoptera-litura').notes, 'catatan baru');
});
console.log(`\n${passed} tes lulus${process.exitCode ? ' — ADA YANG GAGAL' : ''}`);
