/* Editor detail untuk Tanaman, Hama, Penyakit, Gulma:
 * field teks, icon, bahan aktif terkait, dan produk yang bisa digunakan -> SATU commit ke GitHub.
 * Dimuat setelah app.js dan media-panel.js (memakai global DB, REPO, DIRTY, $, esc, clone, toast, GH, openGh, mediaPanelInit). */
const DETAIL_KINDS = new Set(Object.keys(GitHubSync.RECORD_FILES));
const OPT_KINDS = new Set(Object.keys(GitHubSync.OPT_FILES));
let DE = null, ICON_INDEX = null, AI_NAMES = null;

const catIcon = k => ({ pests: 'opt/category-pest.svg', diseases: 'opt/category-disease.svg', weeds: 'opt/category-weed.svg', crops: 'opt/crop-rice.svg' })[k] || 'opt/category-pest.svg';
function iconPath(v, k) {
  if (!v) return catIcon(k);
  const s = String(v);
  if (s.startsWith('custom/')) return s;
  if (/^crop-/.test(s)) return 'crops/' + s;
  if (/^category-/.test(s)) return 'categories/' + s;
  return 'opt/' + s;
}
const iconUrl = (v, k) => 'assets/icons/' + iconPath(v, k);
function recordIconHtml(k, r) { return `<img class="ce-inline-icon" src="${esc(iconUrl(r && r.icon, k))}" alt="" onerror="this.onerror=null;this.src='assets/icons/${catIcon(k)}'">`; }
async function loadIconIndex() {
  if (ICON_INDEX) return ICON_INDEX;
  try { const r = await fetch('assets/icons/index.json', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); ICON_INDEX = (await r.json()).icons || []; } catch (e) { ICON_INDEX = []; }
  return ICON_INDEX;
}

/* ---------- membuka editor ---------- */
function fieldHtml(key, label, type, v) {
  const val = Array.isArray(v) ? v.join('\n') : (v == null ? '' : v);
  const hint = type === 'lines' ? ' (satu item per baris)' : '';
  const ctl = type === 'text'
    ? `<input data-df="${key}" value="${esc(val)}" autocomplete="off" ${key === 'category' ? 'list="deCat"' : ''}>`
    : `<textarea data-df="${key}" rows="${type === 'lines' ? 4 : 3}">${esc(val)}</textarea>`;
  return `<div class="field ${type === 'text' ? '' : 'full'}"><label>${label}${hint}</label>${ctl}</div>`;
}
function openDetailEditor(k, id) {
  const rec = id ? (DB[k] || []).find(x => x.id === id) : null;
  if (id && !rec) { toast('Record tidak ditemukan.', 'err'); return; }
  editId = id || null;
  const r = rec ? clone(rec) : {}, isOpt = OPT_KINDS.has(k);
  DE = { k, id: id || null, rec: r, isOpt, busy: false,
    ai: isOpt && Array.isArray(r.active_ingredients) ? r.active_ingredients.map(a => ({ name: a.name || '', note: a.note || '' })) : [],
    prodAdd: new Set(), prodRemove: new Set(), iconValue: r.icon || '', iconChanged: false, upload: null, pick: false };
  $('formtitle').textContent = (id ? 'Edit ' : 'Tambah ') + META[k][0] + (id && r.name ? ' · ' + r.name : '');
  const cats = [...new Set((DB[k] || []).map(x => x.category).filter(Boolean))].sort();
  $('fields').innerHTML = `<datalist id="deCat">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="de-sec"><h4>Detail</h4><div class="de-grid">${GitHubSync.DETAIL_FIELDS[k].map(([key, l, t]) => fieldHtml(key, l, t, r[key])).join('')}</div></div>
    <div class="de-sec"><h4>Icon</h4><div id="deIcon"></div></div>
    ${isOpt ? `<div class="de-sec"><h4>Bahan aktif terkait</h4><p class="mp-hint">Tampil di PestiApps pada detail OPT sebagai referensi teknis. Ketik untuk melihat saran dari master bahan aktif, atau isi bebas.</p><div id="deAI"></div></div>
    <div class="de-sec"><h4>Produk yang bisa digunakan</h4><p class="mp-hint">Mengubah tautan <code>linked_opt_ids</code> pada produk di Database Pestisida.</p><div id="deLinked"></div><input id="deProdQ" class="de-search" placeholder="Cari produk: merk, bahan aktif, perusahaan, sasaran…" autocomplete="off"><div id="deProdRes"></div></div>` : ''}
    <div id="deStatus" class="de-status"></div>`;
  $('delete').style.display = 'none';
  const sb = document.querySelector('#form .modal-foot .btn.primary'); if (sb) { sb.textContent = 'Simpan ke GitHub'; sb.disabled = false; }
  renderIcon(); if (isOpt) { renderAI(); renderLinked(); renderProdResults(); }
  mediaPanelInit(k, r);
  $('dlg').showModal();
}

/* ---------- icon ---------- */
function renderIcon() {
  const v = DE.iconValue, src = DE.upload ? DE.upload.preview : iconUrl(v, DE.k);
  $('deIcon').innerHTML = `<div class="de-iconrow"><img class="de-iconprev" src="${esc(src)}" alt="" onerror="this.onerror=null;this.src='assets/icons/${catIcon(DE.k)}'">
    <div class="de-iconmeta"><code>${esc(DE.upload ? 'unggahan baru: ' + DE.upload.name : (v || '(icon bawaan kategori)'))}</code>
    <div class="mp-row"><button type="button" class="btn ghost sm" data-de="pick">${DE.pick ? 'Tutup daftar' : 'Pilih dari daftar'}</button>
    <label class="btn ghost sm mp-file">Unggah icon<input id="deIconFile" type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden></label>
    ${v || DE.upload ? '<button type="button" class="btn danger sm" data-de="iconclear">Hapus icon</button>' : ''}${DE.iconChanged ? '<button type="button" class="btn ghost sm" data-de="iconundo">Batalkan</button>' : ''}</div></div></div>
    ${DE.pick ? '<input id="deIconQ" class="de-search" placeholder="Cari icon…" autocomplete="off"><div id="deIconGrid" class="de-icongrid"></div>' : ''}`;
  if (DE.pick) fillIconGrid('');
}
async function fillIconGrid(q) {
  const list = await loadIconIndex(), grid = $('deIconGrid'); if (!grid) return;
  const rank = i => (DE.k === 'crops' ? (/^crop-/.test(i.name) ? 0 : 1) : (/^crop-/.test(i.name) ? 1 : 0));
  const rows = list.filter(i => !q || (i.name + ' ' + i.label).toLowerCase().includes(q.toLowerCase())).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  grid.innerHTML = rows.map(i => `<button type="button" class="de-icon ${i.value === DE.iconValue && !DE.upload ? 'sel' : ''}" data-de="icon" data-v="${esc(i.value)}" title="${esc(i.name)}"><img src="assets/icons/${esc(i.path)}" alt="" loading="lazy"><small>${esc(i.label)}</small></button>`).join('') || '<p class="mp-hint">Tidak ada icon yang cocok.</p>';
}
async function prepIcon(file) {
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = () => rej(new Error('Gagal membaca file.')); fr.readAsDataURL(blob); });
  if (file.type === 'image/svg+xml') {
    if (file.size > 200 * 1024) throw new Error('SVG maksimal 200 KB.');
    if (/<script|\son\w+\s*=|javascript:/i.test(await file.text())) throw new Error('SVG berisi script atau event handler; tidak diizinkan.');
    return { base64: await b64(file), ext: 'svg', preview: URL.createObjectURL(file), name: file.name };
  }
  if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) throw new Error('Format icon: SVG, PNG, WebP, atau JPG.');
  const bmp = await createImageBitmap(file), s = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * s)); cv.height = Math.max(1, Math.round(bmp.height * s));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); if (bmp.close) bmp.close();
  let blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.9)), ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await new Promise(r => cv.toBlob(r, 'image/png')); ext = 'png'; }
  return { base64: await b64(blob), ext, preview: URL.createObjectURL(blob), name: file.name };
}

/* ---------- bahan aktif ---------- */
function aiNameOptions() {
  if (AI_NAMES) return AI_NAMES;
  const strip = s => String(s || '').replace(/\s+\d[\d.,]*\s*(%|g\/?l|g\/?kg|gr\/?l|ml\/?l|w\/v|w\/w)\b.*$/i, '').trim();
  const set = new Set((DB.activeIngredients || []).map(a => strip(a.active_ingredient_match)).filter(Boolean));
  ['pests', 'diseases', 'weeds'].forEach(k => (DB[k] || []).forEach(r => (r.active_ingredients || []).forEach(a => a && a.name && set.add(a.name))));
  return (AI_NAMES = [...set].sort((a, b) => a.localeCompare(b)));
}
function renderAI() {
  $('deAI').innerHTML = DE.ai.map((a, i) => `<div class="de-ai"><input data-ai="${i}" data-f="name" list="aiNames" value="${esc(a.name)}" placeholder="Nama bahan aktif (mis. Emamektin benzoat)" autocomplete="off"><input data-ai="${i}" data-f="note" value="${esc(a.note)}" placeholder="Catatan (opsional): sasaran, fase, kelompok MoA…" autocomplete="off"><button type="button" class="btn danger sm" data-de="aidel" data-i="${i}">×</button></div>`).join('')
    + '<button type="button" class="btn ghost sm" data-de="aiadd">+ Tambah bahan aktif</button>'
    + `<datalist id="aiNames">${aiNameOptions().map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
}

/* ---------- produk ---------- */
const prodById = id => (DB.pesticides || []).find(p => p.id === id);
function linkedIds() {
  const set = new Set(DE.id ? (DB.pesticides || []).filter(p => (p.linked_opt_ids || []).includes(DE.id)).map(p => p.id) : []);
  DE.prodAdd.forEach(i => set.add(i)); DE.prodRemove.forEach(i => set.delete(i)); return set;
}
const prodLine = p => `<div><b>${esc(p.brand_name || p.id)}</b> <small>${esc([p.product_category, p.company].filter(Boolean).join(' · '))}</small><br><small class="muted">${esc(String(p.active_ingredients_raw || '—').slice(0, 110))}</small></div>`;
function renderLinked() {
  const ids = [...linkedIds()], removed = [...DE.prodRemove];
  $('deLinked').innerHTML = (ids.map(id => { const p = prodById(id); return p ? `<div class="de-prod">${prodLine(p)}${DE.prodAdd.has(id) ? '<span class="mp-tag warn">baru</span>' : ''}<button type="button" class="btn danger sm" data-de="prodrm" data-id="${esc(id)}">Lepas</button></div>` : ''; }).join('')
    + removed.map(id => { const p = prodById(id); return p ? `<div class="de-prod rm">${prodLine(p)}<span class="mp-tag warn">akan dilepas</span><button type="button" class="btn ghost sm" data-de="produndo" data-id="${esc(id)}">Batalkan</button></div>` : ''; }).join(''))
    || '<p class="mp-hint">Belum ada produk yang ditautkan.</p>';
}
function renderProdResults() {
  const q = ($('deProdQ') ? $('deProdQ').value : '').trim().toLowerCase(), el = $('deProdRes'); if (!el) return;
  if (q.length < 2) { el.innerHTML = '<p class="mp-hint">Ketik minimal 2 huruf untuk mencari.</p>'; return; }
  const linked = linkedIds(), toks = q.split(/\s+/);
  const rows = (DB.pesticides || []).filter(p => !linked.has(p.id) && toks.every(t => [p.brand_name, p.company, p.active_ingredients_raw, p.product_category, p.targets_raw].join(' ').toLowerCase().includes(t)));
  el.innerHTML = rows.slice(0, 20).map(p => `<div class="de-prod">${prodLine(p)}<button type="button" class="btn ghost sm" data-de="prodadd" data-id="${esc(p.id)}">+ Tambah</button></div>`).join('') + (rows.length > 20 ? `<p class="mp-hint">${rows.length - 20} hasil lain tidak ditampilkan; persempit pencarian.</p>` : '') || '<p class="mp-hint">Tidak ada produk yang cocok.</p>';
}

/* ---------- event ---------- */
const fieldsEl = $('fields');
fieldsEl.addEventListener('click', async e => {
  const b = e.target.closest('[data-de]'); if (!b || !DE || DE.busy) return;
  const a = b.dataset.de;
  if (a === 'pick') { DE.pick = !DE.pick; renderIcon(); }
  else if (a === 'icon') { DE.iconValue = b.dataset.v; DE.upload = null; DE.iconChanged = true; DE.pick = false; renderIcon(); }
  else if (a === 'iconclear') { DE.iconValue = ''; DE.upload = null; DE.iconChanged = true; renderIcon(); }
  else if (a === 'iconundo') { DE.iconValue = DE.rec.icon || ''; DE.upload = null; DE.iconChanged = false; renderIcon(); }
  else if (a === 'aiadd') { DE.ai.push({ name: '', note: '' }); renderAI(); const ins = document.querySelectorAll('#deAI input[data-f=name]'); if (ins.length) ins[ins.length - 1].focus(); }
  else if (a === 'aidel') { DE.ai.splice(+b.dataset.i, 1); renderAI(); }
  else if (a === 'prodadd') { const id = b.dataset.id; if (DE.prodRemove.has(id)) DE.prodRemove.delete(id); else DE.prodAdd.add(id); renderLinked(); renderProdResults(); }
  else if (a === 'prodrm') { const id = b.dataset.id; if (DE.prodAdd.has(id)) DE.prodAdd.delete(id); else DE.prodRemove.add(id); renderLinked(); renderProdResults(); }
  else if (a === 'produndo') { DE.prodRemove.delete(b.dataset.id); renderLinked(); renderProdResults(); }
});
fieldsEl.addEventListener('input', e => {
  const t = e.target; if (!DE) return;
  if (t.dataset.ai !== undefined) DE.ai[+t.dataset.ai][t.dataset.f] = t.value;
  else if (t.id === 'deProdQ') renderProdResults();
  else if (t.id === 'deIconQ') fillIconGrid(t.value);
});
fieldsEl.addEventListener('change', async e => {
  if (!DE || e.target.id !== 'deIconFile') return;
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { DE.upload = await prepIcon(f); DE.iconChanged = true; DE.pick = false; renderIcon(); } catch (err) { toast(err.message, 'err'); }
});
fieldsEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });

/* ---------- simpan ---------- */
function setDEStatus(msg, isErr) { const el = $('deStatus'); if (el) { el.textContent = msg || ''; el.className = 'de-status' + (isErr ? ' err' : ''); } }
async function publishDetail() {
  if (!DE || DE.busy) return;
  const cfg = GH.load();
  if (!cfg.token) { openGh('Isi token GitHub dulu, lalu klik Simpan.'); return; }
  const st = DE, schema = GitHubSync.DETAIL_FIELDS[st.k], fields = {}, parts = [];
  document.querySelectorAll('#fields [data-df]').forEach(el => {
    const [, , type] = schema.find(f => f[0] === el.dataset.df);
    const now = GitHubSync.normalizeField(type, el.value), was = GitHubSync.normalizeField(type, st.rec[el.dataset.df]);
    if (st.id ? JSON.stringify(now) !== JSON.stringify(was) : (Array.isArray(now) ? now.length : now !== '')) fields[el.dataset.df] = el.value;
  });
  if (Object.keys(fields).length) parts.push('detail');
  const payload = { datasetKey: st.k, recordId: st.id, fields };
  if (!st.id) { const nm = (document.querySelector('#fields [data-df=name]') || {}).value; if (!String(nm || '').trim()) { setDEStatus('Nama wajib diisi.', true); return; } fields.name = nm; }
  if (st.isOpt) {
    const was = GitHubSync.normalizeAI(Array.isArray(st.rec.active_ingredients) ? st.rec.active_ingredients : []), now = GitHubSync.normalizeAI(st.ai);
    if (JSON.stringify(was) !== JSON.stringify(now)) { payload.activeIngredients = st.ai; parts.push('bahan aktif'); }
    const add = [...st.prodAdd], remove = [...st.prodRemove];
    if (add.length || remove.length) { payload.products = { add, remove }; parts.push(`${add.length + remove.length} tautan produk`); }
  }
  if (st.iconChanged) { payload.icon = st.upload ? { upload: { base64: st.upload.base64, ext: st.upload.ext } } : { value: st.iconValue }; parts.push('icon'); }
  if (!parts.length && st.id) { setDEStatus('Tidak ada perubahan untuk disimpan.', true); return; }
  const nm = (fields.name || st.rec.name || st.id || 'record baru');
  payload.message = `data(${st.k}): ${nm}${parts.length ? ' — ' + parts.join(', ') : ''}`;
  payload.onProgress = s => setDEStatus(s);
  st.busy = true; const sb = document.querySelector('#form .modal-foot .btn.primary'); if (sb) { sb.disabled = true; sb.textContent = 'Menyimpan…'; }
  setDEStatus('Menyiapkan…');
  try { onDetailPublished(st, await GitHubSync.publishRecordEdit(new GitHubSync.Client(cfg), payload)); }
  catch (err) { setDEStatus(err.message, true); toast(err.message, 'err'); }
  st.busy = false; if (sb) { sb.disabled = false; sb.textContent = 'Simpan ke GitHub'; }
}
function onDetailPublished(st, res) {
  const k = st.k;
  REPO[k] = res.records;
  if (DIRTY.has(k)) DB[k] = DB[k].some(x => x.id === res.record.id) ? DB[k].map(x => (x.id === res.record.id ? res.record : x)) : [...DB[k], res.record];
  else DB[k] = clone(res.records);
  if (res.productRecords) {
    REPO.pesticides = res.productRecords;
    if (DIRTY.has('pesticides')) { const m = new Map(res.productRecords.map(p => [p.id, p.linked_opt_ids])); DB.pesticides = DB.pesticides.map(p => (m.has(p.id) ? { ...p, linked_opt_ids: m.get(p.id) } : p)); }
    else DB.pesticides = clone(res.productRecords);
  }
  if (res.iconPath && ICON_INDEX) { const n = res.iconPath.split('/').pop(); ICON_INDEX.push({ value: 'custom/' + n, path: 'custom/' + n, name: n, dir: 'custom', label: res.record.name || res.record.id }); }
  AI_NAMES = null; saveDraft(); $('dlg').close(); renderNav(); render();
  toast(`${res.created ? 'Record baru' : 'Perubahan'} tersimpan ke GitHub · commit ${res.commit.sha.slice(0, 7)} <a href="${res.commit.url}" target="_blank" rel="noopener">lihat</a>. PestiApps memuatnya setelah cache GitHub (± 5 menit); GitHub Pages Data Manager ± 1 menit.`, 'ok', true);
}
