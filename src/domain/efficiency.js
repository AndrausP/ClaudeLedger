'use strict';
// Fase 4 — avaliação de tarefas e eficiência (spec 4). Funções puras.
// Regra de ouro: sem evidência verificável, a tarefa fica "unreviewed" e sai do denominador.

const RULE_VERSION = 1;

// tools: tool_calls da sessão em ordem cronológica. Avaliação automática pelo ÚLTIMO comando de teste:
// passou → approved; falhou → rejected; nenhum teste → unreviewed. Cancelado/negado não é resultado.
function autoOutcome(tools) {
  const tests = tools.filter((t) => t.is_test && (t.status === 'ok' || t.status === 'erro'));
  if (!tests.length) return { outcome: 'unreviewed', evaluation_method: 'rule', evidence_ref: null, reason: 'nenhum comando de teste com resultado conhecido' };
  const last = tests[tests.length - 1];
  const passed = tests.filter((t) => t.status === 'ok').length;
  return {
    outcome: last.status === 'ok' ? 'approved' : 'rejected',
    evaluation_method: 'tests',
    evidence_ref: last.id,
    reason: `último teste ${last.status === 'ok' ? 'passou' : 'falhou'} (${passed}/${tests.length} execuções passaram)`,
  };
}

// avaliação manual (human) sempre prevalece sobre a automática
function effectiveOutcome(rows) {
  const human = rows.filter((r) => r.evaluation_method === 'human').sort((a, b) => b.evaluated_at - a.evaluated_at)[0];
  if (human) return human;
  return rows.filter((r) => r.evaluation_method !== 'human').sort((a, b) => b.evaluated_at - a.evaluated_at)[0] || { outcome: 'unreviewed', evaluation_method: 'rule' };
}

const median = (a) => quantile(a, 0.5);
function quantile(arr, q) {
  const s = arr.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const ratio = (num, den) => (den ? num / den : null);

// sessions: [{ outcome, cost, cost_complete, start_at, end_at, tools_ok, tools_err, cache_read, input_total }]
function metrics(sessions, { minSample = 5 } = {}) {
  const evaluated = sessions.filter((s) => ['approved', 'rejected', 'partial'].includes(s.outcome));
  const approved = sessions.filter((s) => s.outcome === 'approved');
  const partial = sessions.filter((s) => s.outcome === 'partial');
  const costKnown = sessions.every((s) => s.cost_complete);
  const totalCost = sessions.reduce((a, s) => a + (s.cost || 0), 0);
  const durations = sessions.filter((s) => s.start_at != null && s.end_at != null && s.end_at >= s.start_at).map((s) => s.end_at - s.start_at);
  const toolsOk = sessions.reduce((a, s) => a + (s.tools_ok || 0), 0), toolsErr = sessions.reduce((a, s) => a + (s.tools_err || 0), 0);
  const cacheRead = sessions.reduce((a, s) => a + (s.cache_read || 0), 0), inputTotal = sessions.reduce((a, s) => a + (s.input_total || 0), 0);
  return {
    n: sessions.length,
    evaluated: evaluated.length,
    approved: approved.length,
    // parcial conta no denominador, não no numerador (regra explícita)
    success_rate: ratio(approved.length, evaluated.length),
    partial: partial.length,
    coverage: ratio(evaluated.length, sessions.length),
    cost_total: totalCost,
    cost_complete: costKnown,
    cost_per_approved: approved.length ? totalCost / approved.length : null,
    tool_failure_rate: ratio(toolsErr, toolsOk + toolsErr),
    duration_median: median(durations),
    duration_p90: quantile(durations, 0.9),
    duration_n: durations.length,
    cache_read_share: ratio(cacheRead, inputTotal),
    insufficient: evaluated.length < minSample,
  };
}

module.exports = { autoOutcome, effectiveOutcome, metrics, quantile, median, RULE_VERSION };
