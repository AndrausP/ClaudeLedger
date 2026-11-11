'use strict';
// Custos e assinatura (spec 5): equivalente de API ≠ fatura ≠ limite do plano. Sempre separados.
const { getKV } = require('../db');
const { reconcile } = require('../domain/pricing');
const { reqWhere, sessionIn } = require('./filters');

const range = (f) => reqWhere(f);

function summary(db, f = {}) {
  const { sql, args } = range(f);
  const base = `FROM model_requests m JOIN sessions s ON s.id = m.session_id JOIN agents a ON a.id = m.agent_id WHERE ${sql}`;
  const tot = db.prepare(`SELECT count(*) n, sum(m.recalculated_cost) cost, sum(m.recalculated_cost IS NULL) unpriced, sum(m.tokens_in) tin, sum(m.tokens_out) tout, sum(m.cache_read) cr, sum(m.cache_w5m + m.cache_w1h) cw ${base}`).get(...args);
  const byModel = db.prepare(`SELECT m.model, count(*) n, sum(m.recalculated_cost) cost, sum(m.recalculated_cost IS NULL) unpriced ${base} GROUP BY m.model ORDER BY cost DESC`).all(...args);
  const byAgent = db.prepare(`SELECT COALESCE(a.name, 'não atribuído') agent, a.kind, count(*) n, sum(m.recalculated_cost) cost ${base} GROUP BY a.name, a.kind ORDER BY cost DESC`).all(...args);
  const daily = db.prepare(`SELECT strftime('%Y-%m-%d', m.started_at / 1000, 'unixepoch', 'localtime') day, sum(m.recalculated_cost) cost, sum(m.tokens_in + m.tokens_out + m.cache_read + m.cache_w5m + m.cache_w1h) tokens, count(DISTINCT m.session_id) sessions ${base} GROUP BY day ORDER BY day`).all(...args);
  const rec = reconciliationList(db, f);
  const counts = { validated: 0, divergent: 0, insufficient_data: 0 };
  for (const r of rec) counts[r.status]++;
  const rep = rec.filter((r) => r.reported != null && r.recalculated != null);
  const settings = getKV(db, 'costs.settings', { monthlyFee: null, plan: '', currency: 'USD', budget: null, tolerancePct: 2 });
  return {
    total: tot, byModel, byAgent, daily,
    reconciliation: { counts, reported: rep.reduce((a, r) => a + r.reported, 0), recalculated: rep.reduce((a, r) => a + r.recalculated, 0), sessions: rep.length },
    pricing: db.prepare('SELECT id, effective_from, prices_json, currency, source_url, created_at FROM pricing_versions ORDER BY effective_from DESC, id DESC').all().map((v) => ({ ...v, prices: JSON.parse(v.prices_json), prices_json: undefined })),
    settings,
    budgetExceeded: settings.budget != null && tot.cost != null && monthCost(db) > settings.budget,
    monthCost: monthCost(db),
  };
}

function monthCost(db) {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
  return db.prepare('SELECT COALESCE(sum(recalculated_cost), 0) c FROM model_requests WHERE started_at >= ?').get(d.getTime()).c;
}

// por sessão: reportado (cost-state / OTel) × recalculado
function reconciliationList(db, f = {}) {
  const tol = { tolerancePct: getKV(db, 'costs.settings', {}).tolerancePct || 2 };
  const si = sessionIn(f);
  const w = [si.sql], a = [...si.args];
  return db.prepare(`SELECT s.id, s.title, p.name project, s.start_at,
      (SELECT reported_cost FROM session_cost_reports r WHERE r.session_id = s.id AND r.model = '*') reported,
      (SELECT has_unknown_cost FROM session_cost_reports r WHERE r.session_id = s.id AND r.model = '*') unknown,
      (SELECT sum(recalculated_cost) FROM model_requests m WHERE m.session_id = s.id) recalculated,
      (SELECT sum(recalculated_cost IS NULL) FROM model_requests m WHERE m.session_id = s.id) missing,
      (SELECT count(*) FROM model_requests m WHERE m.session_id = s.id AND m.reported_cost IS NOT NULL) otel_matched
    FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
    WHERE ${w.join(' AND ')} AND EXISTS (SELECT 1 FROM model_requests m WHERE m.session_id = s.id) ORDER BY s.start_at DESC`).all(...a)
    .map((r) => {
      const calc = r.missing ? null : r.recalculated;
      const x = reconcile(r.reported, calc, tol);
      return { ...r, recalculated: calc, ...x, source: r.reported != null ? 'cost-state (Claude Code)' : null };
    });
}

// limites do plano: só snapshots reais; nada é interpolado
function subscription(db) {
  const out = {};
  for (const w of ['5h', '7d']) {
    const last = db.prepare('SELECT * FROM usage_snapshots WHERE window = ? ORDER BY captured_at DESC LIMIT 1').get(w);
    const history = db.prepare('SELECT captured_at, used_pct FROM usage_snapshots WHERE window = ? ORDER BY captured_at DESC LIMIT 200').all(w).reverse();
    const ageMin = last ? (Date.now() - last.captured_at) / 60000 : null;
    out[w] = { last: last || null, history, freshness: !last ? 'indisponível' : ageMin <= 15 ? 'fresco' : 'desatualizado' };
  }
  return out;
}

module.exports = { summary, reconciliationList, subscription, monthCost };
