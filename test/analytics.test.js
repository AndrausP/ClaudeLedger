'use strict';
// Módulo de filtros (critério 11: mesmo filtro → totais compatíveis), acurácia de ferramentas e wrapper do GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require('./helpers');
const { ingestAll } = require('../src/ingest/transcripts');
const A = require('../src/services/analytics');
const C = require('../src/services/costs');
const S = require('../src/services/sessions');
const { reqWhere, norm } = require('../src/services/filters');
const G = require('../src/github');

function fixture() {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  const L = H.line;
  H.writeSession(root, 'proj-a', 's1', [
    L.assistant(1, 'a1', { model: 'claude-sonnet-test', tools: [{ id: 'r1', name: 'Read', input: { file_path: '/x/a.js' } }, { id: 'b1', name: 'Bash', input: { command: 'npm test' } }] }),
    L.result(2, 'r1'), L.result(3, 'b1', { error: true, text: 'Error: falhou' }),
    L.assistant(4, 'a2', { model: 'claude-opus-test', tools: [{ id: 'b2', name: 'Bash', input: { command: 'ls' } }, { id: 'w1', name: 'Write', input: { file_path: '/x/b.js' } }] }),
    L.result(5, 'b2'), L.result(6, 'w1', { error: true, text: "The user doesn't want to proceed" }),
  ]);
  H.writeSubagent(root, 'proj-a', 's1', 'agent-x', 'Revisor', 'tu-x', [L.assistant(7, 'sx', { tools: [{ id: 'g1', name: 'Grep', input: { pattern: 'x' } }] }), L.result(8, 'g1')]);
  H.writeSession(root, 'proj-b', 's2', [L.assistant(1, 'b1m', { model: 'claude-opus-test' })]);
  ingestAll(db, root, H.PRICING);
  return db;
}

test('acurácia = ok ÷ (ok + erro); negadas ficam fora', () => {
  const db = fixture();
  const main = A.agents(db, {}).find((a) => a.name === 'main');
  assert.equal(main.calls, 4);
  assert.equal(main.ok, 2); assert.equal(main.err, 1); assert.equal(main.denied, 1);
  assert.equal(main.accuracy, 2 / 3, 'Write negado não conta como falha');
  const sub = A.agents(db, {}).find((a) => a.name === 'Revisor');
  assert.equal(sub.kind, 'subagent'); assert.equal(sub.executions, 1); assert.equal(sub.accuracy, 1);
});

test('detalhe do agente: o que chamou, alvos e erros', () => {
  const db = fixture();
  const d = A.agentDetail(db, 'main', {});
  const bash = d.tools.find((t) => t.tool === 'Bash');
  assert.equal(bash.calls, 2); assert.equal(bash.accuracy, 0.5);
  assert.deepEqual(bash.top_targets.map((x) => x.target).sort(), ['ls', 'npm'], 'alvo = só o executável, nunca o comando inteiro');
  assert.equal(d.errors.length, 1);
  assert.equal(d.errors[0].error_signature, 'error: falhou');
  assert.equal(d.categories.nativa.calls, 4);
});

test('filtro por modelo vale para requisições E ferramentas (via resposta de origem)', () => {
  const db = fixture();
  const sonnet = A.agents(db, { model: 'claude-sonnet-test' }).find((a) => a.name === 'main');
  assert.equal(sonnet.requests, 1);
  assert.equal(sonnet.calls, 2, 'só as ferramentas chamadas pela resposta do sonnet');
  const tc = A.toolCalls(db, { model: 'claude-opus-test' });
  assert.deepEqual(tc.map((x) => x.tool).sort(), ['Bash', 'Write']);
});

test('critério 11: mesmo filtro → mesmo custo em Custos, Auditoria e Agentes', () => {
  const db = fixture();
  for (const F of [{}, { project: 'proj-a' }, { agent: 'main' }, { model: 'claude-opus-test' }, { agent: 'Revisor', project: 'proj-a' }]) {
    const c1 = C.summary(db, F).total.cost || 0;
    const c2 = A.auditOverview(db, F).totals.cost || 0;
    const c3 = A.agents(db, F).reduce((s, a) => s + (a.cost || 0), 0);
    assert.ok(Math.abs(c1 - c2) < 1e-12 && Math.abs(c2 - c3) < 1e-12, `divergiu para ${JSON.stringify(F)}: ${c1} ${c2} ${c3}`);
  }
  assert.equal(S.list(db, { project: 'proj-b' }).length, 1);
  assert.equal(S.list(db, { agent: 'Revisor' }).length, 1);
  assert.equal(S.list(db, { model: 'claude-opus-test' }).length, 2);
});

test('filtro: valores vazios são ignorados e números normalizados', () => {
  assert.deepEqual(norm({ from: '', to: '10', project: '', agent: undefined }), { from: null, to: 10, project: null, agent: null, model: null });
  assert.equal(reqWhere({}).sql, '1=1');
  const w = reqWhere({ from: 5, agent: 'main' });
  assert.match(w.sql, /m\.started_at >= \?/); assert.deepEqual(w.args, [5, 'main']);
});

test('GitHub: consulta do usuário não injeta qualificadores', () => {
  // o nome do qualificador sobra como palavra comum; o que importa é não restar "chave:" que o GitHub interprete
  assert.equal(G.clean('repo:evil/x user:me <b>skills</b>'), 'repo evil/x user me b skills /b');
  assert.ok(!/\w:/.test(G.clean('org:anthropic topic:x language:js')));
  assert.equal(G.clean('a'.repeat(300)).length, 100);
});
