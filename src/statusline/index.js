'use strict';
// Instalação/remoção do wrapper da status line e leitura dos snapshots de limite do plano.
// Instalar só com confirmação na UI; backup antes; remover restaura exatamente o original.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MARK = 'statusline-wrapper.js';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const fwd = (p) => p.replace(/\\/g, '/');

function paths(userData) {
  const dir = path.join(userData, 'statusline');
  return { dir, wrapper: path.join(dir, MARK), snapshots: path.join(dir, 'snapshots.jsonl'), original: path.join(dir, 'original.json') };
}

function status(userData) {
  const p = paths(userData);
  const s = readJson(SETTINGS, {});
  const cmd = s.statusLine && s.statusLine.command;
  const installed = !!(cmd && cmd.includes(MARK));
  const last = lastSnapshot(p.snapshots);
  return { installed, current: s.statusLine || null, hasCustom: !!cmd && !installed, snapshots: last ? last.count : 0, lastAt: last ? last.at : null, hasLimits: !!(last && last.limits) };
}

function install(userData, nodeBin) {
  const p = paths(userData);
  const s = readJson(SETTINGS, {});
  if (s.statusLine && s.statusLine.command && s.statusLine.command.includes(MARK)) return { ok: true, already: true };
  fs.mkdirSync(p.dir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'wrapper.js'), p.wrapper);
  fs.copyFileSync(SETTINGS, SETTINGS + '.ledger-statusline.bak');
  fs.writeFileSync(p.original, JSON.stringify(s.statusLine || null, null, 2));
  const orig = s.statusLine && s.statusLine.command ? Buffer.from(s.statusLine.command, 'utf8').toString('base64') : '';
  s.statusLine = { ...(s.statusLine || { type: 'command' }), type: 'command', command: `"${fwd(nodeBin)}" "${fwd(p.wrapper)}" "${fwd(p.snapshots)}" ${orig}`.trim() };
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  return { ok: true, backup: SETTINGS + '.ledger-statusline.bak' };
}

function uninstall(userData) {
  const p = paths(userData);
  const s = readJson(SETTINGS, {});
  if (!(s.statusLine && s.statusLine.command && s.statusLine.command.includes(MARK))) return { ok: true, already: true };
  const original = readJson(p.original, null);
  if (original) s.statusLine = original; else delete s.statusLine;
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  return { ok: true };
}

function lastSnapshot(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return null;
  try { const j = JSON.parse(lines[lines.length - 1]); return { count: lines.length, at: j.at, limits: j.rate_limits }; } catch { return { count: lines.length }; }
}

// normaliza uma janela de rate_limits sem assumir nomes exatos de campo (variam por versão)
function windowOf(v) {
  if (!v || typeof v !== 'object') return null;
  const keys = Object.keys(v);
  const pk = keys.find((k) => /percent|utiliz|used/i.test(k) && typeof v[k] === 'number');
  const rk = keys.find((k) => /reset/i.test(k));
  if (pk == null) return null;
  let used = v[pk];
  if (used <= 1 && !/percent/i.test(pk)) used *= 100; // fração → %
  let resets = rk ? v[rk] : null;
  if (typeof resets === 'string') resets = Date.parse(resets) || null;
  else if (typeof resets === 'number' && resets < 1e12) resets *= 1000; // segundos → ms
  return { used_pct: used, resets_at: resets };
}

// importa snapshots novos para usage_snapshots (idempotente por instante + janela)
function ingestSnapshots(db, userData) {
  const p = paths(userData);
  let text; try { text = fs.readFileSync(p.snapshots, 'utf8'); } catch { return 0; }
  const exists = db.prepare('SELECT 1 FROM usage_snapshots WHERE captured_at = ? AND window = ?');
  const ins = db.prepare('INSERT INTO usage_snapshots(captured_at, window, used_pct, resets_at, source) VALUES (?,?,?,?,?)');
  let n = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const rl = j.rate_limits || {};
    for (const [key, win] of [['five_hour', '5h'], ['seven_day', '7d']]) {
      const w = windowOf(rl[key]);
      if (!w || exists.get(j.at, win)) continue;
      ins.run(j.at, win, w.used_pct, w.resets_at, 'status_line'); n++;
    }
  }
  return n;
}

module.exports = { status, install, uninstall, ingestSnapshots, windowOf, paths, SETTINGS };
