'use strict';
// Lê transcritos do Claude Code (~/.claude/projects/**/*.jsonl, inclui subagents/)
// e extrai um registro compacto por resposta do assistente.
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const ROOT = path.join(os.homedir(), '.claude', 'projects');
const CACHE_VERSION = 2;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith('.jsonl')) out.push(f);
  }
  return out;
}

// tool_use -> chave de extensão: "mcp|server|tool", "skill|nome", "agent|tipo", "tool|Nome"
function extKey(block) {
  const n = block.name || '';
  if (n === 'Skill') return 'skill|' + ((block.input && block.input.skill) || '?');
  if (n === 'Agent' || n === 'Task') return 'agent|' + ((block.input && block.input.subagent_type) || 'general-purpose');
  if (n.startsWith('mcp__')) {
    let m = /^mcp__plugin_([^_]+(?:-[^_]+)*)_(.+?)__(.+)$/.exec(n);
    if (m) return `mcp|${m[1]}/${m[2]}|${m[3]}`;
    m = /^mcp__claude_ai_(.+?)__(.+)$/.exec(n);
    if (m) return `mcp|claude.ai ${m[1].replace(/_/g, ' ')}|${m[2]}`;
    m = /^mcp__(.+?)__(.+)$/.exec(n);
    if (m) return `mcp|${m[1]}|${m[2]}`;
  }
  return 'tool|' + n;
}

function readMeta(file) {
  const meta = file.replace(/\.jsonl$/, '.meta.json');
  try { return JSON.parse(fs.readFileSync(meta, 'utf8')); } catch { return null; }
}

async function parseFile(file) {
  const rel = path.relative(ROOT, file).split(path.sep);
  const project = rel[0];
  const isSub = rel.includes('subagents');
  const session = isSub ? rel[rel.indexOf('subagents') - 1] : path.basename(file, '.jsonl');
  let agent = 'main';
  let agentFile = '';
  if (isSub) {
    const meta = readMeta(file) || {};
    agent = meta.agentType || 'subagent';
    agentFile = path.basename(file, '.jsonl');
  }
  const byId = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || !o.message || !o.message.usage) continue;
    const msg = o.message;
    if (!msg.model || msg.model.startsWith('<')) continue; // <synthetic>
    const u = msg.usage;
    const cc = u.cache_creation || {};
    const w1 = cc.ephemeral_1h_input_tokens || 0;
    const w5 = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, (u.cache_creation_input_tokens || 0) - w1);
    const id = msg.id || o.uuid;
    const exts = [];
    if (Array.isArray(msg.content)) for (const b of msg.content) if (b && b.type === 'tool_use') exts.push(extKey(b));
    const prev = byId.get(id);
    if (prev) { // mesma resposta em várias linhas (um bloco por linha): une extensões, mantém maior usage
      for (const x of exts) prev.x.push(x);
      if ((u.output_tokens || 0) >= prev.o) { prev.o = u.output_tokens || 0; prev.i = u.input_tokens || 0; prev.cr = u.cache_read_input_tokens || 0; prev.w5 = w5; prev.w1 = w1; }
      continue;
    }
    byId.set(id, {
      t: Date.parse(o.timestamp) || 0, s: session, p: project, m: msg.model, a: agent, g: agentFile,
      i: u.input_tokens || 0, o: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, w5, w1, x: exts,
    });
  }
  for (const r of byId.values()) r.x = [...new Set(r.x)];
  return [...byId.values()];
}

async function loadAll(cachePath, onProgress) {
  let cache = { v: CACHE_VERSION, files: {} };
  try { const c = JSON.parse(fs.readFileSync(cachePath, 'utf8')); if (c.v === CACHE_VERSION) cache = c; } catch { /* sem cache */ }
  const files = walk(ROOT);
  const next = {};
  const records = [];
  let done = 0;
  for (const f of files) {
    let st;
    try { st = fs.statSync(f); } catch { continue; }
    const hit = cache.files[f];
    if (hit && hit.m === st.mtimeMs && hit.s === st.size) next[f] = hit;
    else {
      let r = [];
      try { r = await parseFile(f); } catch { /* arquivo ilegível: ignora */ }
      next[f] = { m: st.mtimeMs, s: st.size, r };
    }
    for (const r of next[f].r) records.push(r);
    done++;
    if (onProgress && done % 5 === 0) onProgress(done, files.length);
  }
  try { fs.writeFileSync(cachePath, JSON.stringify({ v: CACHE_VERSION, files: next })); } catch { /* cache é opcional */ }
  if (onProgress) onProgress(files.length, files.length);
  return { records, fileCount: files.length };
}

module.exports = { loadAll, ROOT };
