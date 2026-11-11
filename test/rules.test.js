'use strict';
// Critérios 2 (evidência correta) e 8 (regras explicáveis, falso positivo persiste).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers');
const { runRules, buildBaseline } = require('../src/domain/rules');
const { ingestAll } = require('../src/ingest/transcripts');
const D = require('../src/services/diagnostics');
const S = require('../src/services/sessions');

let seq = 0;
const tool = (o) => ({ id: 't' + (++seq), event_id: seq, agent_id: 'main', input_hash: 'same', target_hash: null, status: 'ok', started_at: seq, ended_at: seq, ...o });
const base = buildBaseline({}, []);
const only = (fs, id) => fs.filter((f) => f.rule_id === id);

test('repeated_read: 3 leituras iguais sem edição → achado; Edit no meio zera', () => {
  const read = () => tool({ tool_name: 'Read', target_hash: 'A', target_label: 'a.js' });
  assert.equal(only(runRules({ tools: [read(), read(), read()], compactions: [], baseline: base }), 'repeated_read').length, 1);
  const withEdit = [read(), read(), tool({ tool_name: 'Edit', target_hash: 'A' }), read()];
  assert.equal(only(runRules({ tools: withEdit, compactions: [], baseline: base }), 'repeated_read').length, 0);
});

test('repeated_read: trechos diferentes do mesmo arquivo não contam', () => {
  const tools = [1, 2, 3].map((i) => tool({ tool_name: 'Read', target_hash: 'A', target_label: 'a.js', input_hash: 'offset' + i }));
  assert.equal(only(runRules({ tools, compactions: [], baseline: base }), 'repeated_read').length, 0);
});

test('repeated_read: agentes diferentes não se somam', () => {
  const tools = ['a', 'b', 'c'].map((ag) => tool({ tool_name: 'Read', target_hash: 'A', target_label: 'a.js', agent_id: ag }));
  assert.equal(only(runRules({ tools, compactions: [], baseline: base }), 'repeated_read').length, 0);
});

test('repeated_error: mesma assinatura 3× seguidas; sucesso no meio interrompe; parâmetros iguais = crítico', () => {
  const err = (input_hash = 'same') => tool({ tool_name: 'Bash', status: 'erro', error_signature: 'enoent', input_hash });
  const f = only(runRules({ tools: [err(), err(), err()], compactions: [], baseline: base }), 'repeated_error');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'crítico');
  assert.equal(f[0].evidence.length, 3);
  const varied = only(runRules({ tools: [err('a'), err('b'), err('c')], compactions: [], baseline: base }), 'repeated_error');
  assert.equal(varied[0].severity, 'atenção');
  const broken = [err(), err(), tool({ tool_name: 'Bash', status: 'ok' }), err()];
  assert.equal(only(runRules({ tools: broken, compactions: [], baseline: base }), 'repeated_error').length, 0);
});

test('high_compaction respeita amostra mínima e o P90 do histórico', () => {
  const comps = [1, 2, 3].map((i) => ({ event_id: 100 + i }));
  assert.equal(only(runRules({ tools: [], compactions: comps, baseline: buildBaseline({}, [0, 1, 1]) }), 'high_compaction').length, 0, 'amostra < 10 sessões');
  assert.equal(only(runRules({ tools: [], compactions: comps, baseline: buildBaseline({}, Array(20).fill(1)) }), 'high_compaction').length, 1);
  assert.equal(only(runRules({ tools: [], compactions: comps, baseline: buildBaseline({}, Array(20).fill(5)) }), 'high_compaction').length, 0, 'normal para este usuário');
});

test('latency_outlier exige amostra mínima', () => {
  const slow = tool({ tool_name: 'Bash', started_at: 0, ended_at: 600000 });
  assert.equal(only(runRules({ tools: [slow], compactions: [], baseline: buildBaseline({ Bash: Array(5).fill(1000) }, []) }), 'latency_outlier').length, 0);
  assert.equal(only(runRules({ tools: [slow], compactions: [], baseline: buildBaseline({ Bash: Array(50).fill(1000) }, []) }), 'latency_outlier').length, 1);
});

test('ponta a ponta: achado persiste, evidência abre o evento certo, falso positivo sobrevive ao recálculo', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  const L = H.line, lines = [L.prompt(0)];
  for (let i = 0; i < 3; i++) { lines.push(L.assistant(1 + i * 2, 'm' + i, { tools: [{ id: 'r' + i, name: 'Read', input: { file_path: '/x/a.js' } }] })); lines.push(L.result(2 + i * 2, 'r' + i)); }
  H.writeSession(root, 'p', 's1', lines);
  ingestAll(db, root, H.PRICING);
  D.computeStale(db);
  const [f] = D.list(db, { sessionId: 's1' });
  assert.equal(f.rule_id, 'repeated_read');
  assert.equal(f.rule_version, 1);
  assert.ok(f.explanation.length > 20);
  const ev = S.event(db, f.evidence_ids[1]);
  assert.equal(ev.payload.tool_use_id, 'r1', 'evidência aponta para a 2ª leitura');
  assert.equal(ev.findings[0].id, f.id);
  const order = S.timeline(db, 's1', { size: 500 }).items.map((e) => e.id);
  const idx = order.indexOf(f.evidence_ids[2]);
  assert.equal(S.pageOfEvent(db, 's1', f.evidence_ids[2], { size: 2 }), Math.floor(idx / 2), 'página certa para "Ir à evidência"');
  const page = S.timeline(db, 's1', { size: 2, page: Math.floor(idx / 2) });
  assert.ok(page.items.some((e) => e.id === f.evidence_ids[2]), 'a página calculada contém o evento');
  D.feedback(db, f.id, 'falso_positivo');
  D.computeStale(db, { force: true });
  const again = D.list(db, { sessionId: 's1' });
  assert.equal(again.length, 1, 'recalcular não duplica');
  assert.equal(again[0].feedback, 'falso_positivo', 'feedback preservado');
  assert.throws(() => D.feedback(db, f.id, 'qualquer'), /inválido/);
});
