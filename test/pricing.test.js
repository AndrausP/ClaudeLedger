'use strict';
// Critérios 5 (cálculo versionado) e 6 (reconciliação) da especificação.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers');
const { costOf, versionAt, reconcile } = require('../src/domain/pricing');
const { ingestAll } = require('../src/ingest/transcripts');
const S = require('../src/services/sessions');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);

test('fórmula com as 5 classes de token, cada uma contada uma vez', () => {
  const rows = [{ match: 'x', in: 3, out: 15 }];
  const req = { model: 'x', tokens_in: 1e6, tokens_out: 1e6, cache_read: 1e6, cache_w5m: 1e6, cache_w1h: 1e6 };
  near(costOf(req, rows).cost, 3 + 15 + 0.3 + 3.75 + 6);
  near(costOf({ ...req, tokens_in: 0, tokens_out: 0, cache_w5m: 0, cache_w1h: 0 }, rows).cost, 0.3);
});

test('preço de cache explícito na tabela substitui o multiplicador padrão', () => {
  const rows = [{ match: 'x', in: 3, out: 15, cache_read: 0.5, cache_w5m: 4, cache_w1h: 7 }];
  near(costOf({ model: 'x', tokens_in: 0, tokens_out: 0, cache_read: 1e6, cache_w5m: 1e6, cache_w1h: 1e6 }, rows).cost, 11.5);
});

test('sem preço ou sem tokens → custo NULL com motivo (nunca 0)', () => {
  assert.deepEqual(costOf({ model: 'y', tokens_in: 1, tokens_out: 1, cache_read: 0, cache_w5m: 0, cache_w1h: 0 }, [{ match: 'x', in: 1, out: 1 }]), { cost: null, status: 'sem_preco' });
  assert.equal(costOf({ model: 'x', tokens_in: 1, tokens_out: null, cache_read: 0, cache_w5m: 0, cache_w1h: 0 }, [{ match: 'x', in: 1, out: 1 }]).status, 'tokens_ausentes');
});

test('versão vigente é a mais recente com início <= instante', () => {
  const v = [{ id: 1, effective_from: 0 }, { id: 2, effective_from: 100 }, { id: 3, effective_from: 50 }];
  assert.equal(versionAt(v, 10).id, 1);
  assert.equal(versionAt(v, 60).id, 3);
  assert.equal(versionAt(v, 100).id, 2);
});

test('mudança de tarifa não reescreve o histórico', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  H.writeSession(root, 'p', 's1', [H.line.assistant(1, 'm1', { model: 'claude-sonnet-test' })]);
  ingestAll(db, root, H.PRICING);
  const old = db.prepare('SELECT recalculated_cost c, pricing_version_id v FROM model_requests').get();
  // nova tabela, mais cara; requisição antiga não é tocada
  ingestAll(db, root, [{ match: 'sonnet-test', in: 300, out: 1500 }]);
  assert.deepEqual({ ...db.prepare('SELECT recalculated_cost c, pricing_version_id v FROM model_requests').get() }, { ...old });
  assert.equal(db.prepare('SELECT count(*) n FROM pricing_versions').get().n, 2);
  assert.throws(() => db.prepare(`UPDATE pricing_versions SET prices_json = '[]'`).run(), /imutável/);
});

test('reconciliação: validated dentro da tolerância, divergent fora, insufficient sem dado', () => {
  assert.equal(reconcile(1.0, 1.015).status, 'validated');
  assert.equal(reconcile(1.0, 1.2).status, 'divergent');
  assert.equal(reconcile(null, 1).status, 'insufficient_data');
  assert.equal(reconcile(0.001, 0.009).status, 'validated', 'tolerância absoluta para valores pequenos');
});

test('reconciliação por sessão usa o cost-state do Claude Code', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  // 1 requisição: 10 in, 100 out, 1000 cache read, 200 w1h → (10*3 + 100*15 + 1000*0.3 + 200*6) / 1e6
  const exact = (10 * 3 + 100 * 15 + 1000 * 0.3 + 200 * 6) / 1e6;
  H.writeSession(root, 'p', 's1', [H.line.assistant(1, 'm1'), H.line.cost('s1', exact, { 'claude-sonnet-test': { costUSD: exact } })]);
  ingestAll(db, root, H.PRICING);
  const r = S.get(db, 's1').reconciliation;
  assert.equal(r.status, 'validated');
  near(r.total.recalculated, exact);
});
