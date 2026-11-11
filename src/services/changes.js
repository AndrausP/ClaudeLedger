'use strict';
// "Mudanças" de uma sessão: (1) commits git feitos na janela da sessão; (2) arquivos editados segundo o
// file-history do próprio Claude Code (cobre projetos sem git). Só leitura, sob demanda; nada é armazenado.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { unified, parseGitPatch } = require('../domain/diff');

const CLAUDE = path.join(os.homedir(), '.claude');
const MAX_FILE = 2 * 1024 * 1024;
const MAX_PATCH = 600 * 1024;

const git = (cwd, args, max = 8 * 1024 * 1024) => new Promise((resolve) => {
  execFile('git', ['-c', 'core.quotepath=off', '-c', 'color.ui=never', ...args], { cwd, maxBuffer: max, timeout: 20000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' } },
    (err, out, se) => resolve({ ok: !err, out: String(out || ''), err: String(se || (err && err.message) || ''), enoent: err && err.code === 'ENOENT' }));
});

async function repoOf(root) {
  if (!root || !fs.existsSync(root)) return { ok: false, reason: 'A pasta do projeto não existe mais neste computador.' };
  const r = await git(root, ['rev-parse', '--show-toplevel']);
  if (r.enoent) return { ok: false, reason: 'Git não está instalado.' };
  if (!r.ok) return { ok: false, reason: 'O projeto não é um repositório git.' };
  return { ok: true, top: r.out.trim() };
}

// commits com data de autor dentro da janela da sessão (+ folga de 10 min no fim)
async function commits(root, start, end) {
  const repo = await repoOf(root);
  if (!repo.ok) return { available: false, reason: repo.reason, commits: [] };
  const since = Math.floor(start / 1000) - 60, until = Math.floor(end / 1000) + 600;
  const r = await git(repo.top, ['log', '--all', '--diff-merges=first-parent', `--since=@${since}`, `--until=@${until}`, '--numstat', '--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%aI']);
  if (!r.ok) return { available: false, reason: 'git log falhou: ' + r.err.split('\n')[0], commits: [] };
  const list = r.out.split('\x1e').filter((x) => x.trim()).map((chunk) => {
    const [head, ...rest] = chunk.split('\n');
    const [hash, short, subject, author, date] = head.split('\x1f');
    const files = rest.filter(Boolean).map((l) => { const [ad, rm, p] = l.split('\t'); return { path: p, added: ad === '-' ? null : +ad, removed: rm === '-' ? null : +rm }; });
    return { hash, short, subject, author, at: Date.parse(date), files, added: files.reduce((a, f) => a + (f.added || 0), 0), removed: files.reduce((a, f) => a + (f.removed || 0), 0) };
  });
  const status = await git(repo.top, ['status', '--porcelain']);
  return { available: true, top: repo.top, commits: list, uncommitted: status.ok ? status.out.split('\n').filter(Boolean).length : null };
}

async function show(root, hash) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(hash))) throw new Error('hash inválido');
  const repo = await repoOf(root);
  if (!repo.ok) throw new Error(repo.reason);
  const r = await git(repo.top, ['show', '--no-ext-diff', '--diff-merges=first-parent', '--patch', '--format=', hash], MAX_PATCH * 4);
  if (!r.ok) throw new Error('git show falhou');
  const truncated = r.out.length > MAX_PATCH;
  return { files: parseGitPatch(truncated ? r.out.slice(0, MAX_PATCH) : r.out), truncated };
}

// arquivos editados na sessão, a partir dos file-history-snapshot do transcrito
function trackedFiles(transcriptPath, sessionId) {
  const out = new Map();
  let text;
  try { text = fs.readFileSync(transcriptPath, 'utf8'); } catch { return { available: false, reason: 'Transcrito não encontrado.', files: [] }; }
  for (const line of text.split('\n')) {
    if (!line.includes('"trackedFileBackups"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const b = (o.snapshot && o.snapshot.trackedFileBackups) || {};
    for (const [rel, v] of Object.entries(b)) {
      if (!v || typeof v !== 'object') continue;
      const cur = out.get(rel) || { rel, versions: [] };
      if (!cur.versions.some((x) => x.version === v.version)) cur.versions.push({ version: v.version, backup: v.backupFileName || null, at: Date.parse(v.backupTime) || null });
      if (v.realParentDir) cur.parent = v.realParentDir;
      out.set(rel, cur);
    }
  }
  const dir = path.join(CLAUDE, 'file-history', sessionId);
  const files = [...out.values()].map((f) => {
    f.versions.sort((a, b) => a.version - b.version);
    const abs = f.parent ? path.join(f.parent, path.basename(f.rel)) : null;
    const first = f.versions[0];
    return { rel: f.rel, abs, versions: f.versions.length, created: !first.backup, firstBackup: first.backup, exists: abs ? fs.existsSync(abs) : null, hasBackupDir: fs.existsSync(dir) };
  });
  return { available: files.length > 0, reason: files.length ? null : 'O Claude Code não registrou edições de arquivo nesta sessão.', files };
}

function readSafe(p) {
  try { const st = fs.statSync(p); if (st.size > MAX_FILE) return { tooLarge: true }; return { text: fs.readFileSync(p, 'utf8') }; } catch { return { missing: true }; }
}

// diff: versão anterior à 1ª edição (backup do Claude Code) × estado ATUAL em disco
function fileDiff(sessionId, file) {
  let before = '';
  if (file.firstBackup) {
    if (!/^[0-9a-f]+@v\d+$/i.test(file.firstBackup)) throw new Error('backup inválido');
    const b = readSafe(path.join(CLAUDE, 'file-history', sessionId, file.firstBackup));
    if (b.missing) return { available: false, reason: 'O backup do Claude Code para este arquivo foi removido.' };
    if (b.tooLarge) return { available: false, reason: 'Arquivo grande demais para comparar (> 2 MB).' };
    before = b.text;
  }
  let after = '';
  const a = file.abs ? readSafe(file.abs) : { missing: true };
  if (a.tooLarge) return { available: false, reason: 'Arquivo grande demais para comparar (> 2 MB).' };
  if (!a.missing) after = a.text;
  if (/\u0000/.test(before + after)) return { available: false, reason: 'Arquivo binário.' };
  return { available: true, deleted: !!a.missing, created: !file.firstBackup, ...unified(before, after) };
}

module.exports = { commits, show, trackedFiles, fileDiff, repoOf };
