'use strict';
// Pipeline de diagnóstico (spec 3): eventos → regras versionadas → achados persistidos com evidência.
// Feedback do usuário nunca apaga a evidência; achado que deixa de ser produzido vira "obsoleto".
const { tx, getKV } = require('../db');
const { runRules, buildBaseline } = require('../domain/rules');
const { sessionIn, active } = require('./filters');

const FEEDBACK = new Set(['util', 'falso_positivo', 'ignorado']);

function baseline(db) {
  const durations = {};
  for (const r of db.prepare('SELECT tool_name, ended_at - started_at AS d FROM tool_calls WHERE ended_at IS NOT NULL AND started_at IS NOT NULL AND ended_at >= started_at').iterate()) {
    (durations[r.tool_name] ||= []).push(r.d);
  }
  const counts = db.prepare(`SELECT (SELECT count(*) FROM session_events e WHERE e.session_id = s.id AND e.type = 'compaction') n
    FROM sessions s WHERE EXISTS (SELECT 1 FROM model_requests m WHERE m.session_id = s.id)`).all().map((r) => r.n);
  return buildBaseline(durations, counts);
}

function sessionData(db, id) {
  const tools = db.prepare(`SELECT t.*, e.id AS event_id FROM tool_calls t
    LEFT JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'tool:' || t.id
    WHERE t.session_id = ? ORDER BY t.started_at, e.id`).all(id);
  const compactions = db.prepare(`SELECT id AS event_id, at FROM session_events WHERE session_id = ? AND type = 'compaction' ORDER BY at`).all(id);
  return { tools, compactions };
}

function compute(db, id, base, params) {
  const findings = runRules({ ...sessionData(db, id), baseline: base }, params);
  const now = Date.now();
  const ins = db.prepare(`INSERT INTO diagnostics(session_id, rule_id, rule_version, severity, title, explanation, recommendation, confidence, evidence_ids, evidence_fingerprint, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'aberto', ?)
    ON CONFLICT(session_id, rule_id, rule_version, evidence_fingerprint) DO UPDATE SET status = 'aberto', severity = excluded.severity, title = excluded.title, explanation = excluded.explanation`);
  tx(db, () => {
    const keep = [];
    for (const f of findings) {
      if (!f.evidence.length) continue; // achado sem evidência rastreável não é publicado
      ins.run(id, f.rule_id, f.rule_version, f.severity, f.title, f.explanation, f.recommendation, f.confidence, JSON.stringify(f.evidence), f.fingerprint, now);
      keep.push(f.rule_id + '|' + f.rule_version + '|' + f.fingerprint);
    }
    for (const d of db.prepare(`SELECT id, rule_id, rule_version, evidence_fingerprint FROM diagnostics WHERE session_id = ? AND status = 'aberto'`).all(id)) {
      if (!keep.includes(d.rule_id + '|' + d.rule_version + '|' + d.evidence_fingerprint)) db.prepare(`UPDATE diagnostics SET status = 'obsoleto' WHERE id = ?`).run(d.id);
    }
    db.prepare('UPDATE sessions SET diag_at = ? WHERE id = ?').run(now, id);
  });
  return findings.length;
}

// recalcula só sessões alteradas desde o último diagnóstico (ou todas, se force)
function computeStale(db, { force = false, sessionId = null } = {}) {
  const params = getKV(db, 'rules.params', {});
  const base = baseline(db);
  const ids = sessionId ? [sessionId] : db.prepare(`SELECT id FROM sessions WHERE ${force ? '1=1' : 'diag_at IS NULL OR diag_at < updated_at'}`).all().map((r) => r.id);
  let n = 0;
  for (const id of ids) n += compute(db, id, base, params);
  return { sessions: ids.length, findings: n };
}

const SEV = "CASE d.severity WHEN 'crítico' THEN 3 WHEN 'atenção' THEN 2 ELSE 1 END";
function list(db, { sessionId, includeClosed = false, filter } = {}) {
  const w = [], a = [];
  if (sessionId) { w.push('d.session_id = ?'); a.push(sessionId); }
  if (filter && active(filter)) { const si = sessionIn(filter); w.push(si.sql); a.push(...si.args); }
  if (!includeClosed) w.push(`d.status = 'aberto'`);
  // ev_at = quando a evidência aconteceu (eixo do tempo do dashboard); agents = quem aparece nas evidências
  return db.prepare(`SELECT d.*, s.title AS session_title, s.start_at AS session_start, p.name AS project, s.project_id,
      (SELECT min(e.at) FROM json_each(d.evidence_ids) j JOIN session_events e ON e.id = j.value) AS ev_at,
      (SELECT group_concat(DISTINCT ag.name) FROM json_each(d.evidence_ids) j JOIN session_events e ON e.id = j.value JOIN agents ag ON ag.id = e.agent_id) AS agents
    FROM diagnostics d
    JOIN sessions s ON s.id = d.session_id LEFT JOIN projects p ON p.id = s.project_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${SEV} DESC, d.created_at DESC`).all(...a)
    .map((d) => ({ ...d, evidence_ids: JSON.parse(d.evidence_ids) }));
}

function feedback(db, id, value) {
  if (value != null && !FEEDBACK.has(value)) throw new Error('feedback inválido');
  db.prepare('UPDATE diagnostics SET feedback = ? WHERE id = ?').run(value, id);
  return db.prepare('SELECT id, feedback FROM diagnostics WHERE id = ?').get(id);
}

module.exports = { computeStale, compute, list, feedback, baseline };
