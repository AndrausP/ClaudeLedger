'use strict';
// "A próxima sessão do Claude Code vai abrir com o perfil?" — validação em dois níveis:
//  1. arquivos (grátis): perfil aplicado, divergência desde a aplicação, sobrescritas do projeto
//  2. sessão real (opcional, usa o plano): abre `claude -p` e lê o evento de inicialização
//     (modelo efetivo, plugins, MCP, skills, ferramentas e quais CLAUDE.md foram carregados)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const CLAUDE_DIR = process.env.LEDGER_CLAUDE_DIR || path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md');
const START = '<!-- CLAUDE-LEDGER:PROFILE START';
const END = '<!-- CLAUDE-LEDGER:PROFILE END -->';
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
const family = (m) => (/opus/i.test(m) ? 'opus' : /sonnet/i.test(m) ? 'sonnet' : /haiku/i.test(m) ? 'haiku' : /fable/i.test(m) ? 'fable' : String(m || ''));
const item = (id, label, status, detail) => ({ id, label, status, detail }); // status: ok | warn | fail | info
// listas do evento de init podem vir como texto ou objeto, conforme a versão do Claude Code
const names = (list) => (Array.isArray(list) ? list : []).map((x) => (typeof x === 'string' ? x : x && (x.name || x.id || x.path))).filter(Boolean).map(String);

function currentBlock() {
  let md = '';
  try { md = fs.readFileSync(CLAUDE_MD, 'utf8'); } catch { return null; }
  const i = md.indexOf(START), j = md.indexOf(END);
  return i >= 0 && j > i ? md.slice(i, j + END.length) : null;
}

// configurações do projeto que têm prioridade sobre as do usuário
function projectOverrides(dir) {
  if (!dir) return [];
  const out = [];
  for (const f of ['settings.json', 'settings.local.json']) {
    const s = readJson(path.join(dir, '.claude', f));
    if (!s) continue;
    for (const k of ['model', 'enabledPlugins', 'permissions', 'env', 'statusLine']) if (s[k] != null) out.push(`.claude/${f} define "${k}"`);
  }
  if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) out.push('CLAUDE.md do projeto também é carregado (soma às instruções do perfil)');
  return out;
}

// nível 1: só arquivos
function fileCheck(store, pluginKeys, projectDir) {
  const st = store.load();
  const p = st.profiles.find((x) => x.id === st.active);
  const items = [];
  if (!p) {
    items.push(item('active', 'Perfil aplicado', 'fail', 'Nenhum perfil foi aplicado: sessões novas abrem com a configuração atual do Claude Code, sem as regras e instruções de um perfil. Abra um perfil e use “Aplicar ao Claude Code…”.'));
    for (const o of projectOverrides(projectDir)) items.push(item('proj', 'Configuração do projeto', 'info', o));
    return { profile: null, items };
  }
  items.push(item('active', 'Perfil aplicado', 'ok', `“${p.name}” aplicado em ${st.appliedAt ? new Date(st.appliedAt).toLocaleString('pt-BR') : 'data desconhecida'}.`));
  // divergência: o que o perfil gravaria hoje × o que está nos arquivos
  const plan = store.plan(p, pluginKeys);
  const diffs = plan.changes.filter((c) => !c.startsWith('CLAUDE.md:'));
  items.push(diffs.length
    ? item('drift', 'Configuração igual à aplicada', 'fail', 'O settings.json mudou depois da aplicação: ' + diffs.join('; ') + '. Reaplique o perfil.')
    : item('drift', 'Configuração igual à aplicada', 'ok', 'Modelo, plugins e regras de bloqueio estão como o perfil gravou.'));
  const block = currentBlock();
  items.push(!block
    ? item('block', 'Instruções do perfil no CLAUDE.md', 'fail', 'O bloco do perfil não está no ~/.claude/CLAUDE.md — as instruções fixas não chegam às sessões. Reaplique o perfil.')
    : block.trim() === plan.block.trim()
      ? item('block', 'Instruções do perfil no CLAUDE.md', 'ok', 'Bloco presente e idêntico ao perfil.')
      : item('block', 'Instruções do perfil no CLAUDE.md', 'warn', 'O bloco existe mas está diferente do perfil (editado à mão ou perfil alterado depois). Reaplique.'));
  // hook SessionStart: é ele que garante o perfil em TODA sessão aberta, mesmo se algo mexer nos arquivos
  const hk = store.hookStatus ? store.hookStatus() : null;
  if (hk) {
    items.push(hk.installed && hk.scriptExists && hk.pointsHere
      ? item('hook', 'Sincronização ao abrir o Claude Code', 'ok', 'Hook SessionStart instalado: toda sessão nova confere o perfil e corrige o que divergiu antes de começar.')
      : item('hook', 'Sincronização ao abrir o Claude Code', 'fail', !hk.installed ? 'Hook não instalado (Node.js não encontrado ao aplicar, ou removido do settings.json). Reaplique o perfil.' : !hk.scriptExists ? 'O hook aponta para um script que não existe mais. Reaplique o perfil.' : 'O hook aponta para outra instalação do app. Reaplique o perfil.'));
    const h = store.syncHistory(1);
    if (h.count) {
      const last = h.items[0];
      items.push(item('hook-last', 'Última sessão aberta', 'info', `${new Date(last.at).toLocaleString('pt-BR')} · perfil “${last.profile}”${last.cwd ? ' · ' + last.cwd.replace(os.homedir(), '~') : ''} · ${last.fixed && last.fixed.length ? 'corrigiu: ' + last.fixed.join(', ') : 'nada a corrigir'}. ${h.count} sessão(ões) sincronizada(s) até agora.`));
    }
  }
  if ((p.startSkills || []).length) items.push(item('start', 'Skills de início', 'info', 'Instruídas no CLAUDE.md: ' + p.startSkills.join(', ') + '. A execução depende do modelo seguir a instrução; confirme no teste de sessão real.'));
  for (const o of projectOverrides(projectDir)) items.push(item('proj', 'Configuração do projeto', o.includes('CLAUDE.md') ? 'info' : 'warn', o + (o.includes('CLAUDE.md') ? '' : ' — tem prioridade sobre o perfil nesse projeto.')));
  return { profile: p, items, history: store.syncHistory ? store.syncHistory() : null };
}

// nível 2: abre uma sessão real e lê o evento de inicialização
function probe(cwd, claudeBin = process.env.CLAUDE_BIN || 'claude') {
  return new Promise((resolve) => {
    // pergunta objetiva: só acerta se o bloco do perfil estiver de fato no contexto da sessão
    const prompt = 'Verificação automática do Claude Ledger. Procure nas suas instruções a linha que começa com "# Perfil ativo:". Responda SOMENTE com o nome que vem depois dos dois-pontos, sem mais nada. Se essa linha não existir, responda SOMENTE: NENHUM';
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', '1'];
    execFile(claudeBin, args, { cwd: cwd || os.homedir(), timeout: 180000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: { ...process.env } }, (err, out, se) => {
      if (err && err.code === 'ENOENT') return resolve({ ok: false, error: 'Claude Code não encontrado no PATH.' });
      let init = null, result = null;
      for (const line of String(out || '').split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.type === 'system' && j.subtype === 'init' && !init) init = j;
        if (j.type === 'result') result = j;
      }
      if (!init) return resolve({ ok: false, error: 'A sessão não iniciou: ' + String(se || (err && err.message) || 'sem saída').split('\n').slice(0, 2).join(' ') });
      resolve({
        ok: true,
        init: {
          model: init.model, version: init.claude_code_version, cwd: init.cwd, permissionMode: init.permissionMode,
          plugins: (init.plugins || []).map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean),
          mcp: (init.mcp_servers || []).map((x) => ({ name: x.name, status: x.status })),
          skills: names(init.skills), agents: names(init.agents), tools: names(init.tools),
          memory: (Array.isArray(init.memory_paths) ? init.memory_paths : Object.values(init.memory_paths || {})).map((x) => (typeof x === 'string' ? x : x && (x.path || x.file))).filter(Boolean),
        },
        cost: result ? result.total_cost_usd : null, reply: result ? String(result.result || '').trim().slice(0, 80) : null,
      });
    });
  });
}

// compara o perfil com o que a sessão real carregou
function compareLive(profile, live) {
  const items = [];
  const i = live.init;
  items.push(item('live', 'Sessão nova abriu', 'ok', `Claude Code ${i.version || ''} em ${i.cwd} · modo de permissão ${i.permissionMode}${live.cost != null ? ' · custo do teste US$ ' + live.cost.toFixed(3) : ''}.`));
  const memUser = i.memory.some((m) => path.resolve(m).toLowerCase() === CLAUDE_MD.toLowerCase());
  const block = currentBlock();
  if (profile) {
    const reply = String(live.reply || '').replace(/[`*"“”.]/g, '').trim();
    const knows = reply.toLowerCase() === profile.name.trim().toLowerCase();
    // algumas versões do Claude Code só listam a pasta de auto-memória em memory_paths;
    // a prova de que o CLAUDE.md foi lido é a resposta da sessão (live-follow)
    if (!block) items.push(item('live-md', 'Sessão leu as instruções do perfil', 'fail', 'O bloco do perfil não está no ~/.claude/CLAUDE.md.'));
    else if (memUser || knows) items.push(item('live-md', 'Sessão leu as instruções do perfil', 'ok', memUser ? 'O ~/.claude/CLAUDE.md está entre os arquivos carregados.' : 'Confirmado pela resposta da sessão (esta versão do Claude Code não lista o CLAUDE.md no evento de início).'));
    else items.push(item('live-md', 'Sessão leu as instruções do perfil', 'fail', 'O bloco existe, mas a sessão não mostrou sinal de ter lido o ~/.claude/CLAUDE.md.'));
    items.push(item('live-follow', 'Sessão conhece o perfil', knows ? 'ok' : 'fail',
      knows ? `Perguntada pelo perfil ativo, a sessão respondeu “${reply}” — as instruções estão no contexto.` : `Perguntada pelo perfil ativo, a sessão respondeu “${reply || '(vazio)'}” em vez de “${profile.name}”.`));
    if ('hookRan' in live) items.push(live.hookRan
      ? item('live-hook', 'Hook rodou na abertura', 'ok', 'A sessão de teste passou pelo hook do perfil' + (live.hookRan.fixed && live.hookRan.fixed.length ? ' e ele corrigiu: ' + live.hookRan.fixed.join(', ') : ' (nada a corrigir)') + '.')
      : item('live-hook', 'Hook rodou na abertura', 'fail', 'A sessão abriu sem passar pelo hook do perfil. Reaplique o perfil e confira se o Node.js está no PATH.'));
    if (profile.model) {
      const ok = family(i.model) === family(profile.model) || i.model === profile.model;
      items.push(item('live-model', 'Modelo', ok ? 'ok' : 'fail', `Perfil: ${profile.model} · sessão: ${i.model}.` + (ok ? '' : ' Algo (variável de ambiente, configuração do projeto ou /model salvo) está sobrescrevendo.')));
    } else items.push(item('live-model', 'Modelo', 'info', `Perfil usa o padrão do Claude Code · sessão: ${i.model}.`));
    const loaded = new Set(i.plugins);
    const disabled = (profile.disabledPlugins || []).map((k) => k.split('@')[0]);
    const leaked = disabled.filter((n) => loaded.has(n));
    items.push(item('live-plugins', 'Plugins desligados pelo perfil', leaked.length ? 'fail' : 'ok', leaked.length ? 'Carregados mesmo assim: ' + leaked.join(', ') : disabled.length ? 'Nenhum dos ' + disabled.length + ' plugin(s) desligado(s) foi carregado.' : 'O perfil não desliga plugins. Carregados: ' + [...loaded].join(', ')));
    const blocked = profile.blockedMcp || [];
    if (blocked.length) {
      const prefix = (id) => (id.includes('/') ? 'mcp__plugin_' + id.replace('/', '_') + '__' : 'mcp__' + id + '__');
      const exposed = blocked.filter((id) => i.tools.some((t) => t.startsWith(prefix(id))));
      items.push(item('live-mcp', 'MCP bloqueados', exposed.length ? 'warn' : 'ok', exposed.length ? 'Ferramentas ainda visíveis (a regra de bloqueio impede o uso, mas elas aparecem): ' + exposed.join(', ') : 'Nenhuma ferramenta dos ' + blocked.length + ' MCP bloqueado(s) foi exposta à sessão.'));
    }
    const bs = profile.blockedSkills || [];
    if (bs.length) {
      const visible = bs.filter((s) => i.skills.includes(s));
      items.push(item('live-skills', 'Skills bloqueadas', visible.length ? 'warn' : 'ok', visible.length ? 'Listadas na sessão (bloqueadas pela regra Skill(...) e pela instrução, mas visíveis): ' + visible.join(', ') : 'Nenhuma skill bloqueada aparece na sessão.'));
    }
  } else {
    items.push(item('live-follow', 'Sessão sem perfil', 'info', `Perguntada pelo perfil ativo, a sessão respondeu “${String(live.reply || '').trim() || '(vazio)'}”.`));
    items.push(item('live-model', 'Modelo da sessão', 'info', i.model));
    items.push(item('live-plugins', 'Plugins carregados', 'info', i.plugins.join(', ') || 'nenhum'));
  }
  const failing = i.mcp.filter((m) => !['connected', 'disabled'].includes(m.status));
  if (failing.length) items.push(item('live-mcp-status', 'MCP com problema', 'warn', failing.map((m) => `${m.name}: ${m.status}`).join(' · ')));
  items.push(item('live-memory', 'Arquivos de instrução carregados', 'info', i.memory.map((m) => m.replace(os.homedir(), '~')).join(' · ') || 'nenhum'));
  return items;
}

module.exports = { fileCheck, probe, compareLive, projectOverrides };
