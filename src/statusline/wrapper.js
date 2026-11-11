#!/usr/bin/env node
'use strict';
// Wrapper transparente da status line (spec 6.3).
// 1) lê o JSON que o Claude Code manda por stdin
// 2) grava SÓ os campos necessários (rate_limits, session_id) num arquivo de snapshots
// 3) repassa o MESMO stdin ao comando original e devolve a saída dele sem alteração
// Falha de gravação nunca quebra a status line do usuário.
// uso: node wrapper.js <arquivo-de-snapshots> <comando-original-em-base64>
const fs = require('fs');
const { spawn } = require('child_process');

const [, , outFile, origB64] = process.argv;
const original = origB64 ? Buffer.from(origB64, 'base64').toString('utf8') : '';

// só valores primitivos de rate_limits.<janela>.*, nada mais do JSON
function pickLimits(rl) {
  if (!rl || typeof rl !== 'object') return null;
  const out = {};
  for (const [win, v] of Object.entries(rl)) {
    if (!v || typeof v !== 'object') continue;
    out[win] = {};
    for (const [k, x] of Object.entries(v)) if (['number', 'string', 'boolean'].includes(typeof x)) out[win][k] = x;
  }
  return out;
}

function shell() {
  if (process.platform !== 'win32') return '/bin/sh';
  const candidates = [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'];
  return candidates.find((p) => p && fs.existsSync(p)) || true;
}

const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const input = Buffer.concat(chunks);
  try {
    const j = JSON.parse(input.toString('utf8'));
    const snap = { at: Date.now(), session_id: typeof j.session_id === 'string' ? j.session_id : null, rate_limits: pickLimits(j.rate_limits) };
    if (outFile) fs.appendFileSync(outFile, JSON.stringify(snap) + '\n');
  } catch { /* nunca interfere na status line */ }
  if (!original) return;
  const child = spawn(original, { shell: shell(), stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  child.on('error', () => process.exit(1));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  child.on('exit', (code) => process.exit(code == null ? 0 : code));
});
