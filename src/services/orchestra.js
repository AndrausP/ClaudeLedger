'use strict';
// Gestão da extensão Orchestra Core (plugin "orchestra").
// Fontes (todas SÓ LEITURA — o Ledger nunca escreve no Orchestra, conforme docs/ledger-integration.md da extensão):
//  1. catálogo: catalogs/agents.json, catalogs/skills.json, catalogs/manifest.json, .claude-plugin/plugin.json, hooks/hooks.json
//  2. runtime por projeto: <projeto>/.orchestra/orchestra.db (tasks, transitions, checkpoints, memories, event_outbox)
//  3. uso real: banco do Ledger (subagentes cujo nome casa com um agente do catálogo, skills orchestra:*)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { reqWhere, toolWhere, sessionIn } = require('./filters');
const { quantile } = require('../domain/efficiency');

const PROTOCOL_MAJOR = 1;
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
// o catálogo às vezes traz texto onde se espera lista ("tools": "Read, Grep") — normaliza sempre para lista
const arr = (x) => (Array.isArray(x) ? x.map(String) : x == null || x === '' ? [] : String(x).split(/\s*[,;]\s*/).filter(Boolean));
const MODEL_FAMILY = (m) => (/opus/i.test(m) ? 'opus' : /sonnet/i.test(m) ? 'sonnet' : /haiku/i.test(m) ? 'haiku' : /fable/i.test(m) ? 'fable' : m);
// ferramentas internas do runtime do Claude Code que não precisam constar na lista do agente
const RUNTIME_TOOLS = new Set(['SubagentHandback', 'ToolSearch', 'TodoWrite']);

const isOrchestraRoot = (dir) => { const p = readJson(path.join(dir, '.claude-plugin', 'plugin.json')); return !!(p && p.name === 'orchestra' && fs.existsSync(path.join(dir, 'catalogs', 'agents.json'))); };

// onde está a extensão: caminho configurado → plugin instalado → projeto conhecido do Ledger que é o repositório dela
function locate(db, configured) {
  const tried = [];
  if (configured) { tried.push(configured); if (isOrchestraRoot(configured)) return { root: configured, via: 'configurado' }; }
  const inst = readJson(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'));
  for (const [key, list] of Object.entries((inst && inst.plugins) || {})) {
    if (!key.startsWith('orchestra@')) continue;
    const ip = (Array.isArray(list) ? list[0] : list || {}).installPath;
    if (ip) { tried.push(ip); if (isOrchestraRoot(ip)) return { root: ip, via: 'plugin instalado (' + key + ')', pluginKey: key }; }
  }
  for (const r of db.prepare('SELECT root_path FROM projects WHERE root_path IS NOT NULL').all()) {
    if (isOrchestraRoot(r.root_path)) return { root: r.root_path, via: 'projeto do Ledger' };
  }
  return { root: null, tried };
}

function catalog(root) {
  const agentsJ = readJson(path.join(root, 'catalogs', 'agents.json')) || {};
  const skillsJ = readJson(path.join(root, 'catalogs', 'skills.json')) || {};
  const manifest = readJson(path.join(root, 'catalogs', 'manifest.json')) || {};
  const plugin = readJson(path.join(root, '.claude-plugin', 'plugin.json')) || {};
  const hooksJ = readJson(path.join(root, 'hooks', 'hooks.json')) || {};
  const major = Number(String(agentsJ.schema_version || '0').split('.')[0]);
  const hooks = Object.entries(hooksJ.hooks || hooksJ).filter(([, v]) => Array.isArray(v)).map(([event, v]) => ({ event, handlers: v.reduce((n, m) => n + ((m.hooks || [m]).length), 0) }));
  return {
    root, compatible: major === PROTOCOL_MAJOR, schema_version: agentsJ.schema_version || null,
    plugin: { name: plugin.name, displayName: plugin.displayName, version: plugin.version, license: plugin.license, description: plugin.description },
    manifest,
    departments: (agentsJ.departments || []).map((d) => ({ id: d.id, name: d.name, leader: d.leader, agents: d.agents || [] })),
    agents: (agentsJ.agents || []).map((a) => ({
      id: a.id, name: a.name, department: a.department, department_name: a.department_name, leader: !!a.leader,
      responsibility: a.responsibility, problems: arr(a.problems), limits: arr(a.limits), tools: arr(a.tools),
      primary_skill: a.primary_skill, shared_skills: arr(a.shared_skills), model: a.model, alternatives: arr(a.alternatives), effort: a.effort,
      budget: a.budget && typeof a.budget === 'object' ? a.budget : {}, inputs: arr(a.inputs), outputs: arr(a.outputs), success: arr(a.success), escalation: arr(a.escalation), not_call: arr(a.not_call),
    })),
    skills: { primary: (skillsJ.primary || []).length, shared: (skillsJ.shared || []).length, commands: (skillsJ.commands || []).length },
    commands: (skillsJ.commands || []).map((c) => (typeof c === 'string' ? c : c.id || c.name)).filter(Boolean),
    hooks,
  };
}

// runtime de cada projeto que tem .orchestra/orchestra.db (abre só leitura; esquema desconhecido = indisponível)
function runtimes(db, extraRoots = [], F = {}) {
  const roots = new Map();
  for (const r of db.prepare('SELECT id, name, root_path FROM projects WHERE root_path IS NOT NULL').all()) roots.set(r.root_path.toLowerCase(), r);
  for (const x of extraRoots) if (x && !roots.has(x.toLowerCase())) roots.set(x.toLowerCase(), { id: null, name: path.basename(x), root_path: x });
  const ex = new Set(F.exclude || []);
  const out = [];
  for (const r of roots.values()) {
    if (r.id && ex.has(r.id)) continue;
    if (F.project && r.id !== F.project) continue;
    const file = path.join(r.root_path, '.orchestra', 'orchestra.db');
    if (!fs.existsSync(file)) continue;
    const info = { project_id: r.id, name: r.name, root: r.root_path, project: readJson(path.join(r.root_path, '.orchestra', 'project.json')) || {}, tasks: [], transitions: [], events: [], counts: {}, error: null };
    let odb;
    try {
      odb = new DatabaseSync(file, { readOnly: true });
      const has = (t) => !!odb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
      const cnt = (t) => (has(t) ? odb.prepare(`SELECT count(*) n FROM "${t}"`).get().n : null);
      info.counts = { tasks: cnt('tasks'), transitions: cnt('transitions'), checkpoints: cnt('checkpoints'), memories: cnt('memories'), components: cnt('components'), events: cnt('event_outbox') };
      const inRange = (iso) => { const t = Date.parse(iso); return (F.from == null || t >= F.from) && (F.to == null || t <= F.to); };
      if (has('tasks')) {
        info.tasks = odb.prepare('SELECT task_id, parent_task_id, title, mode, risk, status, owner, selected_agents_json, budget_profile, revision, created_at FROM tasks ORDER BY created_at DESC LIMIT 2000').all()
          .filter((t) => inRange(t.created_at))
          .map((t) => { let ag = []; try { ag = JSON.parse(t.selected_agents_json); } catch { /* formato inesperado */ } return { ...t, selected_agents: Array.isArray(ag) ? ag.map((x) => (typeof x === 'string' ? x : x.id || x.agent_id || '?')) : [], selected_agents_json: undefined }; });
      }
      if (has('transitions')) info.transitions = odb.prepare('SELECT transition_id, task_id, from_status, to_status, actor_type, actor_id, reason_code, occurred_at FROM transitions ORDER BY occurred_at DESC LIMIT 5000').all().filter((t) => inRange(t.occurred_at));
      if (has('event_outbox')) {
        info.events = odb.prepare('SELECT sequence, event_id, event_json, exported_at FROM event_outbox ORDER BY sequence DESC LIMIT 2000').all().map((e) => {
          let j = {}; try { j = JSON.parse(e.event_json); } catch { /* evento inválido */ }
          const ok = String(j.schema_version || '').split('.')[0] === String(PROTOCOL_MAJOR);
          return { sequence: e.sequence, event_id: e.event_id, type: j.event_type || '?', occurred_at: j.occurred_at || null, task_id: j.task_id || null, source: j.source || null, classification: j.data_classification || null, compatible: ok, exported: !!e.exported_at };
        }).filter((e) => !e.occurred_at || inRange(e.occurred_at));
      }
    } catch (err) { info.error = err.message; } finally { if (odb) odb.close(); }
    out.push(info);
  }
  return out;
}

// nomes pelos quais um agente do catálogo aparece no Claude Code
const aliases = (id) => [id, 'orchestra:' + id];

function usage(db, cat, F = {}) {
  const r = reqWhere(F), t = toolWhere(F);
  const byAgent = new Map(cat.agents.map((a) => [a.id, a]));
  const names = [...byAgent.keys()].flatMap(aliases);
  if (!names.length) return { agents: {}, skills: [], sessions: 0 };
  const ph = names.map(() => '?').join(',');
  const idOf = (name) => (name.startsWith('orchestra:') ? name.slice(10) : name);
  const res = {};
  const ensure = (id) => res[id] || (res[id] = { executions: 0, sessions: new Set(), requests: 0, cost: null, models: {}, calls: 0, ok: 0, err: 0, denied: 0, tools: {}, off_tools: {}, turns: [], over_budget: 0, last_at: 0 });
  // respostas por agente/modelo
  for (const x of db.prepare(`SELECT a.name, a.id aid, m.session_id, m.model, m.recalculated_cost cost, m.started_at FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} AND a.name IN (${ph})`).all(...r.args, ...names)) {
    const u = ensure(idOf(x.name));
    u.requests++; u.sessions.add(x.session_id); u.cost = (u.cost || 0) + (x.cost || 0);
    const fam = MODEL_FAMILY(x.model); u.models[fam] = (u.models[fam] || 0) + 1;
    if (x.started_at > u.last_at) u.last_at = x.started_at;
  }
  // turnos por execução (respostas por instância do subagente) × orçamento max_turns do catálogo
  for (const x of db.prepare(`SELECT a.name, a.id aid, count(*) n FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} AND a.name IN (${ph}) GROUP BY a.id`).all(...r.args, ...names)) {
    const id = idOf(x.name), u = ensure(id), max = (byAgent.get(id).budget || {}).max_turns;
    u.executions++; u.turns.push(x.n); if (max && x.n > max) u.over_budget++;
  }
  // ferramentas: acurácia e uso fora da lista permitida
  for (const x of db.prepare(`SELECT a.name, t.tool_name, t.status, count(*) n FROM tool_calls t JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id WHERE ${t.sql} AND a.name IN (${ph}) GROUP BY a.name, t.tool_name, t.status`).all(...t.args, ...names)) {
    const id = idOf(x.name), u = ensure(id), allowed = new Set(byAgent.get(id).tools);
    u.calls += x.n; u.tools[x.tool_name] = (u.tools[x.tool_name] || 0) + x.n;
    if (x.status === 'ok') u.ok += x.n; else if (x.status === 'erro') u.err += x.n; else if (x.status === 'negado') u.denied += x.n;
    if (!allowed.has(x.tool_name) && !RUNTIME_TOOLS.has(x.tool_name)) u.off_tools[x.tool_name] = (u.off_tools[x.tool_name] || 0) + x.n;
  }
  const agents = {};
  for (const [id, u] of Object.entries(res)) {
    const c = byAgent.get(id), fams = Object.keys(u.models);
    const total = Object.values(u.models).reduce((a, b) => a + b, 0);
    const onModel = (u.models[c.model] || 0) + c.alternatives.reduce((a, m) => a + (u.models[m] || 0), 0);
    agents[id] = {
      executions: u.executions, sessions: u.sessions.size, requests: u.requests, cost: u.cost, last_at: u.last_at || null,
      models: u.models, model_used: fams.sort((a, b) => u.models[b] - u.models[a])[0] || null,
      model_adherence: total ? onModel / total : null, // recomendado ou alternativa prevista no catálogo
      calls: u.calls, ok: u.ok, err: u.err, denied: u.denied, accuracy: u.ok + u.err ? u.ok / (u.ok + u.err) : null,
      tools: u.tools, off_tools: u.off_tools, off_tool_calls: Object.values(u.off_tools).reduce((a, b) => a + b, 0),
      turns_median: quantile(u.turns, 0.5), turns_max: u.turns.length ? Math.max(...u.turns) : null, over_budget: u.over_budget,
    };
  }
  // skills orchestra:* chamadas (em qualquer agente)
  const skills = db.prepare(`SELECT json_extract(e.payload_sanitized, '$.label') skill, count(*) n, max(t.started_at) last_at FROM tool_calls t
      JOIN agents a ON a.id = t.agent_id JOIN sessions s ON s.id = t.session_id
      JOIN session_events e ON e.source = 'transcript' AND e.source_event_id = 'tool:' || t.id
    WHERE ${t.sql} AND t.tool_name = 'Skill' AND json_extract(e.payload_sanitized, '$.label') LIKE 'orchestra:%' GROUP BY skill ORDER BY n DESC`).all(...t.args);
  const sessions = db.prepare(`SELECT count(DISTINCT m.session_id) n FROM model_requests m JOIN agents a ON a.id = m.agent_id JOIN sessions s ON s.id = m.session_id WHERE ${r.sql} AND a.name IN (${ph})`).get(...r.args, ...names).n;
  return { agents, skills, sessions };
}

function overview(db, F = {}, configured) {
  const loc = locate(db, configured);
  if (!loc.root) return { found: false, tried: loc.tried };
  const cat = catalog(loc.root);
  const use = usage(db, cat, F);
  const rts = runtimes(db, [loc.root], F);
  const used = cat.agents.filter((a) => use.agents[a.id]);
  // por departamento
  const deps = cat.departments.concat(cat.agents.some((a) => a.department === 'central') ? [{ id: 'central', name: 'Central', agents: cat.agents.filter((a) => a.department === 'central').map((a) => a.id) }] : [])
    .map((d) => {
      const us = d.agents.map((id) => use.agents[id]).filter(Boolean);
      const ok = us.reduce((a, u) => a + u.ok, 0), err = us.reduce((a, u) => a + u.err, 0);
      return { ...d, used: us.length, executions: us.reduce((a, u) => a + u.executions, 0), cost: us.reduce((a, u) => a + (u.cost || 0), 0), calls: us.reduce((a, u) => a + u.calls, 0), accuracy: ok + err ? ok / (ok + err) : null };
    });
  const tasksAll = rts.flatMap((r) => r.tasks.map((t) => ({ ...t, project: r.name })));
  const byStatus = {};
  for (const t of tasksAll) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  const sum = (k) => Object.values(use.agents).reduce((a, u) => a + (u[k] || 0), 0);
  return {
    found: true, via: loc.via, pluginKey: loc.pluginKey || null, catalog: cat, usage: use, runtimes: rts, departments: deps,
    totals: {
      agents: cat.agents.length, used: used.length, executions: sum('executions'), cost: sum('cost'), calls: sum('calls'),
      accuracy: sum('ok') + sum('err') ? sum('ok') / (sum('ok') + sum('err')) : null, over_budget: sum('over_budget'), off_tool_calls: sum('off_tool_calls'),
      sessions: use.sessions, tasks: tasksAll.length, tasks_by_status: byStatus, runtimes: rts.length,
      events: rts.reduce((a, r) => a + r.events.length, 0), incompatible_events: rts.reduce((a, r) => a + r.events.filter((e) => !e.compatible).length, 0),
    },
    tasks: tasksAll,
  };
}

module.exports = { locate, catalog, runtimes, usage, overview, aliases, isOrchestraRoot, MODEL_FAMILY };
