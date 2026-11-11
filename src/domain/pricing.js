'use strict';
// Custo equivalente de API (spec 5 — "Cálculo independente"). Funções puras.
// Preços em USD por 1M tokens. Cache: se a tabela não informar, usa os multiplicadores padrão da API.
const DEFAULT_MULT = { cache_read: 0.1, cache_w5m: 1.25, cache_w1h: 2 };

function priceFor(rows, model) {
  return (rows || []).find((p) => p && p.match && String(model).includes(p.match)) || null;
}

// req: { model, tokens_in, tokens_out, cache_read, cache_w5m, cache_w1h }
// → { cost: number|null, status: 'ok'|'sem_preco'|'tokens_ausentes' }
function costOf(req, rows) {
  const p = priceFor(rows, req.model);
  if (!p || !(p.in >= 0) || !(p.out >= 0)) return { cost: null, status: 'sem_preco' };
  const n = ['tokens_in', 'tokens_out', 'cache_read', 'cache_w5m', 'cache_w1h'].map((k) => req[k]);
  if (n.some((x) => x == null || isNaN(x))) return { cost: null, status: 'tokens_ausentes' };
  const pr = {
    cache_read: p.cache_read ?? p.in * DEFAULT_MULT.cache_read,
    cache_w5m: p.cache_w5m ?? p.in * DEFAULT_MULT.cache_w5m,
    cache_w1h: p.cache_w1h ?? p.in * DEFAULT_MULT.cache_w1h,
  };
  // cada classe de token entra uma única vez
  const cost = (req.tokens_in * p.in + req.tokens_out * p.out + req.cache_read * pr.cache_read + req.cache_w5m * pr.cache_w5m + req.cache_w1h * pr.cache_w1h) / 1e6;
  return { cost, status: 'ok' };
}

// versão vigente no instante t: maior effective_from <= t
function versionAt(versions, t) {
  let best = null;
  for (const v of versions) if (v.effective_from <= t && (!best || v.effective_from > best.effective_from)) best = v;
  return best;
}

// reconciliação reportado × recalculado
function reconcile(reported, recalculated, { tolerancePct = 2, toleranceAbs = 0.01 } = {}) {
  if (reported == null || recalculated == null) return { status: 'insufficient_data', diff: null, diffPct: null };
  const diff = recalculated - reported;
  const diffPct = reported ? (diff / reported) * 100 : null;
  const ok = Math.abs(diff) <= toleranceAbs || (diffPct != null && Math.abs(diffPct) <= tolerancePct);
  return { status: ok ? 'validated' : 'divergent', diff, diffPct };
}

module.exports = { priceFor, costOf, versionAt, reconcile, DEFAULT_MULT };
