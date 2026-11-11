'use strict';
// Wrapper de busca no GitHub para descobrir extensões do Claude Code.
// Backend preferido: `gh` CLI autenticado (limites maiores e busca de CÓDIGO, que exige login).
// Reserva: API REST pública sem token (10 buscas/min, só repositórios).
// Segurança: execFile sem shell, consulta do usuário sanitizada, nenhum token lido ou guardado pelo app.
const { execFile } = require('child_process');

const API = 'https://api.github.com';
let ghState = null; // cache: { ok, user } — `gh auth status` só uma vez por execução

function gh(args, timeout = 20000) {
  return new Promise((resolve) => {
    execFile('gh', args, { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } },
      (err, out, se) => resolve({ ok: !err, out: String(out || ''), err: String(se || (err && err.message) || ''), enoent: err && err.code === 'ENOENT' }));
  });
}

async function backend() {
  if (ghState) return ghState;
  const r = await gh(['auth', 'status', '--hostname', 'github.com'], 10000);
  if (r.enoent) ghState = { ok: false, reason: 'gh não instalado' };
  else if (!r.ok) ghState = { ok: false, reason: 'gh sem login (rode: gh auth login)' };
  else { const m = /account\s+(\S+)/i.exec(r.out + r.err); ghState = { ok: true, user: m ? m[1] : null }; }
  return ghState;
}

// GET via gh (autenticado) ou fetch público
async function get(pathAndQuery) {
  const b = await backend();
  if (b.ok) {
    const r = await gh(['api', '-X', 'GET', '-H', 'Accept: application/vnd.github+json', pathAndQuery, '--include']);
    if (!r.ok) throw new Error('GitHub (gh): ' + (r.err || r.out).split('\n').find(Boolean));
    const sep = r.out.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
    const i = r.out.indexOf(sep);
    const head = r.out.slice(0, i), body = r.out.slice(i + sep.length);
    const h = (k) => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'im').exec(head); return m ? m[1].trim() : null; };
    return { json: JSON.parse(body), limit: { remaining: Number(h('x-ratelimit-remaining')), limit: Number(h('x-ratelimit-limit')), reset: Number(h('x-ratelimit-reset')) * 1000 || null }, via: 'gh' };
  }
  const res = await fetch(API + '/' + pathAndQuery.replace(/^\//, ''), { headers: { accept: 'application/vnd.github+json', 'user-agent': 'claude-ledger' }, signal: AbortSignal.timeout(15000) });
  const limit = { remaining: Number(res.headers.get('x-ratelimit-remaining')), limit: Number(res.headers.get('x-ratelimit-limit')), reset: Number(res.headers.get('x-ratelimit-reset')) * 1000 || null };
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error('Limite da API pública atingido. Instale e autentique o gh CLI para buscar sem esse limite.'), { limit });
  if (res.status === 401) throw new Error('Esta busca exige login no GitHub (gh auth login).');
  if (!res.ok) throw new Error('GitHub respondeu ' + res.status);
  return { json: await res.json(), limit, via: 'api pública' };
}

// remove qualificadores que o usuário poderia injetar (repo:, user:, org: etc. são permitidos só pelo app)
const clean = (q) => String(q || '').replace(/[^\p{L}\p{N}\s._\-/+#]/gu, ' ').replace(/\b\w+:/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

const MODES = {
  marketplace: { label: 'Marketplaces instaláveis', needsAuth: true },
  plugin: { label: 'Plugins', topic: 'claude-code-plugin' },
  skill: { label: 'Skills', topic: 'claude-skills' },
  mcp: { label: 'MCP servers', topic: 'mcp-server' },
};

const repo = (r) => ({
  full_name: r.full_name, url: r.html_url, description: r.description || '', stars: r.stargazers_count ?? null,
  forks: r.forks_count ?? null, updated_at: r.pushed_at || r.updated_at || null, topics: r.topics || [],
  license: r.license && (r.license.spdx_id || r.license.name) || null, archived: !!r.archived, fork: !!r.fork, owner_avatar: null,
});

async function search({ q = '', mode = 'plugin', sort = 'stars', page = 1 } = {}) {
  const m = MODES[mode] || MODES.plugin;
  const b = await backend();
  const term = clean(q);
  const per = 20;
  page = Math.max(1, Math.min(10, Number(page) || 1));
  if (mode === 'marketplace') {
    if (!b.ok) return { mode, items: [], total: 0, needsAuth: true, backend: b, message: 'A busca por marketplace.json usa a busca de código do GitHub, que exige o gh CLI autenticado (' + b.reason + ').' };
    const query = ['filename:marketplace.json', 'path:.claude-plugin', term].filter(Boolean).join(' ');
    const r = await get(`search/code?q=${encodeURIComponent(query)}&per_page=50&page=${page}`);
    // vários arquivos por repo → um item por repo; depois enriquece com estrelas/descrição
    const seen = new Map();
    for (const it of r.json.items || []) if (!seen.has(it.repository.full_name)) seen.set(it.repository.full_name, it.repository);
    const names = [...seen.keys()].slice(0, per);
    const details = await Promise.all(names.map((n) => get('repos/' + n).then((x) => x.json).catch(() => seen.get(n))));
    let items = details.map(repo).map((x) => ({ ...x, installable: true }));
    if (sort === 'stars') items.sort((a, b2) => (b2.stars || 0) - (a.stars || 0));
    else if (sort === 'updated') items.sort((a, b2) => Date.parse(b2.updated_at || 0) - Date.parse(a.updated_at || 0));
    return { mode, items, total: r.json.total_count || items.length, page, per, limit: r.limit, backend: { ...b, via: r.via } };
  }
  const query = [term, 'topic:' + m.topic, 'fork:true'].filter(Boolean).join(' ');
  const r = await get(`search/repositories?q=${encodeURIComponent(query)}&sort=${sort === 'updated' ? 'updated' : 'stars'}&order=desc&per_page=${per}&page=${page}`);
  return { mode, items: (r.json.items || []).map(repo), total: r.json.total_count || 0, page, per, limit: r.limit, backend: { ...b, via: r.via } };
}

module.exports = { search, backend, clean, MODES };
