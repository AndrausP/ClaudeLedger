'use strict';
// Módulo único de filtros (spec 1 — "barra global de filtros").
// F = { from, to, project, agent, model } — mesmo objeto para TODAS as telas → totais compatíveis entre telas.
// agent = nome do agente ("main" ou tipo do subagente); model = id do modelo.

function norm(F = {}) {
  const n = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));
  return { from: n(F.from), to: n(F.to), project: F.project || null, agent: F.agent || null, model: F.model || null };
}

// condição sobre requisições (model_requests m JOIN agents a JOIN sessions s)
function reqWhere(F, m = 'm', a = 'a', s = 's') {
  const f = norm(F), w = [], args = [];
  if (f.from != null) { w.push(`${m}.started_at >= ?`); args.push(f.from); }
  if (f.to != null) { w.push(`${m}.started_at <= ?`); args.push(f.to); }
  if (f.project) { w.push(`${s}.project_id = ?`); args.push(f.project); }
  if (f.agent) { w.push(`${a}.name = ?`); args.push(f.agent); }
  if (f.model) { w.push(`${m}.model = ?`); args.push(f.model); }
  return { sql: w.length ? w.join(' AND ') : '1=1', args };
}

// condição sobre chamadas de ferramenta (tool_calls t JOIN agents a JOIN sessions s)
function toolWhere(F, t = 't', a = 'a', s = 's') {
  const f = norm(F), w = [], args = [];
  if (f.from != null) { w.push(`${t}.started_at >= ?`); args.push(f.from); }
  if (f.to != null) { w.push(`${t}.started_at <= ?`); args.push(f.to); }
  if (f.project) { w.push(`${s}.project_id = ?`); args.push(f.project); }
  if (f.agent) { w.push(`${a}.name = ?`); args.push(f.agent); }
  if (f.model) { w.push(`${t}.model = ?`); args.push(f.model); }
  return { sql: w.length ? w.join(' AND ') : '1=1', args };
}

// sessões que têm ao menos uma requisição dentro do filtro (para telas por sessão)
function sessionIn(F, sAlias = 's') {
  const r = reqWhere(F, 'mf', 'af', 'sf');
  return {
    sql: `${sAlias}.id IN (SELECT mf.session_id FROM model_requests mf JOIN agents af ON af.id = mf.agent_id JOIN sessions sf ON sf.id = mf.session_id WHERE ${r.sql})`,
    args: r.args,
  };
}

const active = (F) => Object.values(norm(F)).some((v) => v != null);

module.exports = { norm, reqWhere, toolWhere, sessionIn, active };
