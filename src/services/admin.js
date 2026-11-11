'use strict';
// Privacidade e administração (spec 6.5): exclusão por sessão/projeto, retenção, etiquetas (assuntos), parâmetros.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { tx, getKV, setKV } = require('../db');
const { DEFAULT_PARAMS } = require('../domain/rules');
const { ENV } = require('../otel/receiver');
const { sessionIn } = require('./filters');

const SESSION_TABLES = ['session_events', 'model_requests', 'tool_calls', 'session_cost_reports', 'diagnostics', 'task_outcomes', 'session_tags', 'agents'];

// remove TODOS os dados derivados da sessão e impede reimportação (os transcritos do Claude Code não são tocados)
function deleteSession(db, id) {
  tx(db, () => {
    for (const t of SESSION_TABLES) db.prepare(`DELETE FROM ${t} WHERE session_id = ?`).run(id);
    db.prepare('UPDATE otel_requests SET matched_request_id = NULL WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM otel_requests WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM otel_events WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    db.prepare('INSERT OR REPLACE INTO excluded_sessions(session_id, excluded_at) VALUES (?, ?)').run(id, Date.now());
  });
  return { ok: true };
}

function deleteProject(db, projectId) {
  const ids = db.prepare('SELECT id FROM sessions WHERE project_id = ?').all(projectId).map((r) => r.id);
  for (const id of ids) deleteSession(db, id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  return { ok: true, sessions: ids.length };
}

function applyRetention(db) {
  const days = getKV(db, 'privacy.retentionDays', null);
  if (!days) return { ok: true, removed: 0 };
  const limit = Date.now() - days * 864e5;
  const ids = db.prepare('SELECT id FROM sessions WHERE end_at IS NOT NULL AND end_at < ?').all(limit).map((r) => r.id);
  for (const id of ids) deleteSession(db, id);
  return { ok: true, removed: ids.length };
}

function restoreExcluded(db) { const n = db.prepare('DELETE FROM excluded_sessions').run().changes; db.prepare('DELETE FROM ingestion_state').run(); return { ok: true, restored: n }; }

// ---- assuntos: só etiquetas manuais (classificar conteúdo exigiria ler prompts → fora do padrão de privacidade)
function setTags(db, sessionId, tags) {
  const clean = [...new Set((tags || []).map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 10);
  tx(db, () => {
    db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(sessionId);
    for (const t of clean) db.prepare('INSERT INTO session_tags(session_id, tag, created_at) VALUES (?,?,?)').run(sessionId, t, Date.now());
  });
  return clean;
}
const tagsOf = (db, id) => db.prepare('SELECT tag FROM session_tags WHERE session_id = ? ORDER BY tag').all(id).map((r) => r.tag);
function topics(db, F = {}) {
  const si = sessionIn(F);
  const tagged = db.prepare(`SELECT t.tag, count(DISTINCT t.session_id) sessions,
      sum((SELECT sum(recalculated_cost) FROM model_requests m WHERE m.session_id = t.session_id)) cost,
      sum((SELECT count(*) FROM model_requests m WHERE m.session_id = t.session_id)) requests
    FROM session_tags t JOIN sessions s ON s.id = t.session_id WHERE ${si.sql} GROUP BY t.tag ORDER BY cost DESC`).all(...si.args);
  const untagged = db.prepare(`SELECT count(*) n FROM sessions s WHERE NOT EXISTS (SELECT 1 FROM session_tags t WHERE t.session_id = s.id) AND EXISTS (SELECT 1 FROM model_requests m WHERE m.session_id = s.id) AND ${si.sql}`).get(...si.args).n;
  return { tagged, untagged, all: db.prepare('SELECT DISTINCT tag FROM session_tags ORDER BY tag').all().map((r) => r.tag) };
}

// ---- configurações
function getSettings(db) {
  return {
    costs: getKV(db, 'costs.settings', { monthlyFee: null, plan: '', currency: 'USD', budget: null, tolerancePct: 2 }),
    rules: { ...DEFAULT_PARAMS, ...getKV(db, 'rules.params', {}) },
    privacy: { retentionDays: getKV(db, 'privacy.retentionDays', null), consents: getKV(db, 'privacy.consents', []) },
    excluded: db.prepare('SELECT count(*) n FROM excluded_sessions').get().n,
  };
}
function setSettings(db, s) {
  if (s.costs) {
    const c = s.costs, n = (x) => (x === '' || x == null || isNaN(Number(x)) ? null : Number(x));
    setKV(db, 'costs.settings', { monthlyFee: n(c.monthlyFee), plan: String(c.plan || '').slice(0, 40), currency: String(c.currency || 'USD').slice(0, 3).toUpperCase(), budget: n(c.budget), tolerancePct: n(c.tolerancePct) ?? 2 });
  }
  if (s.rules) {
    const clean = {};
    for (const [id, p] of Object.entries(s.rules)) if (DEFAULT_PARAMS[id]) clean[id] = Object.fromEntries(Object.entries(p).filter(([k, v]) => k in DEFAULT_PARAMS[id] && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    setKV(db, 'rules.params', clean);
  }
  if (s.privacy && 'retentionDays' in s.privacy) {
    const d = Number(s.privacy.retentionDays);
    setKV(db, 'privacy.retentionDays', d > 0 ? Math.floor(d) : null);
  }
  return getSettings(db);
}
// registro das permissões concedidas (spec 6.5)
function logConsent(db, what, granted) {
  const list = getKV(db, 'privacy.consents', []);
  list.unshift({ what, granted, at: Date.now() });
  setKV(db, 'privacy.consents', list.slice(0, 100));
}

// ---- OpenTelemetry: liga/desliga variáveis no bloco env do settings.json (com backup)
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8').replace(/^﻿/, '')); } catch { return {}; } };
function otelStatus() {
  const env = readSettings().env || {};
  const on = Object.entries(ENV).every(([k, v]) => env[k] === v);
  const conflict = env.OTEL_EXPORTER_OTLP_ENDPOINT && env.OTEL_EXPORTER_OTLP_ENDPOINT !== ENV.OTEL_EXPORTER_OTLP_ENDPOINT;
  return { enabled: on, conflict: conflict ? env.OTEL_EXPORTER_OTLP_ENDPOINT : null };
}
function otelSet(enable) {
  const s = readSettings();
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.ledger-otel.bak');
  s.env = s.env || {};
  if (enable) Object.assign(s.env, ENV);
  else for (const [k, v] of Object.entries(ENV)) if (s.env[k] === v) delete s.env[k];
  if (!Object.keys(s.env).length) delete s.env;
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  return otelStatus();
}

module.exports = { deleteSession, deleteProject, applyRetention, restoreExcluded, setTags, tagsOf, topics, getSettings, setSettings, logConsent, otelStatus, otelSet };
