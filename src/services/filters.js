'use strict';
// Módulo único de filtros (spec 1 — "barra global de filtros").
// F = { from, to, project, agent, model, exclude } — mesmo objeto para TODAS as telas → totais compatíveis entre telas.
// agent = nome do agente ("main" ou tipo do subagente); model = id do modelo;
// exclude = lista de projetos a TIRAR de tudo (telas e relatórios).

function norm(F = {}) {
  const n = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));
  const ex = Array.isArray(F.exclude) ? [...new Set(F.exclude.map(String).filter(Boolean))].slice(0, 200) : [];
  return { from: n(F.from), to: n(F.to), project: F.project || null, agent: F.agent || null, model: F.model || null, exclude: ex.length ? ex : null };
}

// condições comuns; `time` e `model` mudam de coluna conforme a tabela
function build(f, { time, model, a, s }) {
  const w = [], args = [];
  if (f.from != null) { w.push(`${time} >= ?`); args.push(f.from); }
  if (f.to != null) { w.push(`${time} <= ?`); args.push(f.to); }
  if (f.project) { w.push(`${s}.project_id = ?`); args.push(f.project); }
  if (f.exclude) { w.push(`${s}.project_id NOT IN (${f.exclude.map(() => '?').join(',')})`); args.push(...f.exclude); }
  if (f.agent) { w.push(`${a}.name = ?`); args.push(f.agent); }
  if (f.model) { w.push(`${model} = ?`); args.push(f.model); }
  return { sql: w.length ? w.join(' AND ') : '1=1', args };
}

// condição sobre requisições (model_requests m JOIN agents a JOIN sessions s)
const reqWhere = (F, m = 'm', a = 'a', s = 's') => build(norm(F), { time: `${m}.started_at`, model: `${m}.model`, a, s });

// condição sobre chamadas de ferramenta (tool_calls t JOIN agents a JOIN sessions s)
const toolWhere = (F, t = 't', a = 'a', s = 's') => build(norm(F), { time: `${t}.started_at`, model: `${t}.model`, a, s });

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
