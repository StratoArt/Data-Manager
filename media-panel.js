/* Panel foto OPT + pengaturan & publish ke GitHub.
 * Bergantung pada global dari src/app.js (DB, REPO, DIRTY, $, esc, mediaSrc, toast, saveDraft, render)
 * dan GitHubSync dari src/github-sync.js. Dimuat setelah app.js. */
const GH_CFG_KEY = 'ce-dm-gh-cfg', GH_TOKEN_KEY = 'ce-dm-gh-token';
const MEDIA_DATASETS = new Set(Object.keys(GitHubSync.OPT_FILES));
const IMAGE_TYPES = [['organism', 'Foto organisme'], ['symptom_reference', 'Foto gejala'], ['symptom', 'Gejala (umum)'], ['lifecycle', 'Siklus hidup'], ['species_reference', 'Tabel spesies / inang'], ['ai_illustration', 'Ilustrasi AI']];
const STAGES = ['', 'telur', 'larva', 'pupa', 'nimfa', 'imago', 'gejala', 'lifecycle'];
const OK_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 20 * 1024 * 1024;

/* ---------- konfigurasi & token ---------- */
const GH = {
  load() {
    let c = {}; try { c = JSON.parse(localStorage.getItem(GH_CFG_KEY) || '{}'); } catch (e) { /* abaikan */ }
    const remembered = localStorage.getItem(GH_TOKEN_KEY);
    return { owner: c.owner || GitHubSync.DEFAULTS.owner, repo: c.repo || GitHubSync.DEFAULTS.repo, branch: c.branch || GitHubSync.DEFAULTS.branch,
      token: sessionStorage.getItem(GH_TOKEN_KEY) || remembered || '', remember: !!remembered };
  },
  save(c) {
    localStorage.setItem(GH_CFG_KEY, JSON.stringify({ owner: c.owner, repo: c.repo, branch: c.branch }));
    sessionStorage.removeItem(GH_TOKEN_KEY); localStorage.removeItem(GH_TOKEN_KEY);
    if (c.token) (c.remember ? localStorage : sessionStorage).setItem(GH_TOKEN_KEY, c.token);
  },
  forget() { sessionStorage.removeItem(GH_TOKEN_KEY); localStorage.removeItem(GH_TOKEN_KEY); }
};
function updateGhButton() { const b = $('ghbtn'); if (!b) return; const ok = !!GH.load().token; b.classList.toggle('connected', ok); b.textContent = ok ? 'GitHub ●' : 'GitHub'; b.title = ok ? 'Token tersimpan di sesi ini' : 'Belum ada token GitHub'; }
function ghForm() { return { owner: $('ghOwner').value.trim(), repo: $('ghRepo').value.trim(), branch: $('ghBranch').value.trim(), token: $('ghToken').value.trim(), remember: $('ghRemember').checked }; }
function openGh(msg) {
  const c = GH.load();
  $('ghOwner').value = c.owner; $('ghRepo').value = c.repo; $('ghBranch').value = c.branch; $('ghToken').value = c.token; $('ghRemember').checked = c.remember;
  $('ghResult').textContent = msg || ''; $('ghResult').className = 'gh-result';
  if (!$('ghdlg').open) $('ghdlg').showModal();
}
$('ghbtn').onclick = () => openGh();
$('ghClose').onclick = () => $('ghdlg').close();
$('ghForget').onclick = () => { GH.forget(); $('ghToken').value = ''; updateGhButton(); $('ghResult').textContent = 'Token dihapus dari browser ini.'; };
$('ghSave').onclick = () => { GH.save(ghForm()); updateGhButton(); $('ghdlg').close(); toast('Pengaturan GitHub disimpan.'); };
$('ghTest').onclick = async () => {
  const c = ghForm(), out = $('ghResult'); out.className = 'gh-result'; out.textContent = 'Menguji koneksi…';
  try {
    if (!c.token) throw new Error('Isi token dulu.');
    const v = await new GitHubSync.Client(c).verify();
    out.className = 'gh-result ok';
    out.textContent = `Terhubung ke ${v.fullName}${v.login ? ' sebagai ' + v.login : ''}.` + (v.canPush === false ? ' PERINGATAN: token tidak punya izin tulis.' : '');
  } catch (e) { out.className = 'gh-result err'; out.textContent = e.message; }
};

/* ---------- panel media per record ---------- */
let MP = null;
const typeOpts = sel => IMAGE_TYPES.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
const stageOpts = sel => STAGES.map(v => `<option value="${v}" ${v === (sel || '') ? 'selected' : ''}>${v || '— tahap —'}</option>`).join('');
const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const defType = k => (k === 'diseases' ? 'symptom_reference' : 'organism');
const defMeta = k => ({ image_type: defType(k), stage: '', attribution: 'Foto pengguna — Crop Expert', notes: '', source_url: '', dir: 'auto' });

function mediaPanelInit(k, r) {
  const el = $('mediaPanel');
  if (!MEDIA_DATASETS.has(k)) { el.style.display = 'none'; el.innerHTML = ''; MP = null; return; }
  el.style.display = '';
  MP = { k, rec: r, id: r.id || null, queue: [], seq: 0, files: null, busy: false, status: '', error: '', compress: true };
  renderMedia();
}

function renderMedia() {
  if (!MP) return;
  const el = $('mediaPanel');
  if (!MP.id) { el.innerHTML = '<div class="mp-head"><b>Foto &amp; media</b></div><p class="mp-hint">Record baru belum ada di repo. Foto bisa ditambahkan setelah record ini ada di repo (data/opt/…json).</p>'; return; }
  const imgs = MP.rec.images || [];
  const qByKey = new Map(MP.queue.filter(o => o.op === 'remove' || o.op === 'replace').map(o => [GitHubSync.normalizePath(o.match), o]));
  const cards = imgs.map(im => {
    const key = GitHubSync.imageKey(im), src = mediaSrc(im), q = qByKey.get(GitHubSync.normalizePath(key));
    const tag = !key ? '<span class="mp-tag">tanpa file</span>' : q ? `<span class="mp-tag warn">${q.op === 'replace' ? 'akan diganti' : 'akan dihapus'}</span>` : /^https?:/.test(key) ? '<span class="mp-tag">hotlink</span>' : '';
    const btns = !key || q || MP.busy ? '' : `<div class="mp-btns"><button type="button" class="btn ghost sm" data-act="replace" data-key="${esc(key)}">Ganti</button><button type="button" class="btn danger sm" data-act="remove" data-key="${esc(key)}">Hapus</button></div>`;
    return `<div class="mp-card ${q ? 'queued' : ''}">${src ? `<img src="${esc(src)}" loading="lazy" onerror="this.classList.add('media-error')">` : '<div class="mp-noimg">—</div>'}<small><b>${esc(im.stage || im.image_type || 'foto')}</b> ${tag}</small><code>${esc(key.split('/').pop() || '—')}</code>${btns}</div>`;
  }).join('');
  const queue = MP.queue.map(o => {
    if (o.op === 'remove') return `<div class="mp-q"><div class="mp-qhead"><b>Hapus entri</b> <code>${esc(o.match.split('/').pop())}</code><button type="button" class="btn ghost sm" data-act="unq" data-id="${o.id}">Batal</button></div><label class="mp-chk"><input type="checkbox" data-f="deleteFile" data-id="${o.id}" ${o.deleteFile ? 'checked' : ''}> hapus juga file-nya dari repo (bila tidak dipakai record lain)</label></div>`;
    const m = o.meta, head = o.op === 'attach' ? `Tautkan <code>${esc(o.path.split('/').pop())}</code>` : `${o.op === 'replace' ? 'Ganti dengan' : 'Foto baru'}: ${esc(o.name)} <small>(${o.ready ? kb(o.bytes) + ' · ' + o.ext : 'memproses…'})</small>`;
    const prev = o.op === 'attach' ? `<img class="mp-prev" src="${esc(o.path)}" onerror="this.classList.add('media-error')">` : o.preview ? `<img class="mp-prev" src="${o.preview}">` : '';
    return `<div class="mp-q">${prev}<div class="mp-qbody"><div class="mp-qhead"><span>${head}</span><button type="button" class="btn ghost sm" data-act="unq" data-id="${o.id}">Batal</button></div>
      <div class="mp-row"><select data-f="image_type" data-id="${o.id}">${typeOpts(m.image_type)}</select><select data-f="stage" data-id="${o.id}">${stageOpts(m.stage)}</select>${o.op === 'attach' ? '' : `<select data-f="dir" data-id="${o.id}" title="Folder tujuan"><option value="auto" ${m.dir === 'auto' ? 'selected' : ''}>folder: otomatis</option><option value="photos" ${m.dir === 'photos' ? 'selected' : ''}>photos/</option><option value="reference" ${m.dir === 'reference' ? 'selected' : ''}>reference/</option></select>`}</div>
      <input data-f="attribution" data-id="${o.id}" value="${esc(m.attribution)}" placeholder="Atribusi / sumber">
      <input data-f="notes" data-id="${o.id}" value="${esc(m.notes)}" placeholder="Catatan (mis. foto gejala pada bawang merah)">
      <input data-f="source_url" data-id="${o.id}" value="${esc(m.source_url)}" placeholder="URL sumber (opsional)"></div></div>`;
  }).join('');
  const n = MP.queue.length, ready = MP.queue.every(o => o.ready !== false);
  const attach = MP.files ? `<div class="mp-row"><select id="mpAttachSel">${MP.files.map(f => `<option value="${esc(f.path)}">${f.used ? '' : '● belum dipakai · '}${esc(f.path.replace('assets/opt-media/', ''))}</option>`).join('')}</select><button type="button" class="btn ghost sm" data-act="attach">Tautkan</button></div>` : '';
  el.innerHTML = `<div class="mp-head"><b>Foto &amp; media</b><span>${imgs.length} entri <button type="button" class="btn ghost sm" data-act="gh">Pengaturan GitHub</button></span></div>
    <div class="mp-grid">${cards || '<p class="mp-hint">Belum ada foto untuk record ini.</p>'}</div>
    <div class="mp-add"><label class="btn ghost sm mp-file">+ Pilih foto<input id="mpFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden></label>
      <label class="mp-chk"><input id="mpCompress" type="checkbox" ${MP.compress ? 'checked' : ''}> kompres ke WebP (maks 1600 px)</label>
      <button type="button" class="btn ghost sm" data-act="listfiles">Tautkan file yang sudah ada…</button></div>${attach}
    <div class="mp-queue">${queue}</div>
    <div class="mp-pub"><input id="mpMsg" value="${esc(MP.msg || '')}" placeholder="${esc(defaultMessage())}" ${MP.busy ? 'disabled' : ''}>
      <button type="button" class="btn primary" data-act="publish" ${!n || MP.busy || !ready ? 'disabled' : ''}>${MP.busy ? 'Mempublish…' : `Publish ke GitHub${n ? ` (${n})` : ''}`}</button></div>
    <div class="mp-status ${MP.error ? 'err' : ''}">${esc(MP.error || MP.status || (n ? 'Perubahan belum dikirim. Satu commit akan berisi foto + JSON record.' : ''))}</div>`;
}
function defaultMessage() {
  if (!MP) return '';
  const nm = MP.rec.name || MP.id, c = { add: 0, attach: 0, replace: 0, remove: 0 };
  MP.queue.forEach(o => c[o.op]++);
  const parts = [c.add && `tambah ${c.add} foto`, c.attach && `tautkan ${c.attach} file`, c.replace && `ganti ${c.replace} foto`, c.remove && `hapus ${c.remove} entri`].filter(Boolean);
  return `media(${GitHubSync.OPT_FILES[MP.k].split('/').pop().replace('.json', '')}): ${nm}${parts.length ? ' — ' + parts.join(', ') : ''}`;
}

async function prepFile(file, compress, type) {
  const ext0 = OK_MIME[file.type];
  if (!ext0) throw new Error(`Format ${file.type || 'tidak dikenal'} tidak didukung. Pakai JPG, PNG, WebP, atau GIF.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: lebih dari 20 MB.`);
  let blob = file, ext = ext0;
  if (compress && file.type !== 'image/gif') {
    try {
      const diagram = type === 'lifecycle' || type === 'species_reference', maxDim = diagram ? 2000 : 1600;
      const bmp = await createImageBitmap(file), s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close();
      const out = await new Promise(r => cv.toBlob(r, 'image/webp', diagram ? 0.9 : 0.82));
      if (out && out.type === 'image/webp' && (file.type !== 'image/webp' || out.size < file.size)) { blob = out; ext = 'webp'; }
    } catch (e) { /* pakai file asli */ }
  }
  const base64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(new Error('Gagal membaca file.')); fr.readAsDataURL(blob); });
  return { ext, base64, bytes: blob.size, preview: URL.createObjectURL(blob) };
}
async function queueFiles(files, replaceKey) {
  for (const f of files) {
    const o = { id: ++MP.seq, op: replaceKey ? 'replace' : 'add', name: f.name, ready: false, meta: defMeta(MP.k) };
    if (replaceKey) { o.match = replaceKey; const old = (MP.rec.images || []).find(i => GitHubSync.imageKey(i) === replaceKey) || {}; Object.assign(o.meta, { image_type: old.image_type || o.meta.image_type, stage: old.stage || '', attribution: old.attribution || o.meta.attribution, notes: old.notes || '', source_url: old.source_url || '' }); }
    MP.queue.push(o); renderMedia();
    try { Object.assign(o, await prepFile(f, MP.compress, o.meta.image_type), { ready: true }); }
    catch (e) { MP.queue = MP.queue.filter(x => x !== o); toast(e.message, 'err'); }
    renderMedia();
  }
}

async function loadExistingFiles() {
  const c = GH.load(), client = new GitHubSync.Client({ ...c, token: c.token });
  MP.status = 'Memuat daftar file di repo…'; renderMedia();
  try {
    const all = await GitHubSync.listMediaFiles(client);
    const used = new Set(['pests', 'diseases', 'weeds'].flatMap(k => (DB[k] || []).flatMap(r => (r.images || []).map(i => GitHubSync.normalizePath(i.local_path)))));
    MP.files = all.map(path => ({ path, used: used.has(path) })).sort((a, b) => a.used - b.used || a.path.localeCompare(b.path));
    MP.status = `${MP.files.filter(f => !f.used).length} file belum dipakai record mana pun (ditandai ●).`;
  } catch (e) { MP.error = e.message; }
  renderMedia();
}

async function publishMedia() {
  if (!MP || MP.busy || !MP.queue.length) return;
  const cfg = GH.load();
  if (!cfg.token) { openGh('Isi token GitHub dulu, lalu klik Simpan.'); return; }
  const ops = MP.queue.map(o => o.op === 'remove' ? { op: 'remove', match: o.match, deleteFile: o.deleteFile }
    : o.op === 'attach' ? { op: 'attach', path: o.path, meta: o.meta }
    : { op: o.op, match: o.match, base64: o.base64, ext: o.ext, meta: o.meta });
  const message = ($('mpMsg') && $('mpMsg').value.trim()) || defaultMessage();
  const st = MP; st.busy = true; st.error = ''; st.status = 'Menyiapkan…'; renderMedia();
  try {
    const res = await GitHubSync.publishOptMedia(new GitHubSync.Client(cfg), { datasetKey: st.k, recordId: st.id, ops, message, onProgress: s => { st.status = s; const el = document.querySelector('.mp-status'); if (el) el.textContent = s; } });
    onPublished(st, res);
  } catch (e) { st.error = e.message; toast(e.message, 'err'); }
  st.busy = false; if (MP === st) renderMedia();
}
function onPublished(st, res) {
  const k = st.k;
  REPO[k] = res.records;
  if (DIRTY.has(k)) { DB[k] = DB[k].map(r => (r.id === st.id ? { ...r, images: res.record.images } : r)); saveDraft(); }
  else DB[k] = JSON.parse(JSON.stringify(res.records));
  st.rec = DB[k].find(r => r.id === st.id) || res.record;
  st.queue = []; st.msg = ''; st.error = ''; st.files = null;
  st.status = `Commit ${res.commit.sha.slice(0, 7)} berhasil.` + (res.deleted.length ? ` ${res.deleted.length} file lama dihapus.` : '');
  toast(`Tersimpan ke GitHub · commit ${res.commit.sha.slice(0, 7)} <a href="${res.commit.url}" target="_blank" rel="noopener">lihat</a>. PestiApps memuatnya setelah cache GitHub (± 5 menit).`, 'ok', true);
  render();
}

/* ---------- event delegasi ---------- */
const mpEl = $('mediaPanel');
mpEl.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !MP || MP.busy) return;
  const act = b.dataset.act, id = +b.dataset.id;
  if (act === 'gh') openGh();
  else if (act === 'replace') { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp,image/gif'; inp.onchange = () => inp.files[0] && queueFiles([inp.files[0]], b.dataset.key); inp.click(); }
  else if (act === 'remove') { MP.queue.push({ id: ++MP.seq, op: 'remove', match: b.dataset.key, deleteFile: true }); renderMedia(); }
  else if (act === 'unq') { MP.queue = MP.queue.filter(o => o.id !== id); renderMedia(); }
  else if (act === 'listfiles') loadExistingFiles();
  else if (act === 'attach') { const p = $('mpAttachSel') && $('mpAttachSel').value; if (p) { MP.queue.push({ id: ++MP.seq, op: 'attach', path: p, meta: Object.assign(defMeta(MP.k), { attribution: '' }) }); renderMedia(); } }
  else if (act === 'publish') publishMedia();
});
mpEl.addEventListener('change', e => {
  const t = e.target; if (!MP) return;
  if (t.id === 'mpFiles') { const fs = [...t.files]; t.value = ''; queueFiles(fs); return; }
  if (t.id === 'mpCompress') { MP.compress = t.checked; return; }
  applyField(t);
});
mpEl.addEventListener('input', e => { if (e.target.id === 'mpMsg') MP.msg = e.target.value; else applyField(e.target); });
mpEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }); // jangan submit form record
function applyField(t) {
  if (!MP || !t.dataset.f) return;
  const o = MP.queue.find(x => x.id === +t.dataset.id); if (!o) return;
  if (t.dataset.f === 'deleteFile') o.deleteFile = t.checked; else o.meta[t.dataset.f] = t.value;
}
updateGhButton();
