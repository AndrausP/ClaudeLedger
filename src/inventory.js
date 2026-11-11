'use strict';
// Inventário do que está instalado: plugins, skills, agentes e MCP servers.
// Lê só NOMES de ~/.claude.json (nunca valores — podem conter segredos).
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE = path.join(os.homedir(), '.claude');

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function ls(d) { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } }

function skillsIn(dir) {
  return ls(dir).filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).map(e => e.name);
}
// nome do agente = 'name:' do frontmatter (é o que aparece no transcrito); cai pro nome do arquivo
function mdIn(dir) {
  return ls(dir).filter(e => e.isFile() && e.name.endsWith('.md')).map(e => {
    const base = e.name.replace(/\.md$/, '');
    try {
      const head = fs.readFileSync(path.join(dir, e.name), 'utf8').slice(0, 800);
      const m = /^name:[ \t]*["']?(.+?)["']?[ \t]*\r?$/m.exec(head);
      return m ? m[1].trim() : base;
    } catch { return base; }
  });
}
function mcpNames(obj) {
  if (!obj) return [];
  const s = obj.mcpServers || obj;
  return s && typeof s === 'object' ? Object.keys(s) : [];
}

function getInventory() {
  const installed = (readJson(path.join(CLAUDE, 'plugins', 'installed_plugins.json')) || {}).plugins || {};
  const settings = readJson(path.join(CLAUDE, 'settings.json')) || {};
  const enabled = settings.enabledPlugins || {};

  const plugins = [];
  const skills = [];
  const agents = [];
  const mcps = [];

  for (const [key, installs] of Object.entries(installed)) {
    const name = key.split('@')[0];
    const inst = Array.isArray(installs) ? installs[0] : installs;
    const dir = inst && inst.installPath;
    const pSkills = dir ? skillsIn(path.join(dir, 'skills')) : [];
    const pAgents = dir ? mdIn(path.join(dir, 'agents')) : [];
    const pCmds = dir ? mdIn(path.join(dir, 'commands')) : [];
    let pMcp = [];
    if (dir) pMcp = mcpNames(readJson(path.join(dir, '.mcp.json')));
    plugins.push({
      id: name, key, version: inst && inst.version, scope: inst && inst.scope,
      enabled: enabled[key] !== false, skills: pSkills.length, agents: pAgents.length, commands: pCmds.length, mcps: pMcp.length,
    });
    for (const s of pSkills) skills.push({ id: `${name}:${s}`, name: s, plugin: name, source: 'plugin' });
    for (const a of pAgents) agents.push({ id: a, name: a, plugin: name, source: 'plugin' });
    for (const m of pMcp) mcps.push({ id: `${name}/${m}`, name: m, plugin: name, source: 'plugin' });
  }

  for (const s of skillsIn(path.join(CLAUDE, 'skills'))) skills.push({ id: s, name: s, plugin: null, source: 'user' });
  for (const a of mdIn(path.join(CLAUDE, 'agents'))) agents.push({ id: a, name: a, plugin: null, source: 'user' });

  const userMcp = new Set([
    ...mcpNames(readJson(path.join(CLAUDE, 'mcp.json'))),
    ...mcpNames(readJson(path.join(os.homedir(), '.claude.json'))), // só chaves de topo de mcpServers
  ]);
  for (const m of userMcp) mcps.push({ id: m, name: m, plugin: null, source: 'user' });

  return { plugins, skills, agents, mcps };
}

module.exports = { getInventory };
