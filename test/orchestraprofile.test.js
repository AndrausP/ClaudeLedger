'use strict';
// Perfil com Orchestra marcado: instala o plugin sozinho e o deixa ligado; sem a marca, fica desligado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-orch-'));
const CLAUDE = path.join(tmp, '.claude');
const USERDATA = path.join(tmp, 'userData');
fs.mkdirSync(CLAUDE, { recursive: true });
fs.mkdirSync(USERDATA, { recursive: true });
process.env.LEDGER_CLAUDE_DIR = CLAUDE;
const { createStore } = require('../src/profiles');
const Orch = require('../src/services/orchestra');

const SETTINGS = path.join(CLAUDE, 'settings.json');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const store = createStore(USERDATA);
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('Should_InstallOrchestraThroughGeneratedMarketplace_When_NotInstalled', async () => {
  const calls = [];
  const r = await Orch.ensureInstalled(USERDATA, ['caveman@caveman'], async (src, name, scope) => { calls.push([src, name, scope]); return { ok: true, out: 'ok' }; });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.key, 'orchestra@' + Orch.MARKETPLACE);
  assert.deepStrictEqual(calls[0].slice(1), ['orchestra', 'user']);
  const m = readJson(path.join(calls[0][0], '.claude-plugin', 'marketplace.json'));
  assert.strictEqual(m.name, Orch.MARKETPLACE);
  assert.strictEqual(m.plugins[0].name, 'orchestra');
  assert.strictEqual(m.plugins[0].source.source, 'github');
});

test('Should_SkipInstall_When_OrchestraAlreadyInstalled', async () => {
  let called = false;
  const r = await Orch.ensureInstalled(USERDATA, ['orchestra@outro'], async () => { called = true; return { ok: true }; });
  assert.strictEqual(r.already, true);
  assert.strictEqual(called, false);
});

test('Should_ReportFailure_When_InstallFails', async () => {
  const r = await Orch.ensureInstalled(USERDATA, [], async () => ({ ok: false, out: 'sem internet' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.key, null);
});

test('Should_EnableOrchestraPlugin_When_ProfileMarksIt', () => {
  const KEYS = ['caveman@caveman', 'orchestra@' + Orch.MARKETPLACE];
  fs.writeFileSync(SETTINGS, '{}');
  // mesmo que o plugin esteja na lista de desligados, a opção Orchestra do perfil manda
  store.save({ active: null, owned: [], profiles: [{ id: 'a', name: 'Com Orchestra', orchestra: true, disabledPlugins: ['orchestra@' + Orch.MARKETPLACE] }, { id: 'b', name: 'Sem Orchestra', orchestra: false }] });
  store.apply('a', KEYS, { nodeBin: null });
  assert.strictEqual(readJson(SETTINGS).enabledPlugins['orchestra@' + Orch.MARKETPLACE], true);
  assert.match(fs.readFileSync(path.join(CLAUDE, 'CLAUDE.md'), 'utf8'), /Orchestra Core ativo/);

  store.apply('b', KEYS, { nodeBin: null });
  assert.strictEqual(readJson(SETTINGS).enabledPlugins['orchestra@' + Orch.MARKETPLACE], false);
  assert.strictEqual(readJson(SETTINGS).enabledPlugins['caveman@caveman'], true);
  assert.doesNotMatch(fs.readFileSync(path.join(CLAUDE, 'CLAUDE.md'), 'utf8'), /Orchestra Core ativo/);
});
