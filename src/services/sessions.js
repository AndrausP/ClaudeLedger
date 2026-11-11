'use strict';
// Leitura de sessões e timeline (spec 2 e contratos da seção 8). Só leitura.
const { reconcile } = require('../domain/pricing');
const { sessionIn } = require('./filters');

const EVENT_TYPES = ['user_prompt', 'model_response', 'tool_call', 'compaction', 'turn', 'api_error'];

function list(db, F = {}) {
  const si = sessionIn(F);
  const where = [si.sql], args = [...si.args];
  return db.prepare(`
    SELECT s.id, s.title, s.project_id, p.name AS project, s.start_at, s.end_at, s.source_completeness,
      (SELECT count(*) FROM model_requests m WHERE m.session_id = s.id) AS requests,
      (SELECT sum(m.recalculated_cost) FROM model_requests m WHERE m.session_id = s.id) AS cost,
      (SELECT count(*) FROM model_requests m WHERE m.session_id = s.id AND m.recalculated_cost IS NULL) AS unpriced,
      (SELECT count(*) FROM tool_calls t WHERE t.session_id = s.id) AS tools,
      (SELECT count(*) FROM tool_calls t WHERE t.session_id = s.id AND t.status = 'erro') AS tool_errors,
      (SELECT count(*) FROM agents a WHERE a.session_id = s.id AND a.kind = 'subagent') AS subagents,
      (SELECT count(*) FROM diagnostics d WHERE d.session_id = s.id AND d.status = 'aberto' AND COALESCE(d.feedback, '') NOT IN ('falso_positivo', 'ignorado')) AS findings,
      (SELECT max(CASE d.severity WHEN 'crítico' THEN 3 WHEN 'atenção' THEN 2 ELSE 1 END) FROM diagnostics d WHERE d.session_id = s.id AND d.status = 'aberto' AND COALESCE(d.feedback, '') NOT IN ('falso_positivo', 'ignorado')) AS worst
    FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
    WHERE ${where.join(' AND ')} AND EXISTS (SELECT 1 FROM session_events e WHERE e.session_id = s.id)
    ORDER BY s.start_at DESC`).all(...args);
}

function get(db, id, tolerance) {
  const s = db.prepare('SELECT s.*, p.name AS project, p.root_path FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?').get(id);
  if (!s) return null;
  const req = db.prepare(`SELECT count(*) n, sum(tokens_in) tin, sum(tokens_out) tout, sum(cache_read) cr, sum(cache_w5m) w5, sum(cache_w1h) w1,
    sum(recalculated_cost) cost, sum(CASE WHEN recalculated_cost IS NULL THEN 1 ELSE 0 END) unpriced FROM model_requests WHERE session_id = ?`).get(id);
  const tools = db.prepare(`SELECT count(*) n, sum(status = 'erro') err, sum(status = 'negado') denied, sum(status = 'cancelado') cancelled, sum(is_test) tests FROM tool_calls WHERE session_id = ?`).get(id);
  const ev = Object.fromEntries(db.prepare('SELECT type, count(*) n FROM session_events WHERE session_id = ? GROUP BY type').all(id).map((r) => [r.type, r.n]));
  const agents = db.prepare(`SELECT a.id, a.name, a.kind, a.tool_use_id,
      (SELECT count(*) FROM model_requests m WHERE m.agent_id = a.id) requests, (SELECT sum(recalculated_cost) FROM model_requests m WHERE m.agent_id = a.id) cost,
      (SELECT min(at) FROM session_events e WHERE e.agent_id = a.id) start_at, (SELECT max(COALESCE(end_at, at)) FROM session_events e WHERE e.agent_id = a.id) end_at
    FROM agents a WHERE a.session_id = ? ORDER BY a.kind DESC, start_at`).all(id);
  const models = db.prepare('SELECT model, count(*) n, sum(recalculated_cost) cost FROM model_requests WHERE session_id = ? GROUP BY model ORDER BY cost DESC').all(id);
  return { session: s, requests: req, tools, events: ev, agents, models, reconciliation: reconciliation(db, id, tolerance) };
}

// reportado (cost-state do Claude Code) × recalculado (tabela de preços), por modelo e total
function reconciliation(db, id, tolerance) {
  const rep = db.prepare('SELECT model, reported_cost, has_unknown_cost FROM session_cost_reports WHERE session_id = ?').all(id);
  const calc = Object.fromEntries(db.prepare('SELECT model, sum(recalculated_cost) c, sum(recalculated_cost IS NULL) missing FROM model_requests WHERE session_id = ? GROUP BY model').all(id).map((r) => [r.model, r]));
  if (!rep.length) return { status: 'insufficient_data', reason: 'Sessão sem snapshot de custo (cost-state) no transcrito.', rows: [] };
  const rows = rep.filter((r) => r.model !== '*').map((r) => {
    const c = calc[r.model];
    const recalculated = c && !c.missing ? c.c : null;
    return { model: r.model, reported: r.reported_cost, recalculated, ...reconcile(r.reported_cost, recalculated, tolerance) };
  });
  const tot = rep.find((r) => r.model === '*');
  const totCalc = Object.values(calc).some((c) => c.missing) ? null : Object.values(calc).reduce((a, c) => a + (c.c || 0), 0);
  const total = { model: 'total', reported: tot ? tot.reported_cost : null, recalculated: totCalc, ...reconcile(tot ? tot.reported_cost : null, totCalc, tolerance) };
  return { status: total.status, unknownModelCost: !!(tot && tot.has_unknown_cost), rows, total };
}

function where(id, f = {}) {
  const w = ['e.session_id = ?'], a = [id];
  if (f.types && f.types.length) { w.push(`e.type IN (${f.types.map(() => '?').join(',')})`); a.push(...f.types); }
  if (f.agents && f.agents.length) { w.push(`e.agent_id IN (${f.agents.map(() => '?').join(',')})`); a.push(...f.agents); }
  if (f.status && f.status.length) { w.push(`COALESCE(e.status, 'desconhecido') IN (${f.status.map(() => '?').join(',')})`); a.push(...f.status); }
  if (f.q) { w.push('(e.payload_sanitized LIKE ? OR ag.name LIKE ?)'); a.push('%' + f.q + '%', '%' + f.q + '%'); }
  return { sql: w.join(' AND '), args: a };
}

function timeline(db, id, f = {}) {
  const size = Math.max(1, Math.min(500, f.size || 50));
  const { sql, args } = where(id, f);
  const total = db.prepare(`SELECT count(*) n FROM session_events e LEFT JOIN agents ag ON ag.id = e.agent_id WHERE ${sql}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(0, f.page || 0), pages - 1);
  const items = db.prepare(`SELECT e.*, ag.name AS agent_name, ag.kind AS agent_kind FROM session_events e LEFT JOIN agents ag ON ag.id = e.agent_id
    WHERE ${sql} ORDER BY e.at, e.id LIMIT ? OFFSET ?`).all(...args, size, page * size)
    .map((e) => ({ ...e, payload: e.payload_sanitized ? JSON.parse(e.payload_sanitized) : null, payload_sanitized: undefined }));
  return { items, total, page, pages, size };
}

// em qual página (com os filtros atuais) está o evento — para "Ir à evidência"
function pageOfEvent(db, id, eventId, f = {}) {
  const e = db.prepare('SELECT at, id FROM session_events WHERE id = ? AND session_id = ?').get(eventId, id);
  if (!e) return null;
  const { sql, args } = where(id, f);
  const before = db.prepare(`SELECT count(*) n FROM session_events e LEFT JOIN agents ag ON ag.id = e.agent_id WHERE ${sql} AND (e.at < ? OR (e.at = ? AND e.id < ?))`).get(...args, e.at, e.at, e.id).n;
  return Math.floor(before / Math.max(1, f.size || 50));
}

function event(db, id) {
  const e = db.prepare('SELECT e.*, ag.name AS agent_name FROM session_events e LEFT JOIN agents ag ON ag.id = e.agent_id WHERE e.id = ?').get(id);
  if (!e) return null;
  const payload = e.payload_sanitized ? JSON.parse(e.payload_sanitized) : null;
  const tool = payload && payload.tool_use_id ? db.prepare('SELECT tool_name, target_label, input_hash, started_at, ended_at, duration_precision, status, error_signature, is_test FROM tool_calls WHERE id = ?').get(payload.tool_use_id) : null;
  const findings = db.prepare(`SELECT id, rule_id, severity, title FROM diagnostics WHERE session_id = ? AND EXISTS (SELECT 1 FROM json_each(evidence_ids) j WHERE j.value = ?)`).all(e.session_id, e.id);
  return { ...e, payload, payload_sanitized: undefined, tool, findings };
}

function ingestionStatus(db) {
  return {
    files: db.prepare('SELECT count(*) n, sum(error IS NOT NULL) errors, max(last_seen_at) last FROM ingestion_state').get(),
    errors: db.prepare('SELECT source_id, error FROM ingestion_state WHERE error IS NOT NULL LIMIT 20').all(),
    sources: [
      { id: 'transcript', label: 'Transcritos locais', status: 'ativo' },
      { id: 'otel', label: 'OpenTelemetry', status: 'não configurado' },
      { id: 'status_line', label: 'Status line (limites do plano)', status: 'não configurado' },
      { id: 'hooks', label: 'Hooks', status: 'não configurado' },
    ],
  };
}

module.exports = { EVENT_TYPES, list, get, reconciliation, timeline, pageOfEvent, event, ingestionStatus };
