'use strict';
// Critérios 3, 7, 9, 10 e fórmulas da seção 4.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./helpers');
const { ingestAll } = require('../src/ingest/transcripts');
const { autoOutcome, metrics, quantile } = require('../src/domain/efficiency');
const E = require('../src/services/efficiency');
const A = require('../src/services/admin');
const O = require('../src/otel/receiver');
const SL = require('../src/statusline');
const { unified, parseGitPatch } = require('../src/domain/diff');

test('avaliação automática: último teste decide; sem teste = unreviewed', () => {
  assert.equal(autoOutcome([]).outcome, 'unreviewed');
  assert.equal(autoOutcome([{ id: 'a', is_test: 1, status: 'erro' }, { id: 'b', is_test: 1, status: 'ok' }]).outcome, 'approved');
  assert.equal(autoOutcome([{ id: 'a', is_test: 1, status: 'ok' }, { id: 'b', is_test: 1, status: 'erro' }]).outcome, 'rejected');
  assert.equal(autoOutcome([{ id: 'a', is_test: 1, status: 'cancelado' }]).outcome, 'unreviewed', 'cancelado não é resultado');
  assert.equal(autoOutcome([{ id: 'a', is_test: 0, status: 'ok' }]).outcome, 'unreviewed');
});

test('fórmulas: não avaliadas fora do denominador; parcial conta no denominador', () => {
  const s = (outcome, cost = 1) => ({ outcome, cost, cost_complete: true, start_at: 0, end_at: 1000, tools_ok: 9, tools_err: 1, cache_read: 80, input_total: 100 });
  const m = metrics([s('approved'), s('rejected'), s('partial'), s('unreviewed'), s('unreviewed')]);
  assert.equal(m.evaluated, 3);
  assert.equal(m.success_rate, 1 / 3);
  assert.equal(m.coverage, 3 / 5);
  assert.equal(m.cost_per_approved, 5, 'custo do grupo inteiro / aprovadas');
  assert.equal(m.tool_failure_rate, 5 / 50);
  assert.equal(m.cache_read_share, 0.8);
  assert.equal(m.insufficient, true, 'amostra < 5 avaliadas');
  assert.equal(metrics([s('unreviewed')]).success_rate, null, 'sem avaliação → null, não 0');
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
});

test('avaliação manual prevalece e não é apagada pela reavaliação automática', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  const L = H.line;
  H.writeSession(root, 'p', 's1', [L.assistant(1, 'm1', { tools: [{ id: 't1', name: 'Bash', input: { command: 'npm test' } }] }), L.result(2, 't1')]);
  ingestAll(db, root, H.PRICING);
  E.evaluateAll(db);
  assert.equal(E.outcomeOf(db, 's1').outcome, 'approved');
  E.setManual(db, 's1', 'rejected', 'quebrou em produção');
  E.evaluateAll(db, { force: true });
  const o = E.outcomeOf(db, 's1');
  assert.equal(o.outcome, 'rejected');
  assert.equal(o.evaluation_method, 'human');
  assert.throws(() => E.setManual(db, 's1', 'ótimo'), /inválido/);
});

test('OTel: casa com o transcrito, preenche reported_cost e não soma em dobro', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  H.writeSession(root, 'p', 's1', [H.line.assistant(1, 'm1', { out: 100 })]);
  ingestAll(db, root, H.PRICING);
  const before = db.prepare('SELECT count(*) n, sum(recalculated_cost) c FROM model_requests').get();
  const at = Date.parse(H.iso(1)) + 3000;
  const payload = { resourceLogs: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'claude-code' } }] }, scopeLogs: [{ logRecords: [{
    timeUnixNano: String(at * 1e6), body: { stringValue: 'claude_code.api_request' },
    attributes: [['session.id', 's1'], ['model', 'claude-sonnet-test'], ['output_tokens', 100], ['input_tokens', 10], ['cost_usd', 0.0042], ['prompt', H.SECRET]]
      .map(([key, v]) => ({ key, value: typeof v === 'number' ? { doubleValue: v } : { stringValue: v } })),
  }] }] }] };
  O.store(db, O.parseLogs(payload));
  O.store(db, O.parseLogs(payload)); // repetido
  assert.equal(O.match(db), 1);
  const after = db.prepare('SELECT count(*) n, sum(recalculated_cost) c, max(reported_cost) r FROM model_requests').get();
  assert.equal(after.n, before.n, 'nenhuma requisição nova em model_requests');
  assert.equal(after.c, before.c);
  assert.equal(after.r, 0.0042);
  assert.equal(db.prepare('SELECT count(*) n FROM otel_requests').get().n, 1, 'payload repetido deduplicado');
  for (const t of ['otel_requests', 'otel_events']) assert.ok(!JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all()).includes(H.SECRET), 'atributo de prompt não é guardado');
});

test('exclusão de sessão remove dados e sobrevive à reimportação', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  H.writeSession(root, 'p', 's1', [H.line.prompt(0), H.line.assistant(1, 'm1')]);
  H.writeSession(root, 'p', 's2', [H.line.assistant(1, 'm2')]);
  ingestAll(db, root, H.PRICING);
  A.setTags(db, 's1', ['Bug', 'bug', ' login ']);
  assert.deepEqual(A.tagsOf(db, 's1'), ['bug', 'login'], 'etiquetas normalizadas e sem repetição');
  A.deleteSession(db, 's1');
  db.prepare('DELETE FROM ingestion_state').run();
  ingestAll(db, root, H.PRICING);
  assert.equal(db.prepare(`SELECT count(*) n FROM model_requests WHERE session_id = 's1'`).get().n, 0);
  assert.equal(db.prepare(`SELECT count(*) n FROM session_tags`).get().n, 0);
  assert.equal(db.prepare(`SELECT count(*) n FROM model_requests WHERE session_id = 's2'`).get().n, 1, 'outras sessões intactas');
});

test('status line: wrapper devolve a saída original byte a byte e grava só rate_limits', () => {
  const dir = H.tmpdir(), snap = path.join(dir, 's.jsonl');
  const input = JSON.stringify({ session_id: 'abc', rate_limits: { five_hour: { used_percentage: 42, resets_at: 1800000000 } }, transcript_path: H.SECRET, cwd: 'C:\\x' });
  // comando "original" que ecoa o stdin com prefixo — simula a status line do usuário
  const echo = path.join(dir, 'echo.js');
  fs.writeFileSync(echo, 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write("ORIG:"+s.length+":ç✓"))');
  const orig = Buffer.from(`node "${echo.replace(/\\/g, '/')}"`).toString('base64');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'statusline', 'wrapper.js'), snap, orig], { input }).toString('utf8');
  assert.equal(out, 'ORIG:' + input.length + ':ç✓', 'saída do comando original preservada');
  const saved = fs.readFileSync(snap, 'utf8');
  assert.ok(!saved.includes(H.SECRET) && !saved.includes('cwd'), 'grava só o necessário');
  assert.deepEqual(JSON.parse(saved).rate_limits, { five_hour: { used_percentage: 42, resets_at: 1800000000 } });
  assert.deepEqual(SL.windowOf({ used_percentage: 42, resets_at: 1800000000 }), { used_pct: 42, resets_at: 1800000000000 });
  assert.equal(SL.windowOf({}), null, 'sem campo de uso → indisponível, nunca inventado');
  // sem rate_limits e JSON inválido: a status line continua funcionando
  assert.equal(execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'statusline', 'wrapper.js'), snap, orig], { input: 'não é json' }).toString('utf8'), 'ORIG:10:ç✓');
});

test('diff: hunks corretos, arquivo novo, idêntico', () => {
  const d = unified('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\n');
  assert.equal(d.added, 2); assert.equal(d.removed, 1);
  assert.ok(d.hunks.length >= 1 && d.hunks[0].header.startsWith('@@ -1,'));
  assert.deepEqual(unified('', 'x\ny').added, 2);
  assert.equal(unified('igual', 'igual').hunks.length, 0);
  const files = parseGitPatch('diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -1,2 +1,2 @@\n-old\n+new\n ctx\n');
  assert.equal(files[0].path, 'x.js'); assert.equal(files[0].added, 1); assert.equal(files[0].removed, 1);
});
