#!/usr/bin/env node
// Gera index.json a partir de entries/*.json.
// Para cada entrada: clona o repo (raso) no commit fixado, analisa SEM executar nada
// e registra o que ele traz (tipo, hooks, MCP, skills). Sem dependências externas.
//
//   node scripts/build.mjs           → valida e escreve index.json
//   node scripts/build.mjs --check   → só valida (usado nos Pull Requests); sai com 1 se houver erro
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const CHECK = process.argv.includes('--check');
const NAME = /^[a-z0-9][a-z0-9-]{1,63}$/;
const KINDS = ['marketplace', 'plugin', 'skills', 'agents', 'mcp'];

const git = (args, cwd) => execFileSync('git', ['-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'core.symlinks=false', '-c', 'core.longpaths=true', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).toString().trim();
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } }; // aceita BOM (Notepad/PowerShell)
const hookEvents = (h) => (h && typeof h === 'object' ? Object.keys(h.hooks && typeof h.hooks === 'object' ? h.hooks : h) : []);

function walk(dir, depth, fn, rel = '') {
  if (depth < 0) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), depth - 1, fn, r); else fn(r, path.join(dir, e.name));
  }
}

function analyze(dir) {
  const out = { kind: [], hooks: [], mcp: [], skills: 0, agents: 0 };
  if (readJson(path.join(dir, '.claude-plugin', 'marketplace.json'))) out.kind.push('marketplace');
  else if (readJson(path.join(dir, '.claude-plugin', 'plugin.json'))) out.kind.push('plugin');
  walk(dir, 6, (rel, abs) => {
    if (rel.endsWith('/SKILL.md') || rel === 'SKILL.md') out.skills++;
    if (/(^|\/)agents\/[^/]+\.md$/.test(rel)) out.agents++;
    if (/(^|\/)hooks\/hooks\.json$/.test(rel)) out.hooks.push(...hookEvents(readJson(abs)));
    if (/(^|\/)\.claude-plugin\/plugin\.json$/.test(rel)) { const p = readJson(abs) || {}; if (p.hooks && typeof p.hooks === 'object') out.hooks.push(...hookEvents(p.hooks)); }
    if (/(^|\/)\.mcp\.json$/.test(rel)) { const j = readJson(abs) || {}; out.mcp.push(...Object.keys(j.mcpServers || j)); }
  });
  if (!out.kind.length && out.skills) out.kind.push('skills');
  if (!out.kind.length && out.agents) out.kind.push('agents');
  if (out.mcp.length && !out.kind.includes('mcp')) out.kind.push('mcp');
  out.hooks = [...new Set(out.hooks)];
  return out;
}

const errors = [];
const entries = [];
const files = fs.readdirSync(path.join(ROOT, 'entries')).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
for (const f of files) {
  const e = readJson(path.join(ROOT, 'entries', f));
  const err = (m) => errors.push(`${f}: ${m}`);
  if (!e) { err('JSON inválido'); continue; }
  if (!NAME.test(e.name || '')) err('name: minúsculas, números e hífen (2–64)');
  if (f !== `${e.name}.json`) err(`arquivo deve se chamar ${e.name}.json`);
  if (!/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+$/.test(e.repo || '')) err('repo: URL https de GitHub, GitLab ou Bitbucket, sem barra no fim');
  if (typeof e.description !== 'string' || e.description.length < 10 || e.description.length > 300) err('description: 10–300 caracteres');
  if (e.commit && !/^[0-9a-f]{40}$/.test(e.commit)) err('commit: SHA completo de 40 caracteres');
  if (e.tags && (!Array.isArray(e.tags) || e.tags.length > 6)) err('tags: lista com até 6 itens');
  if (errors.some((x) => x.startsWith(f))) continue;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  try {
    git(['clone', '--depth', '1', '--no-tags', e.repo, tmp]);
    if (e.commit) {
      try { git(['fetch', '--depth', '1', 'origin', e.commit], tmp); git(['checkout', '--quiet', e.commit], tmp); } catch { err(`commit ${e.commit} não encontrado no repo`); continue; }
    }
    const sha = git(['rev-parse', 'HEAD'], tmp);
    const a = analyze(tmp);
    if (!a.kind.length) { err('nada reconhecível (sem marketplace.json, plugin.json, SKILL.md, agentes ou .mcp.json)'); continue; }
    if (e.kind && !KINDS.includes(e.kind)) err(`kind inválido (use: ${KINDS.join(', ')})`);
    entries.push({
      name: e.name, description: e.description, repo: e.repo, commit: sha, kind: e.kind || a.kind[0],
      hooks: a.hooks.length > 0, hookEvents: a.hooks, mcp: a.mcp, skills: a.skills, agents: a.agents,
      tags: (e.tags || []).map(String), author: e.author || null,
    });
    console.log(`ok  ${e.name}  ${a.kind.join('+')}  ${sha.slice(0, 8)}${a.hooks.length ? '  ⚠ hooks: ' + a.hooks.join(', ') : ''}`);
  } catch (x) {
    err('falha ao clonar: ' + String(x.stderr || x.message).split('\n').slice(-2).join(' '));
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 2 }); } catch { /* temp do sistema */ }
  }
}

if (errors.length) { console.error('\nErros:\n- ' + errors.join('\n- ')); process.exit(1); }
if (CHECK) { console.log(`\n${entries.length} entrada(s) válida(s).`); process.exit(0); }
entries.sort((x, y) => x.name.localeCompare(y.name));
fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), entries }, null, 2) + '\n');
console.log(`\nindex.json: ${entries.length} entrada(s).`);
