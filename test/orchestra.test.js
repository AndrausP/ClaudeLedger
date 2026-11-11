'use strict';
// Aba Orchestra: catálogo × uso real × runtime, aderência ao catálogo e exclusão de projetos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
// isola do Claude Code real: um Orchestra instalada na máquina não pode interferir no teste
process.env.LEDGER_CLAUDE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-orc-claude-'));
const H = require('./helpers');
const { ingestAll } = require('../src/ingest/transcripts');
const O = require('../src/services/orchestra');

function makeOrchestra(dir) {
  const root = path.join(dir, 'orchestra-core');
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'catalogs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'orchestra', displayName: 'Orchestra Core', version: '0.1.0' }));
  fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'x' }] }] } }));
  fs.writeFileSync(path.join(root, 'catalogs', 'agents.json'), JSON.stringify({
    schema_version: '1.0.0',
    departments: [{ id: 'backend', name: 'Backend', leader: 'backend-lead', agents: ['backend-lead', 'feature-engineer'] }],
    agents: [
      { id: 'backend-lead', name: 'Backend Lead', department: 'backend', department_name: 'Backend', leader: true, tools: ['Read', 'Edit'], model: 'sonnet', alternatives: [], budget: { max_turns: 2 } },
      { id: 'feature-engineer', name: 'Feature Engineer', department: 'backend', department_name: 'Backend', leader: false, tools: ['Read'], model: 'sonnet', alternatives: ['haiku'], budget: { max_turns: 10 } },
    ],
  }));
  fs.writeFileSync(path.join(root, 'catalogs', 'skills.json'), JSON.stringify({ schema_version: '1.0.0', primary: [{}, {}], shared: [{}], commands: ['a'] }));
  // runtime: banco do Orchestra com uma tarefa e um evento
  fs.mkdirSync(path.join(root, '.orchestra'), { recursive: true });
  const odb = new DatabaseSync(path.join(root, '.orchestra', 'orchestra.db'));
  odb.exec(`CREATE TABLE tasks (task_id TEXT, parent_task_id TEXT, title TEXT, mode TEXT, risk TEXT, status TEXT, owner TEXT, selected_agents_json TEXT, budget_profile TEXT, revision INTEGER, created_at TEXT);
    CREATE TABLE event_outbox (sequence INTEGER PRIMARY KEY, event_id TEXT, event_json TEXT, exported_at TEXT);`);
  odb.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('t1', null, 'Criar endpoint', 'STANDARD', 'MEDIUM', 'IN_PROGRESS', 'backend-lead', '["backend-lead","feature-engineer"]', 'BALANCED', 2, new Date().toISOString());
  odb.prepare('INSERT INTO event_outbox (event_id, event_json) VALUES (?,?)').run('e1', JSON.stringify({ schema_version: '1.0.0', event_type: 'task.created', occurred_at: new Date().toISOString(), data_classification: 'internal' }));
  odb.prepare('INSERT INTO event_outbox (event_id, event_json) VALUES (?,?)').run('e2', JSON.stringify({ schema_version: '9.0.0', event_type: 'task.future', occurred_at: new Date().toISOString() }));
  odb.close();
  return root;
}

function fixture() {
  const { db, dir } = H.db(); const projects = path.join(dir, 'projects');
  const L = H.line;
  H.writeSession(projects, 'proj-a', 's1', [L.prompt(0), L.assistant(1, 'm0')]);
  // subagente do Orchestra: 3 respostas (orçamento 2), uma em opus (fora do previsto), Bash fora da lista e com erro
  H.writeSubagent(projects, 'proj-a', 's1', 'agent-o1', 'orchestra:backend-lead', 'tu-o', [
    L.assistant(2, 'o1', { model: 'claude-sonnet-test', tools: [{ id: 'r1', name: 'Read', input: { file_path: '/a.js' } }] }), L.result(3, 'r1'),
    L.assistant(4, 'o2', { model: 'claude-sonnet-test', tools: [{ id: 'b1', name: 'Bash', input: { command: 'rm -rf x' } }] }), L.result(5, 'b1', { error: true, text: 'Error: negado pelo sistema' }),
    L.assistant(6, 'o3', { model: 'claude-opus-test' }),
  ]);
  H.writeSession(projects, 'proj-b', 's2', [L.assistant(1, 'x0')]);
  H.writeSubagent(projects, 'proj-b', 's2', 'agent-o2', 'orchestra:backend-lead', 'tu-o2', [L.assistant(2, 'p1', { model: 'claude-sonnet-test' })]);
  ingestAll(db, projects, H.PRICING);
  return { db, root: makeOrchestra(dir) };
}

test('localiza e lê o catálogo; protocolo 1.x compatível', () => {
  const { db, root } = fixture();
  assert.equal(O.locate(db, root).root, root);
  assert.equal(O.locate(db, path.join(root, 'nao-existe')).root, null, 'pasta errada não é aceita');
  const c = O.catalog(root);
  assert.equal(c.compatible, true);
  assert.equal(c.agents.length, 2);
  assert.deepEqual(c.hooks, [{ event: 'PreToolUse', handlers: 1 }]);
  assert.deepEqual(c.skills, { primary: 2, shared: 1, commands: 1 });
});

test('aderência ao catálogo: modelo, orçamento de turnos e ferramentas fora da lista', () => {
  const { db, root } = fixture();
  const o = O.overview(db, {}, root);
  const u = o.usage.agents['backend-lead'];
  assert.equal(u.executions, 2, 'duas instâncias do subagente');
  assert.equal(u.requests, 4);
  assert.equal(u.over_budget, 1, '3 turnos > max_turns 2 na primeira execução');
  assert.equal(u.model_adherence, 3 / 4, '1 de 4 respostas em opus (previsto: sonnet)');
  assert.deepEqual(u.off_tools, { Bash: 1 }, 'Bash não está na lista do agente');
  assert.equal(u.accuracy, 0.5);
  assert.equal(o.usage.agents['feature-engineer'], undefined, 'agente não usado fica sem uso');
  assert.equal(o.totals.used, 1);
  assert.equal(o.departments[0].used, 1);
});

test('runtime lido só para leitura; evento de versão desconhecida marcado', () => {
  const { db, root } = fixture();
  const before = fs.statSync(path.join(root, '.orchestra', 'orchestra.db')).mtimeMs;
  const o = O.overview(db, {}, root);
  assert.equal(o.tasks.length, 1);
  assert.deepEqual(o.tasks[0].selected_agents, ['backend-lead', 'feature-engineer']);
  assert.equal(o.totals.events, 2);
  assert.equal(o.totals.incompatible_events, 1);
  assert.equal(fs.statSync(path.join(root, '.orchestra', 'orchestra.db')).mtimeMs, before, 'banco do Orchestra não foi alterado');
});

test('excluir projeto tira o uso dele do relatório', () => {
  const { db, root } = fixture();
  const all = O.overview(db, {}, root).usage.agents['backend-lead'];
  const sem = O.overview(db, { exclude: ['proj-b'] }, root).usage.agents['backend-lead'];
  assert.equal(all.executions, 2);
  assert.equal(sem.executions, 1, 'execução do proj-b saiu');
  assert.equal(O.overview(db, { exclude: ['proj-a', 'proj-b'] }, root).totals.used, 0);
});
