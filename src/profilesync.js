'use strict';
// Hook SessionStart do Claude Code, instalado pelo Claude Ledger ao aplicar um perfil.
// Roda toda vez que uma sessão abre: confere ~/.claude/settings.json e o bloco do perfil no
// ~/.claude/CLAUDE.md contra o alvo gravado pelo app (profiles.json → target) e corrige o que
// divergiu. Se o bloco do perfil estava faltando ou diferente, injeta as instruções na sessão
// que está abrindo (additionalContext), então ela já nasce com o perfil.
// Autocontido de propósito: é copiado para a pasta de dados do app e não depende do app instalado.
// Nunca grava texto de prompt — o log guarda só horário, pasta, sessão e o que foi corrigido.
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE = process.argv[2];
const LOG = path.join(path.dirname(STATE || '.'), 'hooks', 'sync.log');
const CLAUDE = process.env.LEDGER_CLAUDE_DIR || path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE, 'settings.json');
const CLAUDE_MD = path.join(CLAUDE, 'CLAUDE.md');
const START = '<!-- CLAUDE-LEDGER:PROFILE START';
const END = '<!-- CLAUDE-LEDGER:PROFILE END -->';

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function currentBlock(md) {
  const i = md.indexOf(START), j = md.indexOf(END);
  return i >= 0 && j > i ? md.slice(i, j + END.length) : null;
}

function run() {
  const input = readStdin();
  const st = readJson(STATE, null);
  if (!st || !st.active || !st.target) return null; // nenhum perfil aplicado: não mexe em nada
  const t = st.target;
  const fixed = [];

  // settings.json: modelo, plugins e regras de bloqueio do perfil
  const s = readJson(SETTINGS, {});
  if ((t.model || '') !== (s.model || '')) { if (t.model) s.model = t.model; else delete s.model; fixed.push('modelo'); }
  s.enabledPlugins = s.enabledPlugins || {};
  for (const [k, on] of Object.entries(t.plugins || {})) {
    if ((s.enabledPlugins[k] !== false) !== on) { s.enabledPlugins[k] = on; fixed.push('plugin ' + k); }
  }
  const deny = (s.permissions && s.permissions.deny) || [];
  const missing = (t.deny || []).filter((r) => !deny.includes(r));
  if (missing.length) { s.permissions = s.permissions || {}; s.permissions.deny = [...deny, ...missing]; fixed.push('bloqueios'); }
  if (fixed.length) {
    try { fs.copyFileSync(SETTINGS, SETTINGS + '.ledger-sync.bak'); } catch { /* sem arquivo anterior */ }
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  }

  // CLAUDE.md: bloco gerenciado do perfil
  let md = ''; try { md = fs.readFileSync(CLAUDE_MD, 'utf8'); } catch { /* ainda não existe */ }
  const block = currentBlock(md);
  let inject = false;
  if (!block || block.trim() !== t.block.trim()) {
    const next = block ? md.replace(block, t.block.trim()) : `${md.replace(/\s*$/, '')}${md.trim() ? '\n\n' : ''}${t.block.trim()}\n`;
    fs.writeFileSync(CLAUDE_MD, next);
    fixed.push('CLAUDE.md');
    inject = true;
  }

  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify({ at: Date.now(), source: input.source || null, cwd: input.cwd || null, session: input.session_id || null, profile: t.name, fixed }) + '\n');
  } catch { /* log é opcional */ }

  if (!inject) return null;
  const text = t.block.split('\n').filter((l) => !l.startsWith('<!-- CLAUDE-LEDGER')).join('\n').trim();
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
}

try {
  const out = run();
  if (out) process.stdout.write(JSON.stringify(out));
} catch (err) {
  // nunca impede a sessão de abrir
  process.stderr.write('claude-ledger profile sync: ' + err.message + '\n');
}
process.exit(0);
