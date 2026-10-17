/*
 * Crop Expert Data Center — GitHub sync
 * Commit foto OPT + metadata JSON ke repo dalam SATU commit (Git Data API).
 * Modul ini sengaja bebas DOM supaya bisa diuji di Node (lihat tests/).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GitHubSync = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = { owner: 'StratoArt', repo: 'Data-Manager', branch: 'main' };
  const OPT_FILES = { pests: 'data/opt/hama.json', diseases: 'data/opt/penyakit.json', weeds: 'data/opt/gulma.json' };
  const MEDIA_DIRS = { photos: 'assets/opt-media/photos', reference: 'assets/opt-media/reference' };
  const REFERENCE_TYPES = new Set(['lifecycle', 'species_reference']);
  const LEGACY = [
    [/^assets\/opt\/photos\//, 'assets/opt-media/photos/'],
    [/^assets\/opt\/reference\//, 'assets/opt-media/reference/']
  ];

  const normalizePath = p => LEGACY.reduce((v, [re, to]) => v.replace(re, to), String(p || '').trim());
  const imageKey = img => String((img && (img.local_path || img.remote_url || img.url)) || '');
  const slugify = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const defaultDirFor = type => (REFERENCE_TYPES.has(type) ? 'reference' : 'photos');
  const encPath = p => String(p).split('/').map(encodeURIComponent).join('/');

  /* ---------- serialisasi JSON yang menjaga format asli file ---------- */
  function detectFormat(text) {
    const m = /^[\[{]\r?\n([ \t]+)/.exec(text);
    return { indent: m ? m[1] : '  ', trailingNewline: /\n$/.test(text), ascii: /\\u[0-9a-fA-F]{4}/.test(text) };
  }
  function serializeLike(original, data) {
    const f = detectFormat(original);
    let out = JSON.stringify(data, null, f.indent);
    if (f.ascii) out = out.replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    return out + (f.trailingNewline ? '\n' : '');
  }

  /* ---------- penamaan file ---------- */
  function pickFilename(recordId, meta, ext, taken) {
    const base = [slugify(recordId), slugify(meta.stage || meta.image_type || 'foto')].filter(Boolean).join('-');
    const e = String(ext || 'webp').toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg');
    let name = `${base}.${e}`, n = 1;
    while (taken.has(name.toLowerCase())) { n++; name = `${base}-${String(n).padStart(2, '0')}.${e}`; }
    taken.add(name.toLowerCase());
    return name;
  }

  /* ---------- entri gambar (urutan key mengikuti data yang sudah ada) ---------- */
  function buildEntry(meta, localPath, prev) {
    const e = {};
    e.image_type = meta.image_type || (prev && prev.image_type) || 'organism';
    if (meta.stage) e.stage = meta.stage;
    e.local_path = localPath;
    e.remote_url = '';
    e.source_url = meta.source_url || '';
    if (meta.source_name) e.source_name = meta.source_name;
    if (meta.license) e.license = meta.license;
    if (meta.author) e.author = meta.author;
    e.attribution = meta.attribution || '';
    e.notes = meta.notes || '';
    return e;
  }

  /* ---------- mutasi record (murni, mudah diuji) ----------
   * ops: {op:'add'|'attach', entry} | {op:'replace', match, entry} | {op:'remove', match}
   */
  function applyOps(records, recordId, ops) {
    const idx = records.findIndex(r => r && r.id === recordId);
    if (idx < 0) throw new Error(`Record "${recordId}" belum ada di repo. Commit record-nya dulu sebelum menambah foto.`);
    const images = Array.isArray(records[idx].images) ? records[idx].images.slice() : [];
    const removed = [];
    for (const o of ops) {
      if (o.op === 'add' || o.op === 'attach') { images.push(o.entry); continue; }
      const want = normalizePath(o.match);
      const at = images.findIndex(i => normalizePath(imageKey(i)) === want);
      if (at < 0) throw new Error(`Foto "${o.match}" sudah tidak ada di repo (mungkin diubah dari perangkat lain). Muat ulang halaman.`);
      if (images[at].local_path) removed.push({ path: normalizePath(images[at].local_path), deleteFile: o.op === 'replace' || !!o.deleteFile });
      if (o.op === 'replace') images[at] = o.entry; else images.splice(at, 1);
    }
    const next = records.slice();
    next[idx] = Object.assign({}, records[idx], { images });
    return { records: next, removed };
  }

  /* ---------- klien GitHub ---------- */
  class GitHubError extends Error {
    constructor(message, status) { super(message); this.name = 'GitHubError'; this.status = status; }
  }

  class Client {
    constructor(cfg) {
      this.owner = (cfg.owner || DEFAULTS.owner).trim();
      this.repo = (cfg.repo || DEFAULTS.repo).trim();
      this.branch = (cfg.branch || DEFAULTS.branch).trim();
      this.token = (cfg.token || '').trim();
      this.fetch = cfg.fetchImpl || ((...a) => fetch(...a));
      this.base = cfg.apiBase || 'https://api.github.com';
    }
    get repoPath() { return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`; }

    async req(method, path, body, accept) {
      const headers = {
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      let res;
      try {
        res = await this.fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (e) {
        throw new GitHubError('Tidak bisa menghubungi api.github.com (cek koneksi internet).', 0);
      }
      if (res.ok) return accept ? res.text() : (res.status === 204 ? null : res.json());
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* abaikan */ }
      throw new GitHubError(explain(res.status, detail, this), res.status);
    }

    async verify() {
      const info = await this.req('GET', this.repoPath);
      await this.req('GET', `${this.repoPath}/git/ref/heads/${encPath(this.branch)}`);
      let login = '';
      try { login = (await this.req('GET', '/user')).login || ''; } catch (e) { /* token fine-grained boleh tanpa /user */ }
      const canPush = info.permissions ? !!(info.permissions.push || info.permissions.admin) : null;
      return { private: !!info.private, login, canPush, fullName: info.full_name || `${this.owner}/${this.repo}` };
    }

    async head() {
      const ref = await this.req('GET', `${this.repoPath}/git/ref/heads/${encPath(this.branch)}`);
      const sha = ref.object.sha;
      const commit = await this.req('GET', `${this.repoPath}/git/commits/${sha}`);
      return { sha, tree: commit.tree.sha };
    }
    readText(path, ref) {
      return this.req('GET', `${this.repoPath}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`, undefined, 'application/vnd.github.raw+json');
    }
    async listDir(dir, ref) {
      try {
        const rows = await this.req('GET', `${this.repoPath}/contents/${encPath(dir)}?ref=${encodeURIComponent(ref || this.branch)}`);
        return Array.isArray(rows) ? rows.map(r => ({ name: r.name, type: r.type, path: r.path })) : [];
      } catch (e) { if (e.status === 404) return []; throw e; }
    }

    /* files: [{path, base64} | {path, text} | {path, delete:true}] */
    async commit(files, message, parent, onProgress) {
      const say = onProgress || (() => {});
      const tree = [];
      let n = 0; const total = files.filter(f => !f.delete).length;
      for (const f of files) {
        if (f.delete) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
        say(`Mengunggah ${++n}/${total}: ${f.path.split('/').pop()}`);
        const blob = await this.req('POST', `${this.repoPath}/git/blobs`,
          f.base64 !== undefined ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      say('Membuat commit…');
      const t = await this.req('POST', `${this.repoPath}/git/trees`, { base_tree: parent.tree, tree });
      const c = await this.req('POST', `${this.repoPath}/git/commits`, { message, tree: t.sha, parents: [parent.sha] });
      await this.req('PATCH', `${this.repoPath}/git/refs/heads/${encPath(this.branch)}`, { sha: c.sha, force: false });
      return { sha: c.sha, url: `https://github.com/${this.owner}/${this.repo}/commit/${c.sha}` };
    }

    /* Bangun ulang dari head terbaru bila ada commit lain yang masuk di tengah jalan. */
    async publish(build, message, onProgress) {
      let lastErr;
      for (let attempt = 1; attempt <= 3; attempt++) {
        (onProgress || (() => {}))(attempt === 1 ? 'Membaca branch…' : `Ada commit baru di branch, mengulang (${attempt}/3)…`);
        const parent = await this.head();
        const built = await build(parent);
        try {
          const commit = await this.commit(built.files, message, parent, onProgress);
          return Object.assign({ commit }, built.result);
        } catch (e) {
          if (e instanceof GitHubError && e.status === 422 && /fast.?forward/i.test(e.message) && attempt < 3) { lastErr = e; continue; }
          throw e;
        }
      }
      throw lastErr;
    }
  }

  function explain(status, detail, c) {
    const d = detail ? ` (${detail})` : '';
    if (status === 401) return 'Token ditolak GitHub (salah, kedaluwarsa, atau dicabut).' + d;
    if (status === 403) return 'GitHub menolak: token tidak punya izin Contents: Read and write, kena rate limit, atau branch dilindungi.' + d;
    if (status === 404) return `Repo/branch tidak ditemukan atau token tidak punya akses ke ${c.owner}/${c.repo}@${c.branch}.` + d;
    if (status === 409) return 'Konflik di repo, coba lagi.' + d;
    if (status === 422) return 'Update ditolak GitHub' + (d || '.');
    return `GitHub error ${status}.` + d;
  }

  /*
   * Publish perubahan media satu record OPT dalam satu commit.
   * ops (input UI):
   *   {op:'add',     base64, ext, meta}              -> unggah file baru + entri baru
   *   {op:'attach',  path, meta}                     -> tautkan file yang SUDAH ada di repo
   *   {op:'replace', match, base64, ext, meta}       -> ganti file sebuah entri (nama file baru; file lama dihapus bila tak dipakai lagi)
   *   {op:'remove',  match, deleteFile}              -> hapus entri (+ file bila tak dipakai record lain)
   * meta: {image_type, stage, attribution, notes, source_url, dir}
   */
  async function publishOptMedia(client, { datasetKey, recordId, ops, message, onProgress }) {
    const jsonPath = OPT_FILES[datasetKey];
    if (!jsonPath) throw new Error('Dataset ini belum mendukung foto OPT.');
    if (!ops || !ops.length) throw new Error('Tidak ada perubahan untuk dipublish.');
    return client.publish(async parent => {
      const original = await client.readText(jsonPath, parent.sha);
      const records = JSON.parse(original);
      if (!Array.isArray(records)) throw new Error(`${jsonPath} bukan array record.`);

      const takenByDir = {};
      for (const dir of Object.keys(MEDIA_DIRS)) {
        takenByDir[dir] = new Set((await client.listDir(MEDIA_DIRS[dir], parent.sha)).filter(f => f.type === 'file').map(f => f.name.toLowerCase()));
      }
      const files = [];
      const engineOps = [];
      for (const o of ops) {
        if (o.op === 'add' || o.op === 'replace') {
          const dir = o.meta.dir === 'reference' || o.meta.dir === 'photos' ? o.meta.dir : defaultDirFor(o.meta.image_type);
          const name = pickFilename(recordId, o.meta, o.ext, takenByDir[dir]);
          const path = `${MEDIA_DIRS[dir]}/${name}`;
          files.push({ path, base64: o.base64 });
          engineOps.push({ op: o.op, match: o.match, entry: buildEntry(o.meta, path) });
        } else if (o.op === 'attach') {
          const p = normalizePath(o.path);
          if (!p.startsWith('assets/opt-media/')) throw new Error('File yang ditautkan harus ada di assets/opt-media/.');
          engineOps.push({ op: 'attach', entry: buildEntry(o.meta, p) });
        } else if (o.op === 'remove') {
          engineOps.push({ op: 'remove', match: o.match, deleteFile: !!o.deleteFile });
        } else throw new Error(`Operasi tidak dikenal: ${o.op}`);
      }

      const { records: next, removed } = applyOps(records, recordId, engineOps);
      files.push({ path: jsonPath, text: serializeLike(original, next) });

      // File lama hanya dihapus bila tidak dipakai entri lain di mana pun (3 dataset OPT).
      const wantDelete = new Set();
      const candidates = removed.filter(r => r.deleteFile).map(r => r.path);
      if (candidates.length) {
        const stillUsed = new Set();
        const all = { [datasetKey]: next };
        for (const [k, p] of Object.entries(OPT_FILES)) if (k !== datasetKey) all[k] = JSON.parse(await client.readText(p, parent.sha));
        Object.values(all).flat().forEach(r => (r.images || []).forEach(i => i.local_path && stillUsed.add(normalizePath(i.local_path))));
        candidates.forEach(p => { if (!stillUsed.has(p)) wantDelete.add(p); });
      }
      wantDelete.forEach(p => files.push({ path: p, delete: true }));

      return { files, result: { records: next, record: next.find(r => r.id === recordId), jsonPath, deleted: [...wantDelete], uploaded: files.filter(f => f.base64 !== undefined).map(f => f.path) } };
    }, message || `media: perbarui foto ${recordId}`, onProgress);
  }

  /* ======================= Editor detail record (v0.7) ======================= */
  const RECORD_FILES = Object.assign({}, OPT_FILES, { crops: 'data/master/crops.json' });
  const PRODUCT_FILE = 'data/products/pestisida.json';
  const PRODUCT_REL = 'data/relations/product_opt.json';
  const ICON_DIR = 'assets/icons';
  const ICON_CUSTOM_DIR = 'assets/icons/custom';
  const ICON_INDEX = 'assets/icons/index.json';
  const OPT_COMMON = [
    ['name', 'Nama ilmiah', 'text'], ['common', 'Nama umum', 'text'], ['category', 'Kategori', 'text'],
    ['description', 'Deskripsi', 'area'], ['hosts', 'Tanaman inang', 'lines'], ['symptoms', 'Gejala / ciri', 'lines'],
    ['diagnostic', 'Petunjuk identifikasi', 'area'], ['favorable_conditions', 'Kondisi yang mendukung', 'area'], ['notes', 'Catatan', 'area']
  ];
  const withAt = (arr, key, extra) => { const i = arr.findIndex(f => f[0] === key); return [...arr.slice(0, i + 1), ...extra, ...arr.slice(i + 1)]; };
  const DETAIL_FIELDS = {
    pests: withAt(withAt(OPT_COMMON, 'category', [['family', 'Famili', 'text']]), 'symptoms', [['life', 'Tahap perkembangan', 'lines']]),
    diseases: withAt(OPT_COMMON, 'category', [['classification', 'Klasifikasi', 'text'], ['classification_group', 'Golongan teknis', 'text']]),
    weeds: withAt(OPT_COMMON, 'category', [['classification', 'Klasifikasi', 'text'], ['classification_group', 'Golongan teknis', 'text']]),
    crops: [['name', 'Nama tanaman', 'text'], ['latin', 'Nama ilmiah', 'text']]
  };

  function parseDataset(text) {
    const d = JSON.parse(text);
    if (Array.isArray(d)) return { wrapper: null, records: d };
    if (d && Array.isArray(d.records)) return { wrapper: d, records: d.records };
    throw new Error('Format dataset tidak dikenali (bukan array atau {records}).');
  }
  const stringifyDataset = (orig, parsed, records) => serializeLike(orig, parsed.wrapper ? Object.assign({}, parsed.wrapper, { records }) : records);

  function normalizeField(type, v) {
    if (type === 'lines') return (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean);
    return String(v == null ? '' : v).trim();
  }
  function applyFields(rec, fields, kind) {
    for (const [key, , type] of DETAIL_FIELDS[kind] || []) {
      if (!fields || !(key in fields)) continue;
      const v = normalizeField(type, fields[key]);
      const empty = Array.isArray(v) ? !v.length : v === '';
      if (empty && !(key in rec)) continue;
      rec[key] = v;
    }
  }
  function normalizeAI(list) {
    const seen = new Set(), out = [];
    for (const a of list || []) {
      const name = String((a && a.name) || '').trim(); if (!name) continue;
      const k = name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      const e = { name }; const note = String(a.note || '').trim(); if (note) e.note = note;
      e.status = 'manual'; out.push(e);
    }
    return out;
  }
  function pickIconName(recordId, ext, taken) {
    const base = `${slugify(recordId) || 'icon'}-icon`;
    const e = String(ext || 'webp').toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg');
    let name = `${base}.${e}`, n = 1;
    while (taken.has(name.toLowerCase())) { n++; name = `${base}-${String(n).padStart(2, '0')}.${e}`; }
    taken.add(name.toLowerCase()); return name;
  }
  const ICON_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-]*(\/[A-Za-z0-9][A-Za-z0-9._\-]*)?$/;

  /*
   * Ubah detail satu record (atau buat baru bila recordId kosong) dalam SATU commit:
   *   fields           {key: nilai}          field teks/daftar sesuai DETAIL_FIELDS
   *   activeIngredients [{name, note}]       hanya OPT; menggantikan seluruh daftar
   *   icon             {value} | {upload:{base64, ext}} | {value:''} (hapus)
   *   products         {add:[id], remove:[id]}  hanya OPT; mengubah linked_opt_ids produk + relations/product_opt.json
   */
  async function publishRecordEdit(client, { datasetKey, recordId, fields, activeIngredients, icon, products, message, onProgress }) {
    const path = RECORD_FILES[datasetKey];
    if (!path) throw new Error('Dataset ini belum mendukung editor detail.');
    const isOpt = !!OPT_FILES[datasetKey];
    return client.publish(async parent => {
      const text = await client.readText(path, parent.sha);
      const ds = parseDataset(text), records = ds.records.slice(), files = [];
      const idx = recordId ? records.findIndex(r => r && r.id === recordId) : -1;
      if (recordId && idx < 0) throw new Error(`Record "${recordId}" tidak ditemukan di repo. Muat ulang halaman.`);
      let rec;
      if (idx >= 0) rec = Object.assign({}, records[idx]);
      else {
        const nm = String((fields && fields.name) || '').trim();
        if (!nm) throw new Error('Nama wajib diisi.');
        const ids = new Set(records.map(r => r && r.id)), base = slugify(nm) || 'item'; let id = base, n = 1;
        while (ids.has(id)) id = `${base}-${++n}`;
        rec = { id };
      }
      applyFields(rec, fields, datasetKey);
      if (idx < 0 && !String(rec.name || '').trim()) throw new Error('Nama wajib diisi.');
      if (idx < 0) { if (isOpt) rec.images = []; rec.provenance = { source: 'Data Manager manual entry', created_at: new Date().toISOString() }; }

      if (isOpt && Array.isArray(activeIngredients)) {
        const ai = normalizeAI(activeIngredients);
        if (ai.length || 'active_ingredients' in rec) rec.active_ingredients = ai;
      }

      let iconPath = null;
      if (icon && icon.upload) {
        const taken = new Set((await client.listDir(ICON_CUSTOM_DIR, parent.sha)).filter(f => f.type === 'file').map(f => f.name.toLowerCase()));
        const name = pickIconName(rec.id, icon.upload.ext, taken);
        iconPath = `${ICON_CUSTOM_DIR}/${name}`;
        files.push({ path: iconPath, base64: icon.upload.base64 });
        rec.icon = `custom/${name}`;
        let itxt = null;
        try { itxt = await client.readText(ICON_INDEX, parent.sha); } catch (e) { if (e.status !== 404) throw e; }
        const idxObj = itxt ? JSON.parse(itxt) : { version: 1, icons: [] };
        idxObj.icons = (idxObj.icons || []).concat([{ value: `custom/${name}`, path: `custom/${name}`, name, dir: 'custom', label: rec.name || rec.id }]);
        files.push({ path: ICON_INDEX, text: itxt ? serializeLike(itxt, idxObj) : JSON.stringify(idxObj, null, 2) });
      } else if (icon && 'value' in icon) {
        const v = String(icon.value || '').trim();
        if (v && (!ICON_VALUE_RE.test(v) || v.includes('..'))) throw new Error('Nama icon tidak valid.');
        rec.icon = v || null;
      }

      let productRecords = null, relRecords = null;
      const add = (products && products.add) || [], remove = (products && products.remove) || [];
      if (isOpt && (add.length || remove.length)) {
        const ptxt = await client.readText(PRODUCT_FILE, parent.sha), pds = parseDataset(ptxt), prods = pds.records.slice();
        const rtxt = await client.readText(PRODUCT_REL, parent.sha), rds = parseDataset(rtxt); let rels = rds.records.slice();
        const byId = new Map(prods.map((p, i) => [p && p.id, i]));
        let pChanged = false, rChanged = false;
        for (const pid of add) {
          const i = byId.get(pid); if (i === undefined) throw new Error(`Produk "${pid}" tidak ada di repo.`);
          const ids = Array.isArray(prods[i].linked_opt_ids) ? prods[i].linked_opt_ids : [];
          if (!ids.includes(rec.id)) { prods[i] = Object.assign({}, prods[i], { linked_opt_ids: [...ids, rec.id] }); pChanged = true; }
          if (!rels.some(r => r.product_id === pid && r.opt_id === rec.id)) { rels.push({ product_id: pid, opt_id: rec.id }); rChanged = true; }
        }
        for (const pid of remove) {
          const i = byId.get(pid);
          if (i !== undefined && Array.isArray(prods[i].linked_opt_ids) && prods[i].linked_opt_ids.includes(rec.id)) {
            prods[i] = Object.assign({}, prods[i], { linked_opt_ids: prods[i].linked_opt_ids.filter(x => x !== rec.id) }); pChanged = true;
          }
          const before = rels.length; rels = rels.filter(r => !(r.product_id === pid && r.opt_id === rec.id)); if (rels.length !== before) rChanged = true;
        }
        if (pChanged) { files.push({ path: PRODUCT_FILE, text: stringifyDataset(ptxt, pds, prods) }); productRecords = prods; }
        if (rChanged) {
          if (rds.wrapper) rds.wrapper = Object.assign({}, rds.wrapper, { record_count: rels.length });
          files.push({ path: PRODUCT_REL, text: stringifyDataset(rtxt, rds, rels) }); relRecords = rels;
        }
      }

      const next = records.slice(); if (idx >= 0) next[idx] = rec; else next.push(rec);
      files.unshift({ path, text: stringifyDataset(text, ds, next) });
      return { files, result: { records: next, record: rec, created: idx < 0, jsonPath: path, iconPath, productRecords, relRecords } };
    }, message || `data(${datasetKey}): ${recordId || 'record baru'}`, onProgress);
  }

  /* Daftar semua file media di repo (untuk fitur "tautkan file yang sudah ada"). */
  async function listMediaFiles(client, ref) {
    const out = [];
    for (const dir of Object.values(MEDIA_DIRS)) {
      const rows = await client.listDir(dir, ref || client.branch);
      for (const r of rows) {
        if (r.type === 'file') out.push(r.path);
        else if (r.type === 'dir') (await client.listDir(r.path, ref || client.branch)).forEach(x => x.type === 'file' && out.push(x.path));
      }
    }
    return out.sort();
  }

  /* Hash ringan untuk mendeteksi bahwa data repo berubah sejak draft dibuat. */
  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  return {
    DEFAULTS, OPT_FILES, MEDIA_DIRS, Client, GitHubError,
    RECORD_FILES, DETAIL_FIELDS, PRODUCT_FILE, PRODUCT_REL, ICON_DIR, ICON_INDEX, publishRecordEdit, parseDataset, normalizeAI, normalizeField,
    normalizePath, imageKey, slugify, defaultDirFor, detectFormat, serializeLike,
    pickFilename, buildEntry, applyOps, publishOptMedia, listMediaFiles, hashString
  };
});
