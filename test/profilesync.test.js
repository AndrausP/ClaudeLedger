'use strict';
// Perfil aplicado + hook SessionStart: toda sessão nova abre com o perfil, mesmo se algo mexeu nos arquivos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-sync-'));
const CLAUDE = path.join(tmp, '.claude');
const USERDATA = path.join(tmp, 'userData');
fs.mkdirSync(CLAUDE, { recursive: true });
fs.mkdirSync(USERDATA, { recursive: true });
process.env.LEDGER_CLAUDE_DIR = CLAUDE; // antes do require: o módulo resolve os caminhos ao carregar
const { createStore } = require('../src/profiles');
const SC = require('../src/services/sessioncheck');

const SETTINGS = path.join(CLAUDE, 'settings.json');
const MD = path.join(CLAUDE, 'CLAUDE.md');
const KEYS = ['caveman@caveman', 'codex@openai-codex'];
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const store = createStore(USERDATA);

// simula o Claude Code abrindo uma sessão: roda o comando do hook com o JSON de entrada no stdin
function openSession(cwd = tmp) {
  const cmd = readJson(SETTINGS).hooks.SessionStart.find((g) => g.hooks[0].command.includes('profile-sync.js')).hooks[0].command;
  const [, , script, state] = cmd.match(/^"([^"]+)" "([^"]+)" "([^"]+)"$/);
  const out = execFileSync(process.execPath, [script, state], { input: JSON.stringify({ source: 'startup', cwd, session_id: 's-' + Date.now() }), env: { ...process.env, LEDGER_CLAUDE_DIR: CLAUDE } }).toString();
  return out ? JSON.parse(out) : null;
}

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('Should_InstallSessionStartHook_When_ProfileApplied', () => {
  fs.writeFileSync(SETTINGS, JSON.stringify({ model: 'sonnet', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo outro' }] }] }, statusLine: { type: 'command', command: 'x' } }));
  fs.writeFileSync(MD, '# minhas regras\n');
  store.save({ active: null, owned: [], profiles: [{ id: 'p1', name: 'Dev', model: 'opus', caveman: true, nirvana: true, disabledPlugins: ['codex@openai-codex'], blockedMcp: ['rea'], blockedSkills: [], startSkills: [], instructions: 'responder em português' }] });

  const r = store.apply('p1', KEYS, { nodeBin: process.execPath });
  assert.strictEqual(r.changed, true);
  const s = readJson(SETTINGS);
  assert.strictEqual(s.model, 'opus');
  assert.strictEqual(s.enabledPlugins['codex@openai-codex'], false);
  assert.ok(s.permissions.deny.includes('mcp__rea'));
  assert.strictEqual(s.statusLine.command, 'x', 'preserva o resto do settings');
  assert.strictEqual(s.hooks.SessionStart.length, 2, 'mantém o hook de terceiros e soma o do app');
  assert.match(fs.readFileSync(MD, 'utf8'), /^# minhas regras[\s\S]*# Perfil ativo: Dev[\s\S]*Caveman sempre ativo[\s\S]*Nirvana sempre ativo/);
  assert.ok(store.hookStatus().installed && store.hookStatus().pointsHere);
});

test('Should_OpenReadyWithoutChanges_When_FilesMatchProfile', () => {
  const before = fs.readFileSync(SETTINGS, 'utf8');
  assert.strictEqual(openSession(), null, 'nada a injetar');
  assert.strictEqual(fs.readFileSync(SETTINGS, 'utf8'), before);
  const h = store.syncHistory();
  assert.strictEqual(h.count, 1);
  assert.deepStrictEqual(h.items[0].fixed, []);
  assert.strictEqual(h.items[0].profile, 'Dev');
});

test('Should_RestoreProfileAndInjectInstructions_When_SomethingChangedTheFiles', () => {
  const s = readJson(SETTINGS);
  s.model = 'haiku'; s.enabledPlugins['codex@openai-codex'] = true; s.permissions.deny = [];
  fs.writeFileSync(SETTINGS, JSON.stringify(s));
  fs.writeFileSync(MD, '# minhas regras\n'); // bloco do perfil apagado à mão

  const out = openSession();
  const fixed = readJson(SETTINGS);
  assert.strictEqual(fixed.model, 'opus');
  assert.strictEqual(fixed.enabledPlugins['codex@openai-codex'], false);
  assert.ok(fixed.permissions.deny.includes('mcp__rea'));
  assert.match(fs.readFileSync(MD, 'utf8'), /# Perfil ativo: Dev/);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /^# Perfil ativo: Dev/);
  assert.ok(!out.hookSpecificOutput.additionalContext.includes('CLAUDE-LEDGER'), 'sem comentários de controle no contexto');
  assert.deepStrictEqual(store.syncHistory().items[0].fixed, ['modelo', 'plugin codex@openai-codex', 'bloqueios', 'CLAUDE.md']);
});

test('Should_ApplyImmediately_When_ActiveProfileSavedInApp', () => {
  const st = store.load();
  st.profiles[0].model = 'sonnet';
  st.profiles[0].instructions = 'rodar testes antes de commit';
  const r = store.saveProfiles(st.profiles, KEYS, { nodeBin: process.execPath });
  assert.strictEqual(r.synced, true);
  assert.strictEqual(readJson(SETTINGS).model, 'sonnet');
  assert.match(fs.readFileSync(MD, 'utf8'), /rodar testes antes de commit/);
  assert.strictEqual(openSession(), null, 'sessão seguinte já abre pronta');

  const again = store.saveProfiles(st.profiles, KEYS, { nodeBin: process.execPath });
  assert.strictEqual(again.changed, false, 'salvar sem mudança não regrava nem cria backup');
  assert.strictEqual(again.backup, null);
});

test('Should_ReportReady_When_FileCheckRunsAfterApply', () => {
  const r = SC.fileCheck(store, KEYS, null);
  const by = Object.fromEntries(r.items.map((x) => [x.id, x.status]));
  assert.strictEqual(by.active, 'ok');
  assert.strictEqual(by.drift, 'ok');
  assert.strictEqual(by.block, 'ok');
  assert.strictEqual(by.hook, 'ok');
  assert.ok(r.history.count >= 3);
});

test('Should_RemoveOnlyOwnHook_When_ProfileDetached', () => {
  store.detach();
  const s = readJson(SETTINGS);
  assert.strictEqual(s.hooks.SessionStart.length, 1);
  assert.strictEqual(s.hooks.SessionStart[0].hooks[0].command, 'echo outro');
  assert.ok(!fs.readFileSync(MD, 'utf8').includes('Perfil ativo'));
  assert.ok(!(s.permissions && s.permissions.deny || []).includes('mcp__rea'));
});
