'use strict';
// Agentes (lista + detalhe) e Auditoria (visão geral, respostas, ferramentas, erros). Tudo sob o filtro global F.
// "Acurácia de ferramentas" = ok ÷ (ok + erro). Negadas e canceladas ficam fora (não são falha técnica) e são mostradas à parte.
const { reqWhere, toolWhere, sessionIn } = require('./filters');
const { effectiveOutcome, quantile } = require('../domain/efficiency');

const BUILTIN = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite', 'ToolSearch', 'AskUserQuestion', 'Monitor', 'TaskStop', 'ExitPlanMode', 'EnterPlanMode']);
function category(tool) {
  if (!tool) return 'outra';
  if (tool.startsWith('mcp__')) return 'mcp';
  if (tool === 'Skill') return 'skill';
  if (tool === 'Agent' || tool === 'Task') return 'subagente';
  return BUILTIN.has(tool) ? 'nativa' : 'outra';
}
const acc = (ok, err) => (ok + err ? ok / (ok + err) : null);
const day = "strftime('%Y-%m-%d', {c} / 1000, 'unixepoch', 'localtime')";

function outcomeMap(db, sessionIds) {
  const st = db.prepare('SELECT * FROM task_outcomes WHERE session_id = ?');
  const out = new Map();
  for (const id of sessionIds) out.set(id, effectiveOutcome(st.all(id)).outcome);
  return out;
}
function taskStats(outcomes) {
  let ap = 0, ev = 0;
  for (const o of outcomes) { if (['approved', 'rejected', 'partial'].includes(o)) ev++; if (o === 'approved') ap++; }
  return { evaluated: ev, approved: ap, task_success: ev ? ap / ev : null, sessions: outcomes.length };
}

// ---------- AGENTES ----------
function agents(db, F = {}) {
  const r = reqWhere(F), t = toolWhere(F);
  const req = db.prepare(`SELECT a.name, max(a.kind) kind, count(*) requests, sum(m.recalculated_cost) cost, sum(m.recalculated_cost IS NULL) unpriced,
      sum(m.tokens_in) tin, sum(m.tokens_out) tout, sum(m.cache_read) cr, sum(m.cache_w5m + m.cache_w1h) cw,
      count(DISTINCT m.session_id) sessions, count(DISTINCT a.id) executions, min(m.started_at) first_at, max(m.started_at) last_at,
      group_concat(DISTINCT m.model) models
    FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} GROUP BY a.name`).all(...r.args);
  const tools = Object.fromEntries(db.prepare(`SELECT a.name, count(*) calls, sum(t.status = 'ok') ok, sum(t.status = 'erro') err, sum(t.status = 'negado') denied,
      sum(t.status = 'cancelado') cancelled, sum(t.is_test) tests, count(DISTINCT t.tool_name) distinct_tools
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id WHERE ${t.sql} GROUP BY a.name`).all(...t.args).map((x) => [x.name, x]));
  const sessByAgent = new Map();
  for (const x of db.prepare(`SELECT DISTINCT a.name, m.session_id FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql}`).all(...r.args)) {
    if (!sessByAgent.has(x.name)) sessByAgent.set(x.name, []);
    sessByAgent.get(x.name).push(x.session_id);
  }
  const om = outcomeMap(db, [...new Set([...sessByAgent.values()].flat())]);
  // duração de cada execução (início/fim dos eventos do agente)
  const durs = new Map();
  for (const x of db.prepare(`SELECT a.name, a.id, min(e.at) s0, max(COALESCE(e.end_at, e.at)) s1 FROM session_events e JOIN agents a ON a.id = e.agent_id JOIN sessions s ON s.id = e.session_id
      WHERE ${r.sql.replace(/m\.started_at/g, 'e.at').replace(/m\.model = \?/g, 'EXISTS (SELECT 1 FROM model_requests mm WHERE mm.agent_id = a.id AND mm.model = ?)')} GROUP BY a.id`).all(...r.args)) {
    if (!durs.has(x.name)) durs.set(x.name, []);
    durs.get(x.name).push(x.s1 - x.s0);
  }
  return req.map((a) => {
    const tl = tools[a.name] || { calls: 0, ok: 0, err: 0, denied: 0, cancelled: 0, tests: 0, distinct_tools: 0 };
    const ts = taskStats((sessByAgent.get(a.name) || []).map((id) => om.get(id)));
    const d = durs.get(a.name) || [];
    return {
      ...a, ...tl, tokens: (a.tin || 0) + (a.tout || 0) + (a.cr || 0) + (a.cw || 0),
      accuracy: acc(tl.ok, tl.err), denied_rate: tl.calls ? tl.denied / tl.calls : null,
      cost_per_exec: a.executions ? (a.cost || 0) / a.executions : null,
      calls_per_exec: a.executions ? tl.calls / a.executions : null,
      duration_median: quantile(d, 0.5), duration_p90: quantile(d, 0.9),
      ...ts,
    };
  });
}

function agentDetail(db, name, F = {}) {
  const FF = { ...F, agent: name };
  const summary = agents(db, FF)[0] || null;
  const r = reqWhere(FF), t = toolWhere(FF);
  const models = db.prepare(`SELECT m.model, count(*) n, sum(m.recalculated_cost) cost, sum(m.tokens_out) tout FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} GROUP BY m.model ORDER BY n DESC`).all(...r.args);
  const toolRows = db.prepare(`SELECT t.tool_name, t.status, t.started_at, t.ended_at, t.target_label, json_extract(e.payload_sanitized, '$.label') label, e.id event_id
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id
    LEFT JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'tool:' || t.id WHERE ${t.sql}`).all(...t.args);
  const byTool = new Map();
  for (const x of toolRows) {
    let g = byTool.get(x.tool_name);
    if (!g) byTool.set(x.tool_name, (g = { tool: x.tool_name, category: category(x.tool_name), calls: 0, ok: 0, err: 0, denied: 0, cancelled: 0, durs: [], targets: new Map(), last: 0 }));
    g.calls++; if (x.status === 'ok') g.ok++; else if (x.status === 'erro') g.err++; else if (x.status === 'negado') g.denied++; else if (x.status === 'cancelado') g.cancelled++;
    if (x.started_at != null && x.ended_at != null && x.ended_at >= x.started_at) g.durs.push(x.ended_at - x.started_at);
    const tg = x.target_label || x.label;
    if (tg) g.targets.set(tg, (g.targets.get(tg) || 0) + 1);
    if (x.started_at > g.last) g.last = x.started_at;
  }
  const tools = [...byTool.values()].map((g) => ({
    tool: g.tool, category: g.category, calls: g.calls, ok: g.ok, err: g.err, denied: g.denied, cancelled: g.cancelled, accuracy: acc(g.ok, g.err),
    duration_median: quantile(g.durs, 0.5), duration_p90: quantile(g.durs, 0.9), last: g.last,
    top_targets: [...g.targets].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ target: k, n: v })),
  })).sort((a, b) => b.calls - a.calls);
  const categories = {};
  for (const x of tools) { const c = categories[x.category] || (categories[x.category] = { calls: 0, ok: 0, err: 0 }); c.calls += x.calls; c.ok += x.ok; c.err += x.err; }
  const errors = db.prepare(`SELECT t.tool_name, t.error_signature, count(*) n, max(t.started_at) last, min(e.id) sample_event, min(t.session_id) session_id
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id
    LEFT JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'tool:' || t.id
    WHERE ${t.sql} AND t.status = 'erro' GROUP BY t.tool_name, t.error_signature ORDER BY n DESC LIMIT 30`).all(...t.args);
  const daily = db.prepare(`SELECT ${day.replace('{c}', 'm.started_at')} d, count(*) requests, sum(m.recalculated_cost) cost FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} GROUP BY d ORDER BY d`).all(...r.args);
  const dailyTools = Object.fromEntries(db.prepare(`SELECT ${day.replace('{c}', 't.started_at')} d, count(*) calls, sum(t.status = 'ok') ok, sum(t.status = 'erro') err FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id WHERE ${t.sql} GROUP BY d`).all(...t.args).map((x) => [x.d, x]));
  const sessions = db.prepare(`SELECT s.id, s.title, s.start_at, s.end_at, p.name project, count(*) requests, sum(m.recalculated_cost) cost,
      (SELECT count(*) FROM tool_calls tt JOIN agents aa ON aa.id = tt.agent_id WHERE tt.session_id = s.id AND aa.name = ?) tools,
      (SELECT count(*) FROM tool_calls tt JOIN agents aa ON aa.id = tt.agent_id WHERE tt.session_id = s.id AND aa.name = ? AND tt.status = 'erro') errors
    FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id LEFT JOIN projects p ON p.id = s.project_id
    WHERE ${r.sql} GROUP BY s.id ORDER BY s.start_at DESC`).all(name, name, ...r.args);
  const om = outcomeMap(db, sessions.map((x) => x.id));
  for (const x of sessions) x.outcome = om.get(x.id);
  // execuções (subagente): quem chamou, quanto durou, quanto custou
  const executions = db.prepare(`SELECT a.id, a.session_id, a.tool_use_id, s.title,
      (SELECT min(at) FROM session_events e WHERE e.agent_id = a.id) start_at, (SELECT max(COALESCE(end_at, at)) FROM session_events e WHERE e.agent_id = a.id) end_at,
      (SELECT count(*) FROM model_requests mm WHERE mm.agent_id = a.id) requests, (SELECT sum(recalculated_cost) FROM model_requests mm WHERE mm.agent_id = a.id) cost,
      (SELECT count(*) FROM tool_calls tt WHERE tt.agent_id = a.id) tools, (SELECT count(*) FROM tool_calls tt WHERE tt.agent_id = a.id AND tt.status = 'erro') errors,
      (SELECT e.id FROM session_events e WHERE e.source = 'transcript' AND e.source_event_id = 'tool:' || a.tool_use_id) parent_event
    FROM agents a JOIN sessions s ON s.id = a.session_id WHERE a.name = ? AND a.kind = 'subagent' AND ${sessionIn(F).sql} ORDER BY start_at DESC LIMIT 500`).all(name, ...sessionIn(F).args);
  const diagnostics = db.prepare(`SELECT DISTINCT d.id, d.session_id, d.rule_id, d.severity, d.title, d.feedback FROM diagnostics d
    JOIN json_each(d.evidence_ids) j JOIN session_events e ON e.id = j.value JOIN agents a ON a.id = e.agent_id
    WHERE a.name = ? AND d.status = 'aberto' ORDER BY CASE d.severity WHEN 'crítico' THEN 3 WHEN 'atenção' THEN 2 ELSE 1 END DESC LIMIT 50`).all(name);
  return { name, summary, models, tools, categories, errors, daily: daily.map((x) => ({ ...x, ...(dailyTools[x.d] || { calls: 0, ok: 0, err: 0 }) })), sessions, executions, diagnostics };
}

// ---------- AUDITORIA ----------
function auditOverview(db, F = {}) {
  const r = reqWhere(F), t = toolWhere(F), si = sessionIn(F);
  const tot = db.prepare(`SELECT count(*) requests, count(DISTINCT m.session_id) sessions, sum(m.recalculated_cost) cost, sum(m.recalculated_cost IS NULL) unpriced,
      sum(m.tokens_in) tin, sum(m.tokens_out) tout, sum(m.cache_read) cr, sum(m.cache_w5m + m.cache_w1h) cw
    FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql}`).get(...r.args);
  const tl = db.prepare(`SELECT count(*) calls, sum(t.status = 'ok') ok, sum(t.status = 'erro') err, sum(t.status = 'negado') denied, sum(t.status = 'cancelado') cancelled, sum(t.status = 'desconhecido') unknown, sum(t.is_test) tests
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id WHERE ${t.sql}`).get(...t.args);
  const ev = Object.fromEntries(db.prepare(`SELECT e.type, count(*) n FROM session_events e JOIN sessions s ON s.id = e.session_id WHERE ${si.sql} AND e.type IN ('api_error','compaction','user_prompt') GROUP BY e.type`).all(...si.args).map((x) => [x.type, x.n]));
  const byModel = db.prepare(`SELECT m.model, count(*) requests, sum(m.recalculated_cost) cost, sum(m.tokens_out) tout, sum(m.cache_read) cr FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} GROUP BY m.model ORDER BY requests DESC`).all(...r.args);
  const byTool = db.prepare(`SELECT t.tool_name tool, count(*) calls, sum(t.status = 'ok') ok, sum(t.status = 'erro') err, sum(t.status = 'negado') denied, count(DISTINCT t.session_id) sessions
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id WHERE ${t.sql} GROUP BY t.tool_name ORDER BY calls DESC`).all(...t.args)
    .map((x) => ({ ...x, category: category(x.tool), accuracy: acc(x.ok, x.err) }));
  const categories = {};
  for (const x of byTool) { const c = categories[x.category] || (categories[x.category] = { calls: 0, ok: 0, err: 0, tools: 0 }); c.calls += x.calls; c.ok += x.ok; c.err += x.err; c.tools++; }
  const daily = db.prepare(`SELECT ${day.replace('{c}', 'm.started_at')} d, count(*) requests, sum(m.recalculated_cost) cost FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} GROUP BY d ORDER BY d`).all(...r.args);
  const dailyTools = Object.fromEntries(db.prepare(`SELECT ${day.replace('{c}', 't.started_at')} d, count(*) calls, sum(t.status = 'ok') ok, sum(t.status = 'erro') err FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id WHERE ${t.sql} GROUP BY d`).all(...t.args).map((x) => [x.d, x]));
  const sids = db.prepare(`SELECT s.id FROM sessions s WHERE ${si.sql}`).all(...si.args).map((x) => x.id);
  return {
    totals: { ...tot, ...tl, accuracy: acc(tl.ok || 0, tl.err || 0), api_errors: ev.api_error || 0, compactions: ev.compaction || 0, prompts: ev.user_prompt || 0, ...taskStats([...outcomeMap(db, sids).values()]) },
    byModel, byTool, categories, agents: agents(db, F),
    daily: daily.map((x) => { const tt = dailyTools[x.d] || { calls: 0, ok: 0, err: 0 }; return { ...x, ...tt, accuracy: acc(tt.ok, tt.err) }; }),
  };
}

function responses(db, F = {}, limit = 30000) {
  const r = reqWhere(F);
  // agrega ferramentas por resposta numa passada só (subconsulta por linha levava ~30 s em 7 mil respostas)
  return db.prepare(`WITH tc AS (SELECT request_id, group_concat(tool_name, ', ') tools, sum(status = 'erro') errs FROM tool_calls WHERE request_id IS NOT NULL GROUP BY request_id)
    SELECT m.id, m.session_id, s.title, a.name agent, a.kind, m.model, m.started_at at, m.tokens_in, m.tokens_out, m.cache_read, m.cache_w5m + m.cache_w1h cache_write,
      m.recalculated_cost cost, m.reported_cost, m.cost_status, tc.tools, COALESCE(tc.errs, 0) tool_errors, e.id event_id
    FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id
    LEFT JOIN tc ON tc.request_id = m.request_id
    LEFT JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'msg:' || m.request_id
    WHERE ${r.sql} ORDER BY m.started_at DESC LIMIT ?`).all(...r.args, limit);
}

function toolCalls(db, F = {}, limit = 30000) {
  const t = toolWhere(F);
  return db.prepare(`SELECT t.id, t.session_id, s.title, a.name agent, t.model, t.tool_name tool, t.status, t.started_at at,
      CASE WHEN t.ended_at >= t.started_at THEN t.ended_at - t.started_at END duration, t.error_signature, t.is_test,
      COALESCE(t.target_label, json_extract(e.payload_sanitized, '$.label')) target, e.id event_id
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id
    LEFT JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'tool:' || t.id
    WHERE ${t.sql} ORDER BY t.started_at DESC LIMIT ?`).all(...t.args, limit).map((x) => ({ ...x, category: category(x.tool) }));
}

function errors(db, F = {}) {
  const t = toolWhere(F);
  return db.prepare(`SELECT t.tool_name tool, t.error_signature signature, count(*) n, count(DISTINCT t.session_id) sessions, group_concat(DISTINCT a.name) agents,
      min(t.started_at) first_at, max(t.started_at) last_at, max(e.id) sample_event, max(t.session_id) sample_session,
      sum(CASE WHEN t.input_hash IN (SELECT t2.input_hash FROM tool_calls t2 WHERE t2.status = 'erro' AND t2.tool_name = t.tool_name AND t2.error_signature = t.error_signature GROUP BY t2.input_hash HAVING count(*) > 1) THEN 1 ELSE 0 END) repeated_same_input
    FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id
    LEFT JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'tool:' || t.id
    WHERE ${t.sql} AND t.status = 'erro' GROUP BY t.tool_name, t.error_signature ORDER BY n DESC`).all(...t.args)
    .map((x) => ({ ...x, category: category(x.tool) }));
}

// opções para o módulo de filtros
function filterOptions(db) {
  return {
    projects: db.prepare(`SELECT p.id, p.name, p.root_path, count(DISTINCT s.id) sessions FROM projects p JOIN sessions s ON s.project_id = p.id GROUP BY p.id ORDER BY p.name`).all(),
    agents: db.prepare(`SELECT a.name, max(a.kind) kind, count(DISTINCT a.session_id) sessions FROM agents a WHERE EXISTS (SELECT 1 FROM model_requests m WHERE m.agent_id = a.id) GROUP BY a.name ORDER BY max(a.kind) = 'subagent', a.name`).all(),
    models: db.prepare(`SELECT model, count(*) n FROM model_requests GROUP BY model ORDER BY n DESC`).all(),
    range: db.prepare('SELECT min(start_at) min, max(end_at) max FROM sessions').get(),
  };
}

module.exports = { agents, agentDetail, auditOverview, responses, toolCalls, errors, filterOptions, category };
