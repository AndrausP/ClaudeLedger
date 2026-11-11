'use strict';
// Perfis: cada um define modelo, plugins, MCP/skills bloqueados e instruções fixas.
// Aplicar = gravar em ~/.claude/settings.json + bloco gerenciado no ~/.claude/CLAUDE.md.
// Toda sessão NOVA do Claude Code passa a seguir o perfil. Backup antes de cada gravação.
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE, 'settings.json');
const CLAUDE_MD = path.join(CLAUDE, 'CLAUDE.md');
const START = '<!-- CLAUDE-LEDGER:PROFILE START (gerado pelo Claude Ledger — não edite à mão) -->';
const END = '<!-- CLAUDE-LEDGER:PROFILE END -->';

function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } }
function writeJson(f, v) { fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); }

// regras de deny que o perfil produz
function denyRules(p) {
  return [
    ...(p.blockedMcp || []).map((id) => (id.includes('/') ? `mcp__plugin_${id.replace('/', '_')}` : `mcp__${id}`)),
    ...(p.blockedSkills || []).map((s) => `Skill(${s})`),
  ];
}

function instructionsBlock(p) {
  const lines = [`# Perfil ativo: ${p.name}`, '', 'Instruções fixas deste perfil — valem para toda sessão, sem precisar ativar no chat.', ''];
  if (p.caveman) lines.push('- Caveman sempre ativo (nível full) em toda resposta. Nunca desativar sem o usuário pedir.');
  if (p.nirvana) lines.push('- Nirvana sempre ativo: toda ideia do usuário segue o Protocolo do Broker e a cadeia dos 9 agentes descrita neste arquivo, sem precisar de comando no chat.');
  if ((p.startSkills || []).length) lines.push(`- No início de toda sessão, antes da primeira resposta, invoque estas skills na ordem: ${p.startSkills.map((s) => '`' + s + '`').join(', ')}.`);
  if ((p.blockedSkills || []).length) lines.push(`- Não use estas skills neste perfil: ${p.blockedSkills.join(', ')}.`);
  if ((p.blockedMcp || []).length) lines.push(`- Não use estes MCP servers neste perfil: ${p.blockedMcp.join(', ')}.`);
  const extra = (p.instructions || '').trim();
  if (extra) lines.push('', extra);
  return `${START}\n${lines.join('\n')}\n${END}`;
}

function mergeClaudeMd(text, block) {
  const re = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n?`);
  if (re.test(text)) return text.replace(re, block ? block + '\n' : '');
  return block ? `${text.replace(/\s*$/, '')}\n\n${block}\n` : text;
}

function createStore(userData) {
  const FILE = path.join(userData, 'profiles.json');
  const BACKUPS = path.join(userData, 'backups');

  const load = () => readJson(FILE, { active: null, owned: [], profiles: [] });
  const save = (st) => writeJson(FILE, st);

  function current() {
    const s = readJson(SETTINGS, {});
    return { model: s.model || '', enabledPlugins: s.enabledPlugins || {}, deny: (s.permissions && s.permissions.deny) || [] };
  }

  function backup() {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(BACKUPS, stamp);
    fs.mkdirSync(dir);
    for (const f of [SETTINGS, CLAUDE_MD]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, path.basename(f)));
    return dir;
  }

  // o que será gravado — mostrado antes de aplicar
  function plan(p, pluginKeys) {
    const st = load();
    const cur = current();
    const s = readJson(SETTINGS, {});
    const changes = [];
    if ((p.model || '') !== (s.model || '')) changes.push(`model: ${s.model || '(padrão)'} → ${p.model || '(padrão)'}`);
    for (const k of pluginKeys) {
      const want = !(p.disabledPlugins || []).includes(k);
      const has = cur.enabledPlugins[k] !== false;
      if (want !== has) changes.push(`plugin ${k}: ${has ? 'ativo' : 'desativado'} → ${want ? 'ativo' : 'desativado'}`);
    }
    const owned = new Set(st.owned);
    const keep = cur.deny.filter((r) => !owned.has(r));
    const next = [...new Set([...keep, ...denyRules(p)])];
    for (const r of next) if (!cur.deny.includes(r)) changes.push(`bloquear: ${r}`);
    for (const r of cur.deny) if (!next.includes(r)) changes.push(`desbloquear: ${r}`);
    changes.push(`CLAUDE.md: bloco do perfil “${p.name}”`);
    return { changes, block: instructionsBlock(p), denyNext: next };
  }

  function apply(id, pluginKeys) {
    const st = load();
    const p = st.profiles.find((x) => x.id === id);
    if (!p) throw new Error('perfil não encontrado');
    const { denyNext, block } = plan(p, pluginKeys);
    const bdir = backup();

    const s = readJson(SETTINGS, {}); // preserva todas as outras chaves
    if (p.model) s.model = p.model; else delete s.model;
    s.enabledPlugins = s.enabledPlugins || {};
    for (const k of pluginKeys) s.enabledPlugins[k] = !(p.disabledPlugins || []).includes(k);
    s.permissions = s.permissions || {};
    if (denyNext.length) s.permissions.deny = denyNext; else delete s.permissions.deny;
    writeJson(SETTINGS, s);

    const md = fs.existsSync(CLAUDE_MD) ? fs.readFileSync(CLAUDE_MD, 'utf8') : '';
    fs.writeFileSync(CLAUDE_MD, mergeClaudeMd(md, block));

    st.active = id;
    st.owned = denyRules(p);
    st.appliedAt = Date.now();
    save(st);
    return { backup: bdir, state: st };
  }

  // remove tudo que o app gravou (bloco + denies próprios); mantém modelo/plugins como estão
  function detach() {
    const st = load();
    const bdir = backup();
    const s = readJson(SETTINGS, {});
    if (s.permissions && s.permissions.deny) {
      s.permissions.deny = s.permissions.deny.filter((r) => !st.owned.includes(r));
      if (!s.permissions.deny.length) delete s.permissions.deny;
      writeJson(SETTINGS, s);
    }
    if (fs.existsSync(CLAUDE_MD)) fs.writeFileSync(CLAUDE_MD, mergeClaudeMd(fs.readFileSync(CLAUDE_MD, 'utf8'), ''));
    st.active = null; st.owned = [];
    save(st);
    return { backup: bdir, state: st };
  }

  // Perfil de time: grava no .claude/settings.json e CLAUDE.md DO PROJETO.
  // Quem clona o repo e abre o Claude Code ali recebe o mesmo setup (o Claude Code pede para instalar os marketplaces).
  function exportToProject(p, dir, pluginKeys) {
    const known = readJson(path.join(CLAUDE, 'plugins', 'known_marketplaces.json'), {});
    const sdir = path.join(dir, '.claude');
    const sfile = path.join(sdir, 'settings.json');
    const mdfile = path.join(dir, 'CLAUDE.md');
    fs.mkdirSync(sdir, { recursive: true });
    const written = [];
    for (const f of [sfile, mdfile]) if (fs.existsSync(f)) { fs.copyFileSync(f, f + '.bak-ledger'); written.push(f + '.bak-ledger (backup)'); }

    const s = readJson(sfile, {});
    if (p.model) s.model = p.model;
    s.enabledPlugins = s.enabledPlugins || {};
    const markets = new Set();
    for (const k of pluginKeys) {
      const on = !(p.disabledPlugins || []).includes(k);
      s.enabledPlugins[k] = on;
      if (on) markets.add(k.split('@')[1]);
    }
    for (const m of markets) {
      if (m === 'claude-plugins-official' || !known[m] || !known[m].source) continue;
      s.extraKnownMarketplaces = s.extraKnownMarketplaces || {};
      const src = known[m].source;
      if (src.source === 'directory' || src.path) continue; // pasta local não serve para o time
      s.extraKnownMarketplaces[m] = { source: src };
    }
    const rules = denyRules(p);
    if (rules.length) { s.permissions = s.permissions || {}; s.permissions.deny = [...new Set([...(s.permissions.deny || []), ...rules])]; }
    writeJson(sfile, s); written.push(sfile);

    const md = fs.existsSync(mdfile) ? fs.readFileSync(mdfile, 'utf8') : '';
    fs.writeFileSync(mdfile, mergeClaudeMd(md, instructionsBlock(p))); written.push(mdfile);
    return { ok: true, written };
  }

  return { load, save, current, plan, apply, detach, exportToProject };
}

module.exports = { createStore };
