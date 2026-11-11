'use strict';
// Avaliação de tarefas (task_outcomes) e indicadores de eficiência por grupo.
// Unidade de "tarefa" nesta versão = sessão (documentado na tela).
const { tx } = require('../db');
const { autoOutcome, effectiveOutcome, metrics } = require('../domain/efficiency');
const { sessionIn } = require('./filters');

const OUTCOMES = new Set(['approved', 'rejected', 'partial', 'unreviewed']);

// reavalia automaticamente sessões alteradas; nunca toca avaliações manuais
function evaluateAll(db, { force = false } = {}) {
  const sessions = db.prepare(`SELECT s.id FROM sessions s WHERE ${force ? '1=1' : `NOT EXISTS (SELECT 1 FROM task_outcomes o WHERE o.session_id = s.id AND o.evaluation_method <> 'human' AND o.evaluated_at >= COALESCE(s.updated_at, 0))`}`).all();
  const toolsOf = db.prepare('SELECT id, is_test, status FROM tool_calls WHERE session_id = ? ORDER BY started_at');
  const del = db.prepare(`DELETE FROM task_outcomes WHERE session_id = ? AND evaluation_method <> 'human'`);
  const ins = db.prepare('INSERT INTO task_outcomes(session_id, task_id, outcome, evaluation_method, evidence_ref, evaluated_at) VALUES (?,?,?,?,?,?)');
  const now = Date.now();
  tx(db, () => {
    for (const { id } of sessions) {
      const o = autoOutcome(toolsOf.all(id));
      del.run(id);
      ins.run(id, id, o.outcome, o.evaluation_method, JSON.stringify({ tool_use_id: o.evidence_ref, reason: o.reason }), now);
    }
  });
  return sessions.length;
}

function setManual(db, sessionId, outcome, note) {
  if (outcome !== null && !OUTCOMES.has(outcome)) throw new Error('resultado inválido');
  tx(db, () => {
    db.prepare(`DELETE FROM task_outcomes WHERE session_id = ? AND evaluation_method = 'human'`).run(sessionId);
    if (outcome) db.prepare('INSERT INTO task_outcomes(session_id, task_id, outcome, evaluation_method, evidence_ref, evaluated_at) VALUES (?,?,?,?,?,?)')
      .run(sessionId, sessionId, outcome, 'human', JSON.stringify({ note: note ? String(note).slice(0, 300) : null }), Date.now());
  });
  return outcomeOf(db, sessionId);
}

function outcomeOf(db, sessionId) {
  const rows = db.prepare('SELECT * FROM task_outcomes WHERE session_id = ?').all(sessionId);
  const o = effectiveOutcome(rows);
  return { ...o, evidence: o.evidence_ref ? JSON.parse(o.evidence_ref) : null, all: rows.length };
}

// linha por sessão com tudo que as fórmulas precisam
function sessionRows(db, F = {}) {
  const si = sessionIn(F);
  const w = ['EXISTS (SELECT 1 FROM model_requests m WHERE m.session_id = s.id)', si.sql], a = [...si.args];
  const rows = db.prepare(`SELECT s.id, s.title, s.project_id, p.name project, s.start_at, s.end_at,
      (SELECT sum(recalculated_cost) FROM model_requests m WHERE m.session_id = s.id) cost,
      (SELECT count(*) = 0 FROM model_requests m WHERE m.session_id = s.id AND m.recalculated_cost IS NULL) cost_complete,
      (SELECT sum(cache_read) FROM model_requests m WHERE m.session_id = s.id) cache_read,
      (SELECT sum(tokens_in + cache_read + cache_w5m + cache_w1h) FROM model_requests m WHERE m.session_id = s.id) input_total,
      (SELECT model FROM model_requests m WHERE m.session_id = s.id GROUP BY model ORDER BY count(*) DESC LIMIT 1) model,
      (SELECT count(*) FROM tool_calls t WHERE t.session_id = s.id AND t.status = 'ok') tools_ok,
      (SELECT count(*) FROM tool_calls t WHERE t.session_id = s.id AND t.status = 'erro') tools_err,
      (SELECT group_concat(DISTINCT a.name) FROM agents a WHERE a.session_id = s.id AND a.kind = 'subagent') subagents
    FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE ${w.join(' AND ')}`).all(...a);
  const outs = db.prepare('SELECT * FROM task_outcomes WHERE session_id = ?');
  return rows.map((r) => { const o = effectiveOutcome(outs.all(r.id)); return { ...r, cost_complete: !!r.cost_complete, outcome: o.outcome, evaluation_method: o.evaluation_method }; });
}

function analyze(db, { groupBy = 'project', ...f } = {}) {
  const rows = sessionRows(db, f);
  const key = { project: (r) => r.project || r.project_id, model: (r) => r.model || '—', agent: (r) => (r.subagents ? 'com subagentes' : 'só main') }[groupBy] || ((r) => r.project);
  const groups = new Map();
  for (const r of rows) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  // tendência semanal de custo por tarefa aprovada
  const weeks = new Map();
  for (const r of rows) {
    if (r.start_at == null) continue;
    const d = new Date(r.start_at); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = d.getTime();
    if (!weeks.has(k)) weeks.set(k, []);
    weeks.get(k).push(r);
  }
  return {
    overall: metrics(rows),
    groups: [...groups].map(([k, rs]) => ({ key: k, ...metrics(rs) })),
    trend: [...weeks].sort((a, b) => a[0] - b[0]).map(([k, rs]) => ({ week: k, ...metrics(rs) })),
    sessions: rows,
  };
}

module.exports = { evaluateAll, setManual, outcomeOf, analyze, sessionRows };
