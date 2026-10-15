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
  await GH.publishOptMedia(c, { datasetKey: 'pests', recordId: 'spodoptera-exigua', ops: [{ op: 'replace', match: 'assets/opt/photos/spodoptera-exigua-larva.webp', base64: png.toString('base64'), ext: 'webp', meta: meta() }] });
  assert.ok(!m.files.has('assets/opt-media/photos/spodoptera-exigua-larva.webp'), 'yatim -> terhapus');
  assert.ok(m.files.has('assets/opt-media/photos/spodoptera-exigua-larva-02.webp') || [...m.files.keys()].some(k => /spodoptera-exigua-larva-0\d\.webp$/.test(k)));
  // thrips-species-hosts.png dipakai 5 record -> tidak boleh terhapus
  const { m: m2, c: c2 } = mk();
  await GH.publishOptMedia(c2, { datasetKey: 'pests', recordId: 'frankliniella-occidentalis', ops: [{ op: 'remove', match: 'assets/opt-media/reference/thrips-species-hosts.png', deleteFile: true }] });
  assert.ok(m2.files.has('assets/opt-media/reference/thrips-species-hosts.png'));
  const t = JSON.parse(m2.files.get('data/opt/hama.json').toString()).find(r => r.id === 'frankliniella-occidentalis');
  assert.ok(!t.images.some(i => /thrips-species-hosts/.test(i.local_path || '')));
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
console.log(`\n${passed} tes lulus${process.exitCode ? ' — ADA YANG GAGAL' : ''}`);
