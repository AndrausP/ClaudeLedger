'use strict';
// Critérios de aceite 1, 3, 4 e 10 da especificação.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers');
const { ingestAll } = require('../src/ingest/transcripts');
const S = require('../src/services/sessions');

const totals = (db) => db.prepare('SELECT count(*) n, sum(tokens_out) out, round(sum(recalculated_cost), 9) cost FROM model_requests').get();

function basicSession(root) {
  const L = H.line;
  return H.writeSession(root, 'proj-a', 'sess-1', [
    L.title('sess-1', 'Corrigir login'),
    L.prompt(0),
    // a mesma resposta aparece em 2 linhas (um bloco por linha) — deve contar UMA vez
    L.assistant(1, 'msg-1', { out: 40 }),
    L.assistant(2, 'msg-1', { out: 120, tools: [{ id: 'tu-1', name: 'Read', input: { file_path: 'C:\\app\\a.js' } }] }),
    L.result(3, 'tu-1'),
    L.noise(),
    L.assistant(4, 'msg-2', { out: 50, tools: [{ id: 'tu-2', name: 'Bash', input: { command: 'npm test -- --token=' + H.SECRET } }] }),
    L.result(9, 'tu-2', { error: true, text: 'Error: falhou em C:\\app\\x.js:12' }),
    L.compact(10),
    L.cost('sess-1', 0.5, { 'claude-sonnet-test': { inputTokens: 20, outputTokens: 170, cacheReadInputTokens: 2000, cacheCreationEphemeral5mInputTokens: 0, cacheCreationEphemeral1hInputTokens: 400, costUSD: 0.5 } }),
  ]);
}

test('sem dupla contagem: mesma mensagem em várias linhas + reimportação', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  basicSession(root);
  ingestAll(db, root, H.PRICING);
  const a = totals(db);
  assert.equal(a.n, 2, 'msg-1 repetida conta uma vez');
  assert.equal(a.out, 170, 'mantém o maior usage da mensagem (120) + msg-2 (50)');
  ingestAll(db, root, H.PRICING);
  db.prepare('DELETE FROM ingestion_state').run(); // força reler tudo do zero
  ingestAll(db, root, H.PRICING);
  assert.deepEqual(totals(db), a, 'reimportar não altera tokens nem custo');
  assert.equal(db.prepare('SELECT count(*) n FROM session_events').get().n, db.prepare('SELECT count(DISTINCT source_event_id) n FROM session_events').get().n);
});

test('incremental: lê só o que foi acrescentado; linha incompleta espera a próxima rodada', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  const f = basicSession(root);
  ingestAll(db, root, H.PRICING);
  const extra = JSON.stringify(H.line.assistant(20, 'msg-3', { out: 7 }));
  fs.appendFileSync(f, extra.slice(0, 40)); // metade da linha, sem \n
  ingestAll(db, root, H.PRICING);
  assert.equal(totals(db).n, 2, 'linha incompleta não é importada');
  fs.appendFileSync(f, extra.slice(40) + '\n');
  const r = ingestAll(db, root, H.PRICING);
  assert.equal(totals(db).n, 3);
  assert.equal(r.lines, 1, 'só a linha nova foi processada');
});

test('arquivo truncado/rotacionado é reimportado sem duplicar', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  const f = basicSession(root);
  ingestAll(db, root, H.PRICING);
  const before = totals(db);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split('\n').slice(0, 4).join('\n') + '\n'); // menor que o cursor
  const r = ingestAll(db, root, H.PRICING);
  assert.equal(r.rotated, 1);
  assert.deepEqual(totals(db), before, 'dados já importados permanecem, nada duplica');
});

test('atribuição: subagente recebe só as próprias requisições', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  basicSession(root);
  H.writeSubagent(root, 'proj-a', 'sess-1', 'agent-abc', 'Revisor', 'tu-agent', [H.line.assistant(5, 'msg-sub', { out: 9 })]);
  ingestAll(db, root, H.PRICING);
  const sub = db.prepare(`SELECT a.name, a.parent_agent_id, a.tool_use_id, (SELECT count(*) FROM model_requests m WHERE m.agent_id = a.id) n FROM agents a WHERE a.kind = 'subagent'`).get();
  assert.deepEqual({ ...sub }, { name: 'Revisor', parent_agent_id: 'main:sess-1', tool_use_id: 'tu-agent', n: 1 });
  assert.equal(db.prepare(`SELECT count(*) n FROM model_requests WHERE agent_id = 'main:sess-1'`).get().n, 2);
  assert.equal(db.prepare('SELECT count(*) n FROM model_requests WHERE agent_id IS NULL').get().n, 0);
});

test('privacidade: texto de prompt, resposta, parâmetros e saída de ferramenta não vão para o banco', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  basicSession(root);
  ingestAll(db, root, H.PRICING);
  for (const { name } of db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all()) {
    for (const row of db.prepare(`SELECT * FROM "${name}"`).all()) {
      assert.ok(!JSON.stringify(row).includes(H.SECRET), `segredo vazou na tabela ${name}`);
    }
  }
  const p = db.prepare(`SELECT payload_sanitized p FROM session_events WHERE type = 'user_prompt'`).get();
  assert.ok(JSON.parse(p.p).chars > 0, 'guarda só o tamanho do prompt');
});

test('normalização: título, erro, comando de teste, compactação, status', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  basicSession(root);
  ingestAll(db, root, H.PRICING);
  assert.equal(db.prepare(`SELECT title FROM sessions WHERE id = 'sess-1'`).get().title, 'Corrigir login');
  const bash = db.prepare(`SELECT * FROM tool_calls WHERE id = 'tu-2'`).get();
  assert.equal(bash.status, 'erro');
  assert.equal(bash.is_test, 1, 'npm test reconhecido como teste');
  assert.equal(bash.error_signature, 'error: falhou em <path>:#', 'erro normalizado sem caminho nem número');
  assert.equal(bash.ended_at - bash.started_at, 5000);
  assert.equal(db.prepare(`SELECT count(*) n FROM session_events WHERE type = 'compaction'`).get().n, 1);
});

test('dados parciais: sessão sem cost-state fica insufficient_data, nunca zero', () => {
  const { db, dir } = H.db(); const root = path.join(dir, 'projects');
  H.writeSession(root, 'proj-b', 'sess-2', [H.line.prompt(0), H.line.assistant(1, 'm', { model: 'modelo-sem-preco' })]);
  ingestAll(db, root, H.PRICING);
  const g = S.get(db, 'sess-2');
  assert.equal(g.reconciliation.status, 'insufficient_data');
  assert.equal(db.prepare('SELECT recalculated_cost c, cost_status s FROM model_requests').get().c, null, 'sem preço → NULL, não 0');
  assert.equal(g.requests.unpriced, 1);
});
