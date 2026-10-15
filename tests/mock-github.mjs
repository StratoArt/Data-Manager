// GitHub Git Data API tiruan (in-memory) untuk menguji src/github-sync.js tanpa jaringan.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class MockGitHub {
  constructor(rootDir, { owner = 'StratoArt', repo = 'Data-Manager', branch = 'main', token = 'ghp_test' } = {}) {
    Object.assign(this, { owner, repo, branch, token });
    const files = new Map();
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['node_modules', '.git', 'tests'].includes(e.name)) walk(p); }
      else files.set(path.relative(rootDir, p).split(path.sep).join('/'), fs.readFileSync(p));
    });
    walk(rootDir);
    this.snapshots = new Map([['t0', files]]);
    this.commits = new Map([['c0', { tree: 't0', parents: [], message: 'init' }]]);
    this.blobs = new Map();
    this.head = 'c0';
    this.n = 0;
    this.raceOnce = false;
    this.calls = [];
  }
  get files() { return this.snapshots.get(this.commits.get(this.head).tree); }
  foreignCommit(file, text) {            // simulasi orang lain push di tengah jalan
    const snap = new Map(this.files); snap.set(file, Buffer.from(text));
    const t = 't' + (++this.n); this.snapshots.set(t, snap);
    const c = 'c' + (++this.n); this.commits.set(c, { tree: t, parents: [this.head], message: 'foreign' });
    this.head = c;
  }
  fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const auth = (init.headers || {}).Authorization;
    this.calls.push(`${method} ${u.pathname}`);
    const r = this.handle(method, decodeURIComponent(u.pathname), u.searchParams, body, init.headers || {}, auth);
    return { ok: r.status < 300, status: r.status, json: async () => r.json, text: async () => r.text };
  };
  handle(method, p, qs, body, headers, auth) {
    const base = `/repos/${this.owner}/${this.repo}`;
    const J = (status, json) => ({ status, json });
    if (method !== 'GET' && auth !== `Bearer ${this.token}`) return J(auth ? 401 : 401, { message: 'Bad credentials' });
    if (auth && auth !== `Bearer ${this.token}`) return J(401, { message: 'Bad credentials' });
    if (p === '/user') return J(200, { login: 'tester' });
    if (!p.startsWith(base)) return J(404, { message: 'Not Found' });
    const rest = p.slice(base.length);
    if (rest === '') return J(200, { full_name: `${this.owner}/${this.repo}`, private: false, permissions: { push: true } });
    if (rest === `/git/ref/heads/${this.branch}` && method === 'GET') return J(200, { object: { sha: this.head } });
    let m;
    if ((m = rest.match(/^\/git\/commits\/(.+)$/)) && method === 'GET') {
      const c = this.commits.get(m[1]); return c ? J(200, { tree: { sha: c.tree } }) : J(404, { message: 'Not Found' });
    }
    if ((m = rest.match(/^\/contents\/(.+)$/)) && method === 'GET') {
      const c = this.commits.get(qs.get('ref')) || this.commits.get(this.head);
      const snap = this.snapshots.get(c.tree); const key = m[1];
      if (snap.has(key)) {
        const buf = snap.get(key);
        return headers.Accept && /raw/.test(headers.Accept) ? { status: 200, text: buf.toString('utf8') } : J(200, { content: buf.toString('base64') });
      }
      const rows = new Map();
      for (const f of snap.keys()) if (f.startsWith(key + '/')) {
        const seg = f.slice(key.length + 1).split('/')[0]; const isDir = f.slice(key.length + 1).includes('/');
        rows.set(seg, { name: seg, type: isDir ? 'dir' : 'file', path: `${key}/${seg}` });
      }
      return rows.size ? J(200, [...rows.values()]) : J(404, { message: 'Not Found' });
    }
    if (rest === '/git/blobs' && method === 'POST') {
      const buf = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content, 'utf8');
      const sha = crypto.createHash('sha1').update(buf).digest('hex'); this.blobs.set(sha, buf); return J(201, { sha });
    }
    if (rest === '/git/trees' && method === 'POST') {
      const snap = new Map(this.snapshots.get(body.base_tree));
      for (const e of body.tree) { if (e.sha === null) snap.delete(e.path); else snap.set(e.path, this.blobs.get(e.sha)); }
      const t = 't' + (++this.n); this.snapshots.set(t, snap); return J(201, { sha: t });
    }
    if (rest === '/git/commits' && method === 'POST') {
      const c = 'c' + (++this.n); this.commits.set(c, { tree: body.tree, parents: body.parents, message: body.message }); return J(201, { sha: c });
    }
    if (rest === `/git/refs/heads/${this.branch}` && method === 'PATCH') {
      if (this.raceOnce) { this.raceOnce = false; this.foreignCommit('README.md', 'diubah orang lain\n'); }
      const c = this.commits.get(body.sha);
      if (!body.force && c.parents[0] !== this.head) return J(422, { message: 'Update is not a fast forward' });
      this.head = body.sha; return J(200, { object: { sha: body.sha } });
    }
    return J(404, { message: 'Not Found' });
  }
}
