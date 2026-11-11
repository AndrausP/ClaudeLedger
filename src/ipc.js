'use strict';
// Contratos da seção 8 da especificação, expostos como canais IPC (o app não tem servidor HTTP).
// Mesmo nome lógico: GET /api/sessions → 'sessions:list', etc.
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const { execFileSync } = require('child_process');
const DB = require('./db');
const Sess = require('./services/sessions');
const Diag = require('./services/diagnostics');
const Eff = require('./services/efficiency');
const Costs = require('./services/costs');
const Adm = require('./services/admin');
const Chg = require('./services/changes');
const SL = require('./statusline');
const Otel = require('./otel/receiver');
const An = require('./services/analytics');
const GH = require('./github');
const Orc = require('./services/orchestra');
const fs = require('fs');

function findNode() {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/).find(Boolean);
    return out ? out.trim() : null;
  } catch { return null; }
}

function register({ ipcMain, app, getWin, readPricing }) {
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'ledger.db');
  const db = DB.open(dbPath);
  const root = path.join(os.homedir(), '.claude', 'projects');
  let running = null, last = null, otelServer = null;

  const send = (ch, d) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
  // worker precisa estar fora do asar no app empacotado
  const workerPath = () => path.join(__dirname, 'ingest', 'worker.js').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

  function ingest() {
    if (running) return running;
    running = new Promise((resolve) => {
      const w = new Worker(workerPath(), { workerData: { dbPath, root, pricing: readPricing() } });
      w.on('message', (m) => {
        if (m.type === 'progress') send('db:progress', m);
        else if (m.type === 'done') last = { ...m.result, at: Date.now() };
        else if (m.type === 'error') last = { error: m.error, at: Date.now() };
      });
      w.on('error', (err) => { last = { error: err.message, at: Date.now() }; });
      w.on('exit', () => {
        try {
          const snaps = SL.ingestSnapshots(db, userData);
          const matched = Otel.match(db);
          const retention = Adm.applyRetention(db);
          const diagnostics = Diag.computeStale(db);
          const evaluated = Eff.evaluateAll(db);
          last = { ...last, snaps, matched, retention, diagnostics, evaluated };
        } catch (err) { last = { ...last, postError: err.message }; }
        running = null;
        send('db:updated', last);
        resolve(last);
      });
    });
    return running;
  }

  async function startOtel() {
    if (otelServer) return { ok: true };
    const r = await Otel.start(() => db, () => send('db:updated', { otel: true, at: Date.now() }));
    if (r.ok) otelServer = r.server;
    return r;
  }
  function stopOtel() { if (otelServer) { otelServer.close(); otelServer = null; } }

  ingest();
  setInterval(ingest, 60000); // coleta contínua: só lê o que foi acrescentado
  if (Adm.otelStatus().enabled) startOtel();

  // erros viram { __error } em vez de exceção no renderer
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (err) { return { __error: err.message }; } });

  const sessionPaths = (id) => {
    const s = db.prepare('SELECT s.*, p.root_path FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?').get(id);
    if (!s) throw new Error('sessão não encontrada');
    return { s, transcript: path.join(root, s.project_id, id + '.jsonl') };
  };
  const tolerance = () => ({ tolerancePct: (Adm.getSettings(db).costs.tolerancePct) || 2 });

  // ---- coleta
  h('db:status', () => ({ running: !!running, last, ingestion: Sess.ingestionStatus(db), statusline: SL.status(userData), otel: { ...Adm.otelStatus(), listening: !!otelServer } }));
  h('db:ingest', () => ingest());
  // ---- sessões / timeline
  h('sessions:list', (f) => Sess.list(db, f || {}));
  h('sessions:get', (id) => ({ ...Sess.get(db, id, tolerance()), outcome: Eff.outcomeOf(db, id), tags: Adm.tagsOf(db, id), diagnostics: Diag.list(db, { sessionId: id, includeClosed: false }) }));
  h('sessions:timeline', (id, f) => Sess.timeline(db, id, f || {}));
  h('sessions:eventPage', (id, eventId, f) => Sess.pageOfEvent(db, id, eventId, f || {}));
  h('sessions:event', (eventId) => Sess.event(db, eventId));
  // ---- diagnósticos
  h('diagnostics:list', (f) => Diag.list(db, f || {}));
  h('diagnostics:recompute', (f) => Diag.computeStale(db, f || {}));
  h('diagnostics:feedback', (id, v) => Diag.feedback(db, id, v));
  // ---- eficiência
  h('efficiency:analyze', (f) => Eff.analyze(db, f || {}));
  h('outcome:set', (id, o, note) => Eff.setManual(db, id, o, note));
  // ---- custos e assinatura
  h('costs:summary', (f) => Costs.summary(db, f || {}));
  h('costs:reconciliation', (f) => Costs.reconciliationList(db, f || {}));
  h('subscription:usage', () => ({ ...Costs.subscription(db), statusline: SL.status(userData) }));
  // ---- mudanças (git + file-history)
  h('changes:commits', (id) => { const { s } = sessionPaths(id); return Chg.commits(s.root_path, s.start_at, s.end_at); });
  h('changes:show', (id, hash) => { const { s } = sessionPaths(id); return Chg.show(s.root_path, hash); });
  h('changes:files', (id) => { const { transcript } = sessionPaths(id); return Chg.trackedFiles(transcript, id); });
  h('changes:fileDiff', (id, rel) => {
    const { transcript } = sessionPaths(id);
    const f = Chg.trackedFiles(transcript, id).files.find((x) => x.rel === rel); // caminho vem do transcrito, não do renderer
    if (!f) throw new Error('arquivo não pertence à sessão');
    return Chg.fileDiff(id, f);
  });
  // ---- assuntos (etiquetas manuais)
  h('tags:set', (id, tags) => Adm.setTags(db, id, tags));
  h('topics:list', (f) => Adm.topics(db, f || {}));
  // ---- módulo de filtros, agentes, auditoria
  h('filters:options', () => An.filterOptions(db));
  h('agents:list', (f) => An.agents(db, f || {}));
  h('agents:detail', (name, f) => An.agentDetail(db, String(name), f || {}));
  h('audit:overview', (f) => An.auditOverview(db, f || {}));
  h('audit:responses', (f) => An.responses(db, f || {}));
  h('audit:tools', (f) => An.toolCalls(db, f || {}));
  h('audit:errors', (f) => An.errors(db, f || {}));
  // ---- busca no GitHub (wrapper: gh autenticado ou API pública)
  h('github:search', (o) => GH.search(o || {}));
  h('github:backend', () => GH.backend());
  // ---- extensão Orchestra Core (só leitura do catálogo e do runtime dela)
  const cfgFile = path.join(userData, 'config.json');
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { return {}; } };
  h('orchestra:overview', (f) => Orc.overview(db, f || {}, readCfg().orchestraPath));
  h('orchestra:agent', (id, f) => {
    const o = Orc.overview(db, f || {}, readCfg().orchestraPath);
    if (!o.found) throw new Error('Extensão Orchestra não encontrada.');
    const cat = o.catalog.agents.find((x) => x.id === id);
    if (!cat) throw new Error('Agente fora do catálogo.');
    // o detalhe de uso reaproveita o mesmo serviço de Agentes, com o nome que aparece no Claude Code
    const used = Orc.aliases(id).find((n) => db.prepare('SELECT 1 FROM agents WHERE name = ? LIMIT 1').get(n));
    return { catalog: cat, usage: o.usage.agents[id] || null, alias: used || null, detail: used ? An.agentDetail(db, used, f || {}) : null, department: o.catalog.departments.find((d) => d.id === cat.department) || null };
  });
  h('orchestra:setPath', (p) => {
    const v = String(p || '').trim();
    if (v && !Orc.isOrchestraRoot(v)) throw new Error('A pasta não contém .claude-plugin/plugin.json com name "orchestra" e catalogs/agents.json.');
    const c = readCfg(); c.orchestraPath = v || undefined; fs.writeFileSync(cfgFile, JSON.stringify(c, null, 2));
    return { ok: true };
  });
  h('orchestra:saveReport', async ({ format, content, name }) => {
    const { dialog, BrowserWindow } = require('electron');
    const ext = { md: 'md', html: 'html', pdf: 'pdf' }[format];
    if (!ext) throw new Error('formato inválido');
    const r = await dialog.showSaveDialog(getWin(), { defaultPath: String(name || 'relatorio-orchestra').replace(/[^\w.-]+/g, '-') + '.' + ext, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    if (ext !== 'pdf') { fs.writeFileSync(r.filePath, String(content)); return { ok: true, path: r.filePath }; }
    // PDF: renderiza o HTML do relatório numa janela oculta, sem scripts nem acesso a nada
    const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(content)));
      fs.writeFileSync(r.filePath, await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } }));
    } finally { w.destroy(); }
    return { ok: true, path: r.filePath };
  });
  // abre só páginas do GitHub no navegador padrão
  h('app:openExternal', (url) => { const u = new URL(String(url)); if (u.protocol !== 'https:' || u.hostname !== 'github.com') throw new Error('URL não permitida'); return require('electron').shell.openExternal(u.toString()); });
  // ---- configurações / privacidade
  h('settings:get', () => Adm.getSettings(db));
  h('settings:set', async (s) => { const r = Adm.setSettings(db, s || {}); if (s && s.rules) Diag.computeStale(db, { force: true }); return r; });
  h('admin:deleteSession', (id) => { const r = Adm.deleteSession(db, id); Adm.logConsent(db, 'excluir sessão ' + String(id).slice(0, 8), true); return r; });
  h('admin:deleteProject', (id) => { const r = Adm.deleteProject(db, id); Adm.logConsent(db, 'excluir projeto ' + id, true); return r; });
  h('admin:restore', async () => { const r = Adm.restoreExcluded(db); await ingest(); return r; });
  h('statusline:install', () => {
    const node = findNode();
    if (!node) throw new Error('Node.js não encontrado no PATH — necessário para o wrapper da status line.');
    const r = SL.install(userData, node); Adm.logConsent(db, 'instalar wrapper da status line', true); return { ...r, status: SL.status(userData) };
  });
  h('statusline:uninstall', () => { const r = SL.uninstall(userData); Adm.logConsent(db, 'remover wrapper da status line', false); return { ...r, status: SL.status(userData) }; });
  h('otel:set', async (on) => {
    const st = Adm.otelSet(!!on);
    Adm.logConsent(db, on ? 'ativar OpenTelemetry local' : 'desativar OpenTelemetry', !!on);
    if (on) { const r = await startOtel(); return { ...st, listening: !!otelServer, error: r.ok ? null : r.error }; }
    stopOtel(); return { ...st, listening: false };
  });

  return { ingest, db };
}

module.exports = { register };
