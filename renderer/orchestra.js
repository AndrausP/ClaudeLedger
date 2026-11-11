'use strict';
/* global TABS, S, esc, ico, ICON, tag, tip, table, render, fDate, fUsd, fUsd2, fPctBR, FX, card, LOADING, errBox, isErr, unavailable */
// Aba Orchestra: gestão da extensão Orchestra Core — catálogo × uso real × runtime, aderência ao catálogo e relatório.

Object.assign(ICON, {
  orchestra: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M12 11.5 6.5 16M12 11.5l5.5 4.5"/>',
  crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/>',
  report: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M15 3v4h4M9 12h7M9 16h7M9 8h3"/>',
});

document.getElementById('tabs').innerHTML = TABS.map(([k, l, i, , g], idx) => (idx === 0 || TABS[idx - 1][4] !== g ? '<div class="navsec">' + g + '</div>' : '') + '<button data-tab="' + k + '">' + ico(i) + '<span>' + l + '</span></button>').join('');

S.O = S.O || { sub: 'overview', agent: null, cache: {}, pending: {}, path: '' };
const ORC_SUBS = [['overview', 'Visão geral'], ['agents', 'Agentes'], ['tasks', 'Tarefas'], ['report', 'Relatório']];

function orcWant(key, ch, ...args) {
  const k = key + '|' + JSON.stringify(FX());
  if (k in S.O.cache) return S.O.cache[k];
  if (!S.O.pending[k]) {
    S.O.pending[k] = window.ledger.api(ch, ...args).then((r) => { S.O.cache[k] = r; delete S.O.pending[k]; render(); })
      .catch((e) => { S.O.cache[k] = { __error: e.message }; delete S.O.pending[k]; render(); });
  }
  return undefined;
}
const pctO = (x) => (x == null ? unavailable('sem uso no período') : fPctBR(x));
const accCls = (x) => (x == null ? '' : x >= 0.97 ? 'hi' : x >= 0.9 ? 'mid' : 'lo');
const projectNames = () => { const o = S.FO || { projects: [] }; return (FX().exclude || []).map((id) => (o.projects.find((p) => p.id === id) || { name: id }).name); };

// =============================== TELA ===============================
function viewOrchestra() {
  const o = orcWant('ov', 'orchestra:overview', FX());
  if (o === undefined) return LOADING;
  if (isErr(o)) return errBox(o);
  if (!o.found) return orcNotFound(o);
  if (S.O.agent) return orcAgentDetail(o, S.O.agent);
  const c = o.catalog;
  const head = '<div class="orchead">' + ico('orchestra', 'orclogo') + '<div><b>' + esc(c.plugin.displayName || 'Orchestra Core') + '</b> <span class="note">v' + esc(c.plugin.version || '?') + ' · ' + esc(c.plugin.license || '') + '</span>'
    + '<div class="orcmeta">' + tag(c.compatible ? 'ok' : 'bad', c.compatible ? 'protocolo 1.x compatível' : 'protocolo incompatível') + ' '
    + tag('info', o.totals.runtimes + ' projeto(s) com runtime') + ' ' + c.hooks.map((h) => tag('', 'hook ' + h.event)).join(' ')
    + '<span class="note"> encontrado via ' + esc(o.via) + ' · <span class="mono">' + esc(c.root) + '</span></span></div></div>'
    + '<button class="btn sm" data-orc-path>' + ico('folder') + 'Trocar pasta</button></div>';
  const tabs = '<div class="subtabs" role="tablist">' + ORC_SUBS.map(([k, l]) => '<button role="tab" data-orc-sub="' + k + '" class="' + (S.O.sub === k ? 'on' : '') + '">' + l + (k === 'tasks' ? '<span class="cnt">' + o.totals.tasks + '</span>' : k === 'agents' ? '<span class="cnt">' + c.agents.length + '</span>' : '') + '</button>').join('') + '</div>';
  const pathBox = S.O.editPath ? '<div class="card"><div class="lrow"><input data-orc-pathin value="' + esc(S.O.path || c.root) + '" placeholder="Pasta da extensão (contém .claude-plugin/plugin.json)" spellcheck="false"><button class="btn primary" data-orc-savepath>Salvar</button><button class="btn" data-orc-path>Cancelar</button></div>' + (S.O.pathErr ? '<div class="note" style="color:var(--bad)">' + esc(S.O.pathErr) + '</div>' : '') + '</div>' : '';
  let body = '';
  if (S.O.sub === 'overview') body = orcOverview(o);
  else if (S.O.sub === 'agents') body = orcAgents(o);
  else if (S.O.sub === 'tasks') body = orcTasks(o);
  else body = orcReport(o);
  return head + pathBox + tabs + body;
}

function orcNotFound(o) {
  return '<div class="state">' + ico('orchestra') + ' Extensão Orchestra Core não encontrada.</div>'
    + '<div class="card"><p class="sub" style="margin-top:0">O app procura: (1) a pasta configurada aqui, (2) o plugin <span class="mono">orchestra</span> instalado no Claude Code, (3) um projeto do Ledger que seja o repositório da extensão.</p>'
    + '<div class="lrow"><input data-orc-pathin value="' + esc(S.O.path) + '" placeholder="Ex.: C:\\\\projetos\\\\orchestra-core" spellcheck="false"><button class="btn primary" data-orc-savepath>Usar esta pasta</button></div>'
    + (S.O.pathErr ? '<div class="note" style="color:var(--bad)">' + esc(S.O.pathErr) + '</div>' : '') + (o.tried && o.tried.length ? '<div class="note">Já verificado: ' + o.tried.map(esc).join(' · ') + '</div>' : '') + '</div>';
}

// ---------- visão geral: organograma + indicadores ----------
function orcOverview(o) {
  const t = o.totals, c = o.catalog, u = o.usage.agents;
  const maxExec = Math.max(1, ...Object.values(u).map((x) => x.executions));
  const noUse = t.used === 0;
  const cards = '<div class="mcards six">'
    + card('Agentes em uso', 'bot', t.used + ' / ' + t.agents, fPctBR(t.used / t.agents, 0) + ' do catálogo no período')
    + card('Execuções', 'pulse', String(t.executions), t.sessions + ' sessão(ões)')
    + card('Custo equivalente', 'coins', fUsd2(t.cost || 0), 'só agentes do Orchestra')
    + card('Acurácia de ferramentas', 'target', pctO(t.accuracy), t.calls + ' chamada(s)')
    + card('Acima do orçamento', 'alert', String(t.over_budget), 'execuções com mais turnos que o max_turns do catálogo', t.over_budget ? 'warnc' : '')
    + card('Fora da lista de ferramentas', 'shield', String(t.off_tool_calls), 'chamadas que o catálogo não prevê para o agente', t.off_tool_calls ? 'warnc' : '')
    + '</div>';
  const deps = o.departments.map((d) => {
    const agents = d.agents.map((id) => c.agents.find((a) => a.id === id)).filter(Boolean);
    return '<div class="orgcol"><div class="orgh"><b>' + esc(d.name) + '</b><span>' + d.used + '/' + agents.length + ' em uso</span></div>'
      + agents.map((a) => {
        const x = u[a.id];
        const style = x ? 'background:rgba(' + (accCls(x.accuracy) === 'lo' ? '242,104,95' : accCls(x.accuracy) === 'mid' ? '245,195,91' : '126,226,184') + ',' + (0.12 + 0.5 * (x.executions / maxExec)).toFixed(2) + ')' : '';
        return '<button class="orgchip' + (x ? ' used' : '') + '" data-orc-agent="' + esc(a.id) + '" style="' + style + '"'
          + tip(a.name, [['Departamento', a.department_name || a.department], ['Modelo recomendado', a.model + (a.alternatives.length ? ' (alt.: ' + a.alternatives.join(', ') + ')' : '')], ['Execuções', x ? String(x.executions) : '0'], ['Acurácia', x && x.accuracy != null ? fPctBR(x.accuracy) : '—'], ['Custo', x ? fUsd(x.cost || 0) : '—']])
          + '>' + (a.leader ? ico('crown', 'lead') : '') + '<span>' + esc(a.name) + '</span>' + (x ? '<em>' + x.executions + '</em>' : '') + '</button>';
      }).join('') + '</div>';
  }).join('');
  const skills = o.usage.skills;
  const status = Object.entries(t.tasks_by_status);
  return (noUse ? '<div class="banner">' + ico('clock') + ' Nenhum agente do Orchestra rodou com os filtros atuais. Os números aparecem quando os subagentes <span class="mono">orchestra:*</span> forem chamados no Claude Code; o catálogo e o runtime já estão carregados.</div>' : '')
    + cards
    + '<div class="card"><div class="card-h"><b>Organização</b><span class="note">' + ico('crown', 'inl') + ' líder do departamento · cor = acurácia · intensidade = execuções · clique para o detalhe</span></div><div class="orggrid">' + deps + '</div></div>'
    + '<div class="grid3">'
    + '<div class="card"><div class="card-h"><b>Por departamento</b></div>' + o.departments.map((d) => '<div class="irow"><span>' + esc(d.name) + '</span><b>' + d.executions + ' exec. · ' + fUsd(d.cost) + (d.accuracy != null ? ' · <span class="acc ' + accCls(d.accuracy) + '">' + fPctBR(d.accuracy) + '</span>' : '') + '</b></div>').join('') + '</div>'
    + '<div class="card"><div class="card-h"><b>Skills e comandos</b></div><div class="irow"><span>Skills primárias</span><b>' + c.skills.primary + '</b></div><div class="irow"><span>Skills compartilhadas</span><b>' + c.skills.shared + '</b></div><div class="irow"><span>Comandos</span><b>' + c.skills.commands + '</b></div>'
    + '<div class="isec">Usadas no período</div>' + (skills.length ? skills.map((s) => '<div class="irow"><span class="mono">' + esc(s.skill) + '</span><b>' + s.n + '×</b></div>').join('') : '<div class="note">nenhuma skill orchestra:* chamada</div>') + '</div>'
    + '<div class="card"><div class="card-h"><b>Runtime</b></div>' + o.runtimes.map((r) => '<div class="irow"><span>' + esc(r.name) + (r.error ? ' ' + tag('bad', 'erro') : '') + '</span><b>' + (r.counts.tasks ?? '—') + ' tarefas · ' + (r.counts.events ?? '—') + ' eventos · ' + (r.counts.memories ?? '—') + ' memórias</b></div>').join('')
    + '<div class="isec">Tarefas por estado</div>' + (status.length ? status.map(([k, n]) => '<div class="irow"><span>' + esc(k) + '</span><b>' + n + '</b></div>').join('') : '<div class="note">nenhuma tarefa registrada pela CLI do Orchestra</div>')
    + (o.totals.incompatible_events ? '<div class="note" style="color:var(--warn)">' + o.totals.incompatible_events + ' evento(s) com versão de protocolo desconhecida foram ignorados.</div>' : '') + '</div>'
    + '</div>';
}

// ---------- agentes: catálogo × uso × aderência ----------
function orcAgentRows(o) {
  const u = o.usage.agents;
  return o.catalog.agents.map((a) => {
    const x = u[a.id] || null;
    return { ...a, dep: a.department_name || a.department, x, executions: x ? x.executions : 0, cost: x ? x.cost : null, accuracy: x ? x.accuracy : null,
      adherence: x ? x.model_adherence : null, over: x ? x.over_budget : 0, off: x ? x.off_tool_calls : 0, last: x ? x.last_at : null, model_used: x ? x.model_used : null, _click: 'orc-agent:' + a.id };
  });
}
function orcAgents(o) {
  const cols = [
    { k: 'name', label: 'Agente', l: 1, cls: 'name', type: 'text', fv: (r) => r.name + ' ' + r.id, f: (r) => (r.leader ? ico('crown', 'lead') + ' ' : '') + esc(r.name) + ' <span class="note mono">' + esc(r.id) + '</span>' },
    { k: 'dep', label: 'Departamento', l: 1 },
    { k: 'model', label: 'Modelo previsto', l: 1, f: (r) => esc(r.model) + (r.alternatives.length ? ' <span class="note">/ ' + esc(r.alternatives.join(', ')) + '</span>' : '') },
    { k: 'model_used', label: 'Modelo usado', l: 1, fv: (r) => r.model_used || '', f: (r) => (r.model_used ? (r.model_used === r.model || r.alternatives.includes(r.model_used) ? esc(r.model_used) : tag('warn', r.model_used)) : '<span class="note">—</span>') },
    { k: 'adherence', label: 'Aderência ao modelo', f: (r) => (r.adherence == null ? '<span class="note">—</span>' : '<span class="acc ' + accCls(r.adherence) + '">' + fPctBR(r.adherence) + '</span>') },
    { k: 'executions', label: 'Execuções' },
    { k: 'turns', label: 'Turnos (med./máx.)', v: (r) => (r.x ? r.x.turns_max || 0 : 0), f: (r) => (r.x ? (r.x.turns_median ?? '—') + ' / ' + (r.x.turns_max ?? '—') + ' <span class="note">de ' + (r.budget.max_turns || '?') + '</span>' : '<span class="note">orçamento ' + (r.budget.max_turns || '?') + '</span>') },
    { k: 'over', label: 'Acima do orçamento', f: (r) => (r.over ? tag('warn', String(r.over)) : '0') },
    { k: 'accuracy', label: 'Acurácia', f: (r) => (r.accuracy == null ? '<span class="note">—</span>' : '<span class="acc ' + accCls(r.accuracy) + '">' + fPctBR(r.accuracy) + '</span>') },
    { k: 'off', label: 'Fora da lista', f: (r) => (r.off ? tag('bad', String(r.off)) : '0') },
    { k: 'cost', label: 'Custo', f: (r) => (r.cost == null ? '<span class="note">—</span>' : fUsd(r.cost)) },
    { k: 'last', label: 'Último uso', type: 'date', f: (r) => (r.last ? fDate(r.last) : tag('', 'nunca usado')) },
  ];
  return '<p class="sub">Os 36 agentes do catálogo com o uso real no período. <b>Aderência ao modelo</b> = respostas no modelo previsto (ou alternativa prevista) ÷ total. <b>Acima do orçamento</b> = execuções com mais turnos que o <span class="mono">max_turns</span>. <b>Fora da lista</b> = chamadas de ferramentas que o catálogo não dá ao agente.</p>'
    + table('orc-agents', cols, orcAgentRows(o), 'executions');
}

function orcAgentDetail(o, id) {
  const d = orcWant('agent:' + id, 'orchestra:agent', id, FX());
  const back = '<div class="shead"><button class="btn" data-orc-back>' + ico('back') + 'Orchestra</button>';
  if (d === undefined) return back + '</div>' + LOADING;
  if (isErr(d)) return back + '</div>' + errBox(d);
  const a = d.catalog, x = d.usage;
  const list = (items) => (items && items.length ? '<ul class="orclist">' + items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '<div class="note">—</div>');
  const toolsAllowed = a.tools.map((t) => '<span class="orctool' + (x && x.tools[t] ? ' used' : '') + '">' + esc(t) + (x && x.tools[t] ? '<em>' + x.tools[t] + '</em>' : '') + '</span>').join('');
  const off = x ? Object.entries(x.off_tools) : [];
  const models = x ? Object.entries(x.models).sort((p, q) => q[1] - p[1]) : [];
  const totM = models.reduce((s, m) => s + m[1], 0) || 1;
  const head = back + '<div class="stitle"><h2 class="sh2">' + (a.leader ? ico('crown', 'lead') + ' ' : '') + esc(a.name) + ' <span class="note mono">' + esc(a.id) + '</span></h2>'
    + '<div class="smeta">' + esc(a.department_name || a.department) + (a.leader ? ' · líder' : '') + ' · modelo previsto <b>' + esc(a.model) + '</b>' + (a.alternatives.length ? ' (alt.: ' + esc(a.alternatives.join(', ')) + ')' : '') + ' · esforço ' + esc(a.effort || '—') + ' · aparece no Claude Code como <span class="mono">' + esc(d.alias || 'orchestra:' + a.id) + '</span>' + (d.alias ? '' : ' (ainda não visto)') + '</div></div></div>';
  const cards = '<div class="mcards compact">'
    + card('Execuções', 'pulse', String(x ? x.executions : 0), x ? x.sessions + ' sessão(ões)' : 'nunca usado no período')
    + card('Custo', 'coins', x ? fUsd2(x.cost || 0) : '—', x ? x.requests + ' respostas' : '')
    + card('Acurácia', 'target', pctO(x && x.accuracy), x ? x.ok + ' ok · ' + x.err + ' erro(s)' : '')
    + card('Aderência ao modelo', 'layers', pctO(x && x.model_adherence), 'previsto: ' + a.model)
    + card('Turnos', 'clock', x ? (x.turns_median ?? '—') + ' / ' + (x.turns_max ?? '—') : '—', 'mediana / máx. · orçamento ' + (a.budget.max_turns || '?'), x && x.over_budget ? 'warnc' : '')
    + card('Fora do orçamento', 'alert', String(x ? x.over_budget : 0), 'execuções acima de max_turns', x && x.over_budget ? 'warnc' : '')
    + card('Fora da lista', 'shield', String(x ? x.off_tool_calls : 0), 'chamadas não previstas', x && x.off_tool_calls ? 'warnc' : '')
    + '</div>';
  const spec = '<div class="grid2"><div class="card"><div class="card-h"><b>Mandato (catálogo)</b></div>'
    + '<div class="isec">Responsabilidade</div><p class="orcp">' + esc(a.responsibility || '—') + '</p>'
    + '<div class="isec">Resolve</div>' + list(a.problems) + '<div class="isec">Limites</div>' + list(a.limits) + '<div class="isec">Não chamar quando</div>' + list(a.not_call)
    + '<div class="isec">Critério de sucesso</div>' + list(a.success) + '<div class="isec">Escalonamento</div>' + list(a.escalation) + '</div>'
    + '<div class="card"><div class="card-h"><b>Ferramentas e modelo</b></div>'
    + '<div class="isec">Permitidas (verde = usada no período)</div><div class="orctools">' + toolsAllowed + '</div>'
    + '<div class="isec">Usadas fora da lista</div>' + (off.length ? '<div class="orctools">' + off.map(([t, n]) => '<span class="orctool bad">' + esc(t) + '<em>' + n + '</em></span>').join('') + '</div>' : '<div class="note">nenhuma</div>')
    + '<div class="isec">Modelos realmente usados</div>' + (models.length ? models.map(([m, n]) => '<div class="dgbar"><span>' + esc(m) + (m === a.model ? ' ' + tag('ok', 'previsto') : a.alternatives.includes(m) ? ' ' + tag('info', 'alternativa') : ' ' + tag('warn', 'fora do previsto')) + '</span><i><s style="width:' + (n / totM) * 100 + '%"></s></i><em>' + n + '</em></div>').join('') : '<div class="note">sem respostas no período</div>')
    + '<div class="isec">Orçamento</div><div class="irow"><span>Máx. de turnos</span><b>' + (a.budget.max_turns ?? '—') + '</b></div><div class="irow"><span>Máx. de handoffs</span><b>' + (a.budget.max_handoffs ?? '—') + '</b></div><div class="irow"><span>Máx. em paralelo</span><b>' + (a.budget.max_parallel ?? '—') + '</b></div>'
    + '<div class="isec">Skills</div><div class="irow"><span>Principal</span><b class="mono">' + esc(a.primary_skill || '—') + '</b></div><div class="note">Compartilhadas: ' + (a.shared_skills.map(esc).join(', ') || '—') + '</div>'
    + '<div class="isec">Entradas → saídas</div><div class="note">' + (a.inputs.map(esc).join(' · ') || '—') + ' → ' + (a.outputs.map(esc).join(' · ') || '—') + '</div></div></div>';
  let usage = '';
  if (d.detail && d.detail.summary) {
    const det = d.detail;
    usage = '<h3>Uso detalhado</h3>' + table('orc-atools', [
      { k: 'tool', label: 'Ferramenta', l: 1, cls: 'name', type: 'text', f: (r) => esc(r.tool) + (a.tools.includes(r.tool) ? '' : ' ' + tag('bad', 'fora da lista')) },
      { k: 'calls', label: 'Chamadas' }, { k: 'err', label: 'Erros' },
      { k: 'accuracy', label: 'Acurácia', f: (r) => (r.accuracy == null ? '—' : '<span class="acc ' + accCls(r.accuracy) + '">' + fPctBR(r.accuracy) + '</span>') },
      { k: 'targets', label: 'Alvos mais comuns', l: 1, cls: 'name', type: 'text', v: (r) => r.top_targets.map((q) => q.target).join(' '), f: (r) => r.top_targets.map((q) => '<span class="mono">' + esc(q.target) + '</span><span class="note">×' + q.n + '</span>').join(' ') || '—' },
    ], det.tools, 'calls', { fixed: false, size: 10 })
      + table('orc-asess', [
        { k: 'title', label: 'Sessão', l: 1, cls: 'name', type: 'text', f: (r) => esc(r.title || 'Sessão ' + r.id.slice(0, 8)) },
        { k: 'start_at', label: 'Início', type: 'date', f: (r) => fDate(r.start_at) }, { k: 'requests', label: 'Respostas' },
        { k: 'cost', label: 'Custo', f: (r) => (r.cost == null ? '—' : fUsd(r.cost)) }, { k: 'errors', label: 'Erros' },
      ], det.sessions.map((s) => ({ ...s, _click: 'v-session:' + s.id })), 'start_at', { fixed: false, size: 8 });
  } else usage = '<div class="state">' + ico('clock') + ' Este agente ainda não rodou no período. Quando for chamado como subagente, o uso aparece aqui.</div>';
  return head + cards + spec + usage;
}

// ---------- tarefas (runtime) ----------
function orcTasks(o) {
  if (!o.tasks.length) {
    return '<div class="state">' + ico('report') + ' Nenhuma tarefa registrada no runtime do Orchestra com os filtros atuais.</div>'
      + '<div class="note" style="text-align:center">As tarefas são criadas pela CLI da extensão (<span class="mono">orchestra</span>) e ficam em <span class="mono">.orchestra/orchestra.db</span> de cada projeto. O Ledger só lê.</div>'
      + orcEvents(o);
  }
  return table('orc-tasks', [
    { k: 'created_at', label: 'Criada', type: 'date', v: (r) => Date.parse(r.created_at), fv: (r) => Date.parse(r.created_at), f: (r) => fDate(Date.parse(r.created_at)) },
    { k: 'project', label: 'Projeto', l: 1 },
    { k: 'title', label: 'Tarefa', l: 1, cls: 'name', type: 'text' },
    { k: 'mode', label: 'Modo', l: 1 }, { k: 'risk', label: 'Risco', l: 1 },
    { k: 'status', label: 'Estado', l: 1, f: (r) => tag(/done|approved|completed/i.test(r.status) ? 'ok' : /fail|reject|block/i.test(r.status) ? 'bad' : 'info', r.status) },
    { k: 'owner', label: 'Responsável', l: 1 },
    { k: 'agents', label: 'Agentes', l: 1, type: 'text', v: (r) => r.selected_agents.join(', '), f: (r) => esc(r.selected_agents.join(', ') || '—') },
    { k: 'budget_profile', label: 'Perfil', l: 1 }, { k: 'revision', label: 'Revisões' },
  ], o.tasks, 'created_at') + orcEvents(o);
}
function orcEvents(o) {
  const ev = o.runtimes.flatMap((r) => r.events.map((e) => ({ ...e, project: r.name })));
  if (!ev.length) return '';
  return '<h3>Eventos do protocolo</h3>' + table('orc-events', [
    { k: 'occurred_at', label: 'Quando', type: 'date', v: (r) => Date.parse(r.occurred_at) || 0, fv: (r) => Date.parse(r.occurred_at) || 0, f: (r) => (r.occurred_at ? fDate(Date.parse(r.occurred_at)) : '—') },
    { k: 'project', label: 'Projeto', l: 1 }, { k: 'type', label: 'Tipo', l: 1, mono: 1 },
    { k: 'classification', label: 'Classificação', l: 1 },
    { k: 'compatible', label: 'Versão', l: 1, f: (r) => (r.compatible ? tag('ok', '1.x') : tag('bad', 'desconhecida')) },
  ], ev, 'occurred_at', { fixed: false, size: 10 });
}

// =============================== RELATÓRIO ===============================
function orcReportData(o) {
  const f = FX(), t = o.totals, rows = orcAgentRows(o);
  const used = rows.filter((r) => r.x), unused = rows.filter((r) => !r.x);
  const mismatch = used.filter((r) => r.adherence != null && r.adherence < 1);
  const over = used.filter((r) => r.over > 0), off = used.filter((r) => r.off > 0);
  const recs = [];
  if (!used.length) recs.push('Nenhum agente do Orchestra rodou no período. Use as skills /orchestra:* no Claude Code para gerar dados de uso.');
  if (unused.length && used.length) recs.push(unused.length + ' de ' + rows.length + ' agentes não foram usados no período — avaliar se o roteamento está deixando competências de fora ou se o catálogo pode ser enxugado.');
  for (const r of mismatch) recs.push(r.name + ' respondeu fora do modelo previsto (' + r.model + ') em ' + fPctBR(1 - r.adherence) + ' das respostas.');
  for (const r of over) recs.push(r.name + ' passou do orçamento de ' + (r.budget.max_turns || '?') + ' turnos em ' + r.over + ' execução(ões) — revisar escopo das tarefas ou o max_turns.');
  for (const r of off) recs.push(r.name + ' usou ferramentas fora da lista do catálogo: ' + Object.keys(r.x.off_tools).join(', ') + '.');
  for (const r of used.filter((q) => q.accuracy != null && q.accuracy < 0.9)) recs.push(r.name + ' tem acurácia de ferramentas baixa (' + fPctBR(r.accuracy) + ') — ver erros no detalhe do agente.');
  if (t.incompatible_events) recs.push(t.incompatible_events + ' evento(s) do runtime com versão de protocolo desconhecida foram ignorados.');
  const period = f.from || f.to ? (f.from ? fDate(f.from) : 'início') + ' → ' + (f.to ? fDate(f.to) : 'agora') : 'todo o histórico';
  return { f, t, rows, used, unused, mismatch, over, off, recs, period, excluded: projectNames(), generated: new Date() };
}

function orcReport(o) {
  const R = orcReportData(o);
  return '<div class="toolbar"><span class="note">Relatório da extensão com os filtros atuais' + (R.excluded.length ? ' — sem: ' + esc(R.excluded.join(', ')) : '') + '.</span><span style="flex:1"></span>'
    + '<button class="btn" data-orc-export="md">' + ico('download') + 'Markdown</button><button class="btn" data-orc-export="html">' + ico('download') + 'HTML</button><button class="btn primary" data-orc-export="pdf">' + ico('report') + 'PDF</button></div>'
    + (S.O.saved ? '<div class="banner ok">' + esc(S.O.saved) + '</div>' : '')
    + '<div class="card orcreport">' + reportHtmlBody(o, R) + '</div>';
}

const pctTxt = (x) => (x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + '%');
const usd = (x) => (x == null ? '—' : '$' + x.toFixed(x >= 10 ? 2 : 3));
function reportHtmlBody(o, R) {
  const c = o.catalog, t = R.t;
  const tr = (cells) => '<tr>' + cells.map((x) => '<td>' + x + '</td>').join('') + '</tr>';
  const th = (cells) => '<tr>' + cells.map((x) => '<th>' + x + '</th>').join('') + '</tr>';
  return '<h1>Relatório — ' + esc(c.plugin.displayName || 'Orchestra Core') + ' v' + esc(c.plugin.version || '?') + '</h1>'
    + '<p class="rmeta">Período: ' + esc(R.period) + (FX().project ? ' · projeto: ' + esc(FX().project) : '') + (R.excluded.length ? ' · projetos excluídos: ' + esc(R.excluded.join(', ')) : '') + ' · gerado em ' + esc(R.generated.toLocaleString('pt-BR')) + '</p>'
    + '<h2>Resumo</h2><ul>'
    + '<li><b>' + t.used + ' de ' + t.agents + '</b> agentes usados (' + pctTxt(t.used / t.agents) + ' do catálogo), em <b>' + t.executions + '</b> execuções e ' + t.sessions + ' sessões.</li>'
    + '<li>Custo equivalente de API dos agentes do Orchestra: <b>' + usd(t.cost) + '</b> (estimativa por tabela de preços — não é fatura).</li>'
    + '<li>Acurácia de ferramentas: <b>' + pctTxt(t.accuracy) + '</b> em ' + t.calls + ' chamadas.</li>'
    + '<li>Conformidade: <b>' + t.over_budget + '</b> execução(ões) acima do orçamento de turnos · <b>' + t.off_tool_calls + '</b> chamada(s) de ferramenta fora da lista · <b>' + R.mismatch.length + '</b> agente(s) fora do modelo previsto.</li>'
    + '<li>Runtime: ' + t.runtimes + ' projeto(s) com <span class="mono">.orchestra</span>, ' + t.tasks + ' tarefa(s), ' + t.events + ' evento(s).</li></ul>'
    + '<h2>Por departamento</h2><table>' + th(['Departamento', 'Agentes em uso', 'Execuções', 'Custo', 'Acurácia'])
    + o.departments.map((d) => tr([esc(d.name), d.used + '/' + d.agents.length, d.executions, usd(d.cost), pctTxt(d.accuracy)])).join('') + '</table>'
    + '<h2>Agentes usados</h2>' + (R.used.length ? '<table>' + th(['Agente', 'Departamento', 'Execuções', 'Custo', 'Acurácia', 'Modelo (previsto → usado)', 'Aderência', 'Acima do orçamento', 'Fora da lista'])
      + R.used.sort((p, q) => q.executions - p.executions).map((r) => tr([esc(r.name), esc(r.dep), r.executions, usd(r.cost), pctTxt(r.accuracy), esc(r.model) + ' → ' + esc(r.model_used || '—'), pctTxt(r.adherence), r.over, r.off])).join('') + '</table>' : '<p>Nenhum no período.</p>')
    + '<h2>Agentes não usados</h2><p>' + (R.unused.length ? R.unused.map((r) => esc(r.name)).join(', ') : 'Todos foram usados.') + '</p>'
    + '<h2>Recomendações</h2>' + (R.recs.length ? '<ul>' + R.recs.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p>Nada a apontar.</p>')
    + '<h2>Fontes e limites</h2><ul><li>Catálogo: <span class="mono">' + esc(c.root) + '</span> (protocolo ' + esc(c.schema_version || '?') + ').</li>'
    + '<li>Uso: transcritos locais do Claude Code; agentes reconhecidos pelos nomes <span class="mono">&lt;id&gt;</span> e <span class="mono">orchestra:&lt;id&gt;</span>.</li>'
    + '<li>Runtime lido somente para leitura; o Ledger não altera o Orchestra.</li><li>Turnos = respostas do modelo por execução do subagente.</li></ul>';
}

function reportMarkdown(o, R) {
  const c = o.catalog, t = R.t;
  const cell = (x) => String(x == null ? '—' : x).replace(/\|/g, '\\|');
  const row = (a) => '| ' + a.map(cell).join(' | ') + ' |';
  const md = [];
  md.push('# Relatório — ' + (c.plugin.displayName || 'Orchestra Core') + ' v' + (c.plugin.version || '?'), '');
  md.push('Período: ' + R.period + (R.excluded.length ? ' · projetos excluídos: ' + R.excluded.join(', ') : '') + ' · gerado em ' + R.generated.toLocaleString('pt-BR'), '');
  md.push('## Resumo', '',
    '- **' + t.used + ' de ' + t.agents + '** agentes usados (' + pctTxt(t.used / t.agents) + '), ' + t.executions + ' execuções, ' + t.sessions + ' sessões.',
    '- Custo equivalente de API: **' + usd(t.cost) + '** (estimativa — não é fatura).',
    '- Acurácia de ferramentas: **' + pctTxt(t.accuracy) + '** em ' + t.calls + ' chamadas.',
    '- Conformidade: ' + t.over_budget + ' execução(ões) acima do orçamento · ' + t.off_tool_calls + ' chamada(s) fora da lista · ' + R.mismatch.length + ' agente(s) fora do modelo previsto.',
    '- Runtime: ' + t.runtimes + ' projeto(s), ' + t.tasks + ' tarefa(s), ' + t.events + ' evento(s).', '');
  md.push('## Por departamento', '', row(['Departamento', 'Em uso', 'Execuções', 'Custo', 'Acurácia']), row(['---', '---:', '---:', '---:', '---:']));
  for (const d of o.departments) md.push(row([d.name, d.used + '/' + d.agents.length, d.executions, usd(d.cost), pctTxt(d.accuracy)]));
  md.push('', '## Agentes usados', '');
  if (R.used.length) {
    md.push(row(['Agente', 'Departamento', 'Execuções', 'Custo', 'Acurácia', 'Modelo (previsto → usado)', 'Aderência', 'Acima do orçamento', 'Fora da lista']), row(['---', '---', '---:', '---:', '---:', '---', '---:', '---:', '---:']));
    for (const r of R.used) md.push(row([r.name, r.dep, r.executions, usd(r.cost), pctTxt(r.accuracy), r.model + ' → ' + (r.model_used || '—'), pctTxt(r.adherence), r.over, r.off]));
  } else md.push('Nenhum no período.');
  md.push('', '## Agentes não usados', '', R.unused.length ? R.unused.map((r) => r.name).join(', ') : 'Todos foram usados.', '');
  md.push('## Recomendações', '', ...(R.recs.length ? R.recs.map((x) => '- ' + x) : ['Nada a apontar.']), '');
  md.push('## Fontes e limites', '', '- Catálogo: `' + c.root + '` (protocolo ' + (c.schema_version || '?') + ').', '- Uso: transcritos locais do Claude Code.', '- Runtime lido somente para leitura.', '');
  return md.join('\n');
}

function reportStandaloneHtml(o, R) {
  // versão para arquivo/PDF: tema claro, imprimível, sem scripts nem recursos externos
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Orchestra</title><style>'
    + 'body{font-family:Segoe UI,Inter,system-ui,sans-serif;color:#111;margin:32px;line-height:1.5;font-size:13px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}'
    + '.rmeta{color:#555;margin:0 0 12px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid #e5e5e5;padding:6px 8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}'
    + '.mono{font-family:Consolas,monospace;font-size:11.5px}ul{padding-left:18px}li{margin:3px 0}</style></head><body>' + reportHtmlBody(o, R) + '</body></html>';
}

// =============================== EVENTOS ===============================
document.getElementById('view').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-orc-sub],[data-orc-agent],[data-orc-back],[data-orc-path],[data-orc-savepath],[data-orc-export],tr[data-click^="orc-"]');
  if (!el) return;
  const d = el.dataset;
  if (el.matches('tr[data-click]')) { S.O.agent = d.click.slice(d.click.indexOf(':') + 1); render(); return; }
  if (d.orcSub) { S.O.sub = d.orcSub; S.O.saved = ''; render(); return; }
  if (d.orcAgent) { S.O.agent = d.orcAgent; render(); return; }
  if ('orcBack' in d) { S.O.agent = null; render(); return; }
  if ('orcPath' in d) { S.O.editPath = !S.O.editPath; S.O.pathErr = ''; render(); return; }
  if ('orcSavepath' in d) {
    const v = (document.querySelector('[data-orc-pathin]') || {}).value || '';
    const r = await window.ledger.api('orchestra:setPath', v);
    if (isErr(r)) { S.O.pathErr = r.__error; S.O.path = v; } else { S.O.editPath = false; S.O.pathErr = ''; S.O.cache = {}; }
    render(); return;
  }
  if (d.orcExport) {
    const o = Object.entries(S.O.cache).find(([k]) => k.startsWith('ov|' + JSON.stringify(FX())));
    if (!o || isErr(o[1])) return;
    const R = orcReportData(o[1]);
    const content = d.orcExport === 'md' ? reportMarkdown(o[1], R) : reportStandaloneHtml(o[1], R);
    const r = await window.ledger.api('orchestra:saveReport', { format: d.orcExport, content, name: 'relatorio-orchestra-' + new Date().toISOString().slice(0, 10) });
    S.O.saved = isErr(r) ? 'Erro: ' + r.__error : r.ok ? 'Relatório salvo em ' + r.path : '';
    render();
  }
});
window.ledger.onDbUpdated(() => { S.O.cache = {}; S.O.pending = {}; });
