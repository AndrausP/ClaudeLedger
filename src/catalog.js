'use strict';
// Fontes de descoberta para a aba Explorar:
//  1. Diretório oficial de plugins (cache local do Claude Code — formato interno, pode mudar)
//  2. Catálogo oficial com custo em tokens por plugin (cache local)
//  3. Registry oficial de MCP (API pública)
//  4. Registry comunitário (index.json servido por CDN a partir de um repo GitHub)
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGINS = path.join(os.homedir(), '.claude', 'plugins');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

let memo = null;
function plugins() {
  const dir = readJson(path.join(PLUGINS, 'plugin-directory-cache-v2.json'));
  const cat = readJson(path.join(PLUGINS, 'plugin-catalog-cache.json'));
  const stamp = (dir && dir.fetchedAt) + '|' + (cat && cat.fetchedAt);
  if (memo && memo.stamp === stamp) return memo.data;

  const byName = new Map();
  if (cat && cat.catalog && cat.catalog.plugins) {
    for (const [id, p] of Object.entries(cat.catalog.plugins)) {
      const tk = p.tokens || {};
      const model = Object.keys(tk).find((m) => m.includes('sonnet')) || Object.keys(tk)[0];
      byName.set(p.plugin, {
        id, market: id.split('@')[1], alwaysOn: model ? tk[model].always_on : null, onInvoke: model ? tk[model].on_invoke : null,
        installs: p.unique_installs || 0, updated: p.last_updated || '',
        skills: (p.components && p.components.skills || []).length, agents: (p.components && p.components.agents || []).length, commands: (p.components && p.components.commands || []).length,
      });
    }
  }
  const out = [];
  const seen = new Set();
  for (const l of (dir && dir.listings) || []) {
    const c = byName.get(l.name);
    const repo = l.source && l.source.repository && l.source.repository.url;
    out.push({
      key: 'dir:' + l.id, name: l.name, summary: l.summary || '', version: (l.release && l.release.version) || '',
      repo: repo || '', commit: (l.source && l.source.repository && l.source.repository.reviewed_commit) || '',
      reviewed: !!(l.checks && l.checks.review && l.checks.review.state === 'done'), surfaces: l.surfaces || [],
      official: c ? c.id : null, alwaysOn: c ? c.alwaysOn : null, onInvoke: c ? c.onInvoke : null, installs: c ? c.installs : 0,
      skills: c ? c.skills : null, agents: c ? c.agents : null, origin: 'diretório oficial',
    });
    seen.add(l.name);
  }
  for (const [name, c] of byName) if (!seen.has(name)) out.push({ key: 'cat:' + c.id, name, summary: '', version: '', repo: '', reviewed: true, surfaces: [], official: c.id, alwaysOn: c.alwaysOn, onInvoke: c.onInvoke, installs: c.installs, skills: c.skills, agents: c.agents, origin: 'catálogo oficial' });
  const data = { items: out, fetchedAt: dir && dir.fetchedAt, available: !!(dir || cat) };
  memo = { stamp, data };
  return data;
}

// MCP: transforma a entrada do registry em config pronta para `claude mcp add-json`
function mcpConfig(s) {
  const remote = (s.remotes || [])[0];
  if (remote && remote.url) {
    const cfg = { type: remote.type === 'sse' ? 'sse' : 'http', url: remote.url };
    if ((remote.headers || []).length) cfg.headers = Object.fromEntries(remote.headers.map((h) => [h.name, '']));
    return cfg;
  }
  const pkg = (s.packages || [])[0];
  if (!pkg) return null;
  const env = Object.fromEntries((pkg.environmentVariables || []).map((v) => [v.name, '']));
  const id = pkg.identifier + (pkg.version ? '@' + pkg.version : '');
  const t = pkg.registryType || pkg.registry_type;
  let cfg;
  if (t === 'npm') cfg = { command: 'npx', args: ['-y', id] };
  else if (t === 'pypi') cfg = { command: 'uvx', args: [pkg.identifier + (pkg.version ? '==' + pkg.version : '')] };
  else if (t === 'oci') cfg = { command: 'docker', args: ['run', '-i', '--rm', pkg.identifier + (pkg.version ? ':' + pkg.version : '')] };
  else return null;
  if (Object.keys(env).length) cfg.env = env;
  return cfg;
}

async function mcpSearch(q) {
  const u = new URL('https://registry.modelcontextprotocol.io/v0/servers');
  if (q) u.searchParams.set('search', q);
  u.searchParams.set('limit', '50');
  const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Registry MCP respondeu ' + r.status);
  const j = await r.json();
  const latest = new Map(); // o registry lista versões; fica a mais recente
  for (const e of j.servers || []) {
    const s = e.server || e;
    const meta = (e._meta && e._meta['io.modelcontextprotocol.registry/official']) || {};
    if (meta.isLatest === false) continue;
    latest.set(s.name, {
      key: 'mcp:' + s.name, name: s.name, title: s.title || s.name.split('/').pop(), summary: s.description || '', version: s.version || '',
      repo: (s.repository && s.repository.url) || '', website: s.websiteUrl || '',
      kind: (s.remotes || []).length ? 'remoto' : (s.packages || []).length ? ((s.packages[0].registryType || s.packages[0].registry_type) || 'pacote') : '?',
      config: mcpConfig(s), origin: 'registry MCP',
    });
  }
  return [...latest.values()];
}

async function community(url) {
  if (!url) return { items: [], configured: false };
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Registry comunitário respondeu ' + r.status);
  const j = await r.json();
  const items = (Array.isArray(j.entries) ? j.entries : []).filter((e) => e && typeof e.name === 'string' && typeof e.repo === 'string' && /^https:\/\//.test(e.repo)).map((e) => ({
    key: 'com:' + e.name, name: e.name, summary: String(e.description || '').slice(0, 300), repo: e.repo, commit: e.commit || '', kind: e.kind || '',
    hooks: !!e.hooks, alwaysOn: typeof e.alwaysOn === 'number' ? e.alwaysOn : null, tags: Array.isArray(e.tags) ? e.tags.slice(0, 6).map(String) : [], origin: 'comunidade',
  }));
  return { items, configured: true, generatedAt: j.generatedAt };
}

module.exports = { plugins, mcpSearch, community };
