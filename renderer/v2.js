'use strict';
/* global S, $, esc, ico, ICON, tag, tip, table, plist, pager, render, fDate, fUsd, fUsd2, fTok, fTokBR, fPctBR, areaChart, FX, goEvidence, goAnalyze, outTag, card, LOADING, errBox, isErr, unavailable */
// Agentes (lista + detalhe), Auditoria com submódulos, limites na Visão Geral e busca no GitHub (Explorar).

Object.assign(ICON, {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3V6Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
});

S.A = S.A || { name: null, sub: 'resumo' };
S.AU = S.AU || { sub: 'overview', chart: 'requests' };
S.W = { cache: {}, pending: {} };
S.GH = { mode: 'marketplace', q: '', sort: 'stars', page: 1, backend: null };

// cache próprio (chaveado pelo filtro global)
function want(key, ch, ...args) {
  const k = key + '|' + JSON.stringify(FX());
  if (k in S.W.cache) return S.W.cache[k];
  if (!S.W.pending[k]) {
    S.W.pending[k] = window.ledger.api(ch, ...args).then((r) => { S.W.cache[k] = r; delete S.W.pending[k]; render(); })
      .catch((e) => { S.W.cache[k] = { __error: e.message }; delete S.W.pending[k]; render(); });
  }
  return undefined;
}
const pctv = (x) => (x == null ? unavailable('sem dado suficiente') : fPctBR(x));
const accTag = (x) => (x == null ? '<span class="note">—</span>' : '<span class="acc ' + (x >= 0.97 ? 'hi' : x >= 0.9 ? 'mid' : 'lo') + '">' + fPctBR(x) + '</span>');
const fDurS = (ms) => (ms == null ? '—' : ms < 1000 ? ms + ' ms' : ms < 60000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : ms < 3600000 ? Math.round(ms / 60000) + ' min' : (ms / 3600000).toFixed(1).replace('.', ',') + ' h');
const CAT = { nativa: ['info', 'nativa'], mcp: ['warn', 'MCP'], skill: ['ok', 'skill'], subagente: ['', 'subagente'], outra: ['', 'outra'] };
const catTag = (c) => tag((CAT[c] || CAT.outra)[0], (CAT[c] || CAT.outra)[1]);
const KIND = (k) => tag(k === 'main' ? 'info' : '', k === 'main' ? 'principal' : 'subagente');

// colunas do ranking de agentes (usado em Agentes e em Auditoria › Por agente)
function agentCols(maxCost) {
  return [
    { k: 'name', label: 'Agente', l: 1, cls: 'name', type: 'text', f: (r) => esc(r.name) },
    { k: 'kind', label: 'Tipo', l: 1, f: (r) => KIND(r.kind) },
    { k: 'executions', label: 'Execuções', f: (r) => (r.kind === 'main' ? '—' : r.executions) },
    { k: 'sessions', label: 'Sessões' },
    { k: 'requests', label: 'Respostas' },
    { k: 'cost', label: 'Custo equiv.', f: (r) => (r.cost == null ? '—' : fUsd(r.cost)) + '<span class="meter"><i style="width:' + (maxCost ? ((r.cost || 0) / maxCost) * 100 : 0) + '%"></i></span>' },
    { k: 'cost_per_exec', label: 'Custo/execução', f: (r) => (r.kind === 'main' || r.cost_per_exec == null ? '—' : fUsd(r.cost_per_exec)) },
    { k: 'calls', label: 'Ferramentas' },
    { k: 'accuracy', label: 'Acurácia', f: (r) => accTag(r.accuracy) },
    { k: 'denied', label: 'Negadas' },
    { k: 'task_success', label: 'Sucesso tarefas', f: (r) => (r.task_success == null ? '<span class="note">não avaliado</span>' : fPctBR(r.task_success) + ' <span class="note">n=' + r.evaluated + '</span>') },
    { k: 'duration_median', label: 'Duração (mediana)', f: (r) => fDurS(r.duration_median) },
  ];
}

// =============================== AGENTES ===============================
function viewAgentesV2() {
  if (S.A.name) return viewAgentDetail(S.A.name);
  const list = want('agents', 'agents:list', FX());
  if (list === undefined) return LOADING;
  if (isErr(list)) return errBox(list);
  const max = Math.max(0, ...list.map((a) => a.cost || 0));
  const rows = list.map((a) => ({ ...a, _click: 'v2-agent:' + a.name }));
  const tot = list.reduce((s, a) => ({ cost: s.cost + (a.cost || 0), calls: s.calls + a.calls, ok: s.ok + a.ok, err: s.err + a.err }), { cost: 0, calls: 0, ok: 0, err: 0 });
  return '<p class="sub">Clique num agente para ver o que ele chamou, a acurácia das ferramentas, erros, sessões, execuções e diagnósticos. <b>Acurácia</b> = ferramentas que funcionaram ÷ (funcionaram + falharam); negadas e canceladas ficam de fora.</p>'
    + '<div class="mcards">'
    + card('Agentes ativos', 'bot', String(list.length), list.filter((a) => a.kind === 'subagent').length + ' subagente(s)')
    + card('Custo equivalente', 'coins', fUsd2(tot.cost), 'todos os agentes no filtro')
    + card('Chamadas de ferramenta', 'wrench', tot.calls.toLocaleString('pt-BR'), tot.err + ' falha(s)')
    + card('Acurácia geral', 'target', pctv(tot.ok + tot.err ? tot.ok / (tot.ok + tot.err) : null), 'ok ÷ (ok + erro)')
    + '</div>'
    + table('v2-agents', agentCols(max), rows, 'cost');
}

function viewAgentDetail(name) {
  const d = want('agent:' + name, 'agents:detail', name, FX());
  if (d === undefined) return LOADING;
  if (isErr(d)) return errBox(d);
  const s = d.summary;
  const head = '<div class="shead"><button class="btn" data-v2-back>' + ico('back') + 'Agentes</button><div class="stitle"><h2 class="sh2">' + esc(name) + ' ' + (s ? KIND(s.kind) : '') + '</h2>'
    + '<div class="smeta">' + (s ? 'Modelos: ' + esc((s.models || '').split(',').join(', ')) + ' · primeiro uso ' + fDate(s.first_at) + ' · último ' + fDate(s.last_at) : 'Sem atividade no filtro atual.') + '</div></div></div>';
  if (!s) return head + '<div class="state">Nenhuma resposta deste agente com os filtros atuais.</div>';
  const subs = [['resumo', 'Resumo'], ['tools', 'O que chamou', d.tools.length], ['errors', 'Erros', d.errors.length], ['sessions', 'Sessões', d.sessions.length], ['execs', 'Execuções', s.kind === 'main' ? null : d.executions.length], ['diag', 'Diagnósticos', d.diagnostics.length]].filter((x) => !(x[0] === 'execs' && s.kind === 'main'));
  const tabs = '<div class="subtabs" role="tablist">' + subs.map(([k, l, n]) => '<button role="tab" data-v2-asub="' + k + '" class="' + (S.A.sub === k ? 'on' : '') + '">' + l + (n != null ? '<span class="cnt">' + n + '</span>' : '') + '</button>').join('') + '</div>';
  const cards = '<div class="mcards compact">'
    + card('Custo equivalente', 'coins', s.cost == null ? unavailable('sem preço') : fUsd2(s.cost), s.kind === 'main' ? s.requests + ' respostas' : fUsd(s.cost_per_exec || 0) + ' por execução')
    + card(s.kind === 'main' ? 'Sessões' : 'Execuções', 'bot', String(s.kind === 'main' ? s.sessions : s.executions), s.sessions + ' sessão(ões) · ' + s.requests + ' respostas')
    + card('Chamadas', 'wrench', s.calls.toLocaleString('pt-BR'), s.distinct_tools + ' ferramenta(s) distinta(s)' + (s.calls_per_exec != null && s.kind !== 'main' ? ' · ' + s.calls_per_exec.toFixed(1).replace('.', ',') + '/exec' : ''))
    + card('Acurácia', 'target', pctv(s.accuracy), s.ok + ' ok · ' + s.err + ' erro(s)')
    + card('Negadas / canceladas', 'shield', s.denied + ' / ' + s.cancelled, 'não contam como falha')
    + card('Sucesso das tarefas', 'flag', pctv(s.task_success), s.evaluated ? s.approved + ' de ' + s.evaluated + ' avaliada(s)' : 'sessões sem teste')
    + card('Duração', 'clock', fDurS(s.duration_median), 'mediana · P90 ' + fDurS(s.duration_p90))
    + '</div>';
  let body = '';
  if (S.A.sub === 'resumo') {
    const pts = d.daily.map((x) => ({ k: x.d, v: x.cost || 0 }));
    const det = (k) => { const x = d.daily.find((y) => y.d === k) || {}; return [['Custo', fUsd2(x.cost || 0), 'var(--accent)'], ['Respostas', String(x.requests || 0)], ['Ferramentas', String(x.calls || 0)], ['Falhas', String(x.err || 0)], ['Acurácia', x.ok + x.err ? fPctBR(x.ok / (x.ok + x.err)) : '—']]; };
    const cats = Object.entries(d.categories).sort((a, b) => b[1].calls - a[1].calls);
    const totC = cats.reduce((a, [, c]) => a + c.calls, 0) || 1;
    body = '<div class="grid-main"><div class="card"><div class="card-h"><b>Custo por dia</b></div>' + (pts.length ? areaChart(pts, (v) => (v === 0 ? '$0' : '$' + (v >= 10 ? Math.round(v) : v.toFixed(2))), det) : '<div class="state">Sem dados.</div>') + '</div>'
      + '<div class="card"><div class="card-h"><b>Tipos de ferramenta</b></div>' + cats.map(([c, x]) => '<div class="hbar nohover"' + tip(c, [['Chamadas', String(x.calls)], ['Acurácia', x.ok + x.err ? fPctBR(x.ok / (x.ok + x.err)) : '—'], ['Falhas', String(x.err)]]) + '><span>' + catTag(c) + '</span><div class="track"><i style="width:' + (x.calls / totC) * 100 + '%"></i></div><em>' + x.calls + '</em></div>').join('')
      + '<div class="isec">Modelos</div>' + d.models.map((m) => '<div class="irow"><span>' + esc(m.model) + '</span><b>' + m.n + ' resp. · ' + (m.cost == null ? '—' : fUsd(m.cost)) + '</b></div>').join('')
      + '<div class="isec">Mais chamadas</div>' + d.tools.slice(0, 5).map((t) => '<div class="irow"><span>' + esc(t.tool) + '</span><b>' + t.calls + ' · ' + (t.accuracy == null ? '—' : fPctBR(t.accuracy)) + '</b></div>').join('') + '</div></div>';
  } else if (S.A.sub === 'tools') {
    const max = Math.max(0, ...d.tools.map((t) => t.calls));
    body = '<p class="sub">Tudo que <b>' + esc(name) + '</b> chamou no filtro atual. “Alvos” = arquivos, executáveis ou servidores mais usados (sem parâmetros completos).</p>'
      + table('v2-atools', [
        { k: 'tool', label: 'Ferramenta', l: 1, cls: 'name', type: 'text' },
        { k: 'category', label: 'Tipo', l: 1, f: (r) => catTag(r.category) },
        { k: 'calls', label: 'Chamadas', f: (r) => r.calls + '<span class="meter"><i style="width:' + (max ? (r.calls / max) * 100 : 0) + '%"></i></span>' },
        { k: 'ok', label: 'OK' }, { k: 'err', label: 'Erros' }, { k: 'denied', label: 'Negadas' },
        { k: 'accuracy', label: 'Acurácia', f: (r) => accTag(r.accuracy) },
        { k: 'duration_median', label: 'Duração (med.)', f: (r) => fDurS(r.duration_median) },
        { k: 'targets', label: 'Alvos mais comuns', l: 1, cls: 'name', type: 'text', v: (r) => r.top_targets.map((x) => x.target).join(' '), f: (r) => r.top_targets.length ? r.top_targets.map((x) => '<span class="mono">' + esc(x.target) + '</span><span class="note">×' + x.n + '</span>').join(' ') : '<span class="note">—</span>' },
        { k: 'last', label: 'Último uso', type: 'date', f: (r) => fDate(r.last) },
      ], d.tools.map((t) => ({ ...t, _click: 'v2-tool:' + t.tool })), 'calls');
  } else if (S.A.sub === 'errors') {
    body = '<p class="sub">Falhas agrupadas pela assinatura normalizada do erro. Clique para abrir um exemplo na timeline.</p>'
      + table('v2-aerr', [
        { k: 'tool_name', label: 'Ferramenta', l: 1, type: 'text' },
        { k: 'error_signature', label: 'Erro (normalizado)', l: 1, cls: 'name', type: 'text', f: (r) => '<span class="mono">' + esc(r.error_signature || '—') + '</span>' },
        { k: 'n', label: 'Ocorrências' }, { k: 'last', label: 'Último', type: 'date', f: (r) => fDate(r.last) },
      ], d.errors.map((x) => ({ ...x, _click: x.sample_event ? 'v2-ev:' + x.session_id + '|' + x.sample_event : '' })), 'n', { empty: 'Nenhuma falha no filtro atual.' });
  } else if (S.A.sub === 'sessions') {
    body = table('v2-asess', [
      { k: 'title', label: 'Sessão', l: 1, cls: 'name', type: 'text', f: (r) => esc(r.title || 'Sessão ' + r.id.slice(0, 8)) },
      { k: 'project', label: 'Projeto', l: 1 },
      { k: 'start_at', label: 'Início', type: 'date', f: (r) => fDate(r.start_at) },
      { k: 'requests', label: 'Respostas' }, { k: 'cost', label: 'Custo do agente', f: (r) => (r.cost == null ? '—' : fUsd(r.cost)) },
      { k: 'tools', label: 'Ferramentas' }, { k: 'errors', label: 'Erros' },
      { k: 'outcome', label: 'Resultado', l: 1, f: (r) => outTag(r.outcome) },
    ], d.sessions.map((x) => ({ ...x, _click: 'v-session:' + x.id })), 'start_at');
  } else if (S.A.sub === 'execs') {
    body = '<p class="sub">Cada vez que o subagente foi chamado. “Chamado em” abre, na timeline da sessão, a chamada que o criou.</p>' + table('v2-aexec', [
      { k: 'title', label: 'Sessão', l: 1, cls: 'name', type: 'text', f: (r) => esc(r.title || 'Sessão ' + r.session_id.slice(0, 8)) },
      { k: 'start_at', label: 'Início', type: 'date', f: (r) => fDate(r.start_at) },
      { k: 'dur', label: 'Duração', v: (r) => (r.end_at || 0) - (r.start_at || 0), f: (r) => fDurS(r.start_at && r.end_at ? r.end_at - r.start_at : null) },
      { k: 'requests', label: 'Respostas' }, { k: 'cost', label: 'Custo', f: (r) => (r.cost == null ? '—' : fUsd(r.cost)) },
      { k: 'tools', label: 'Ferramentas' }, { k: 'errors', label: 'Erros' },
      { k: 'parent', label: 'Chamado em', nf: 1, f: (r) => (r.parent_event ? '<button class="btn sm" data-v2-goev="' + esc(r.session_id) + '|' + r.parent_event + '">' + ico('target') + 'ver chamada</button>' : '<span class="note">—</span>') },
    ], d.executions, 'start_at');
  } else if (S.A.sub === 'diag') {
    body = d.diagnostics.length ? table('v2-adiag', [
      { k: 'sev', label: 'Gravidade', v: (r) => ({ 'crítico': 3, 'atenção': 2, info: 1 })[r.severity], fv: (r) => r.severity, f: (r) => tag({ 'crítico': 'bad', 'atenção': 'warn', info: 'info' }[r.severity], r.severity) },
      { k: 'rule_id', label: 'Regra', l: 1, mono: 1 }, { k: 'title', label: 'Achado', l: 1, cls: 'name', type: 'text' },
    ], d.diagnostics.map((x) => ({ ...x, _click: 'v-diag:' + x.session_id })), 'sev') : '<div class="state">' + ico('check') + ' Nenhum diagnóstico com evidência deste agente.</div>';
  }
  return head + cards + tabs + body;
}

// =============================== AUDITORIA ===============================
const AU_SUBS = [['overview', 'Visão geral'], ['agents', 'Por agente'], ['responses', 'Respostas'], ['tools', 'Ferramentas'], ['errors', 'Erros']];
function viewAuditV2() {
  const tabs = '<div class="strow"><div class="subtabs" role="tablist">' + AU_SUBS.map(([k, l]) => '<button role="tab" data-v2-ausub="' + k + '" class="' + (S.AU.sub === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>'
    + (['responses', 'tools', 'errors', 'agents'].includes(S.AU.sub) ? '<button class="btn" data-v2-csv>' + ico('download') + 'Exportar CSV</button>' : '') + '</div>';
  let b = '';
  if (S.AU.sub === 'overview') b = auditOverview();
  else if (S.AU.sub === 'agents') {
    const list = want('agents', 'agents:list', FX());
    b = list === undefined ? LOADING : isErr(list) ? errBox(list) : '<p class="sub">Todos os agentes com os indicadores de auditoria. Clique para abrir o detalhe completo.</p>' + table('au-agents', agentCols(Math.max(0, ...list.map((a) => a.cost || 0))), list.map((a) => ({ ...a, _click: 'v2-agent:' + a.name })), 'cost');
  } else if (S.AU.sub === 'responses') {
    const r = want('au-resp', 'audit:responses', FX());
    b = r === undefined ? LOADING : isErr(r) ? errBox(r) : '<p class="sub">Cada resposta do modelo. Clique para abrir o evento na timeline. Custo = entrada × preço + saída × preço + cache leitura × 0,1 + cache escrita × 1,25 (5 min) ou × 2 (1 h).</p>'
      + table('au-resp', [
        { k: 'at', label: 'Quando', l: 1, type: 'date', f: (x) => fDate(x.at) },
        { k: 'title', label: 'Sessão', l: 1, cls: 'name', type: 'text', f: (x) => esc(x.title || x.session_id.slice(0, 8)) },
        { k: 'agent', label: 'Agente', l: 1 }, { k: 'model', label: 'Modelo', l: 1 },
        { k: 'tokens_in', label: 'Entrada' }, { k: 'tokens_out', label: 'Saída' },
        { k: 'cache_read', label: 'Cache leit.', f: (x) => fTok(x.cache_read) }, { k: 'cache_write', label: 'Cache escr.', f: (x) => fTok(x.cache_write) },
        { k: 'cost', label: 'Custo', f: (x) => (x.cost == null ? unavailable('sem preço') : fUsd(x.cost)) },
        { k: 'tools', label: 'Ferramentas chamadas', l: 1, cls: 'name', type: 'text', fv: (x) => x.tools || '', f: (x) => (x.tools ? esc(x.tools) : '<span class="note">—</span>') + (x.tool_errors ? ' ' + tag('bad', x.tool_errors + ' erro') : '') },
      ], r.map((x) => ({ ...x, _click: x.event_id ? 'v2-ev:' + x.session_id + '|' + x.event_id : '' })), 'at');
  } else if (S.AU.sub === 'tools') {
    const r = want('au-tools', 'audit:tools', FX());
    b = r === undefined ? LOADING : isErr(r) ? errBox(r) : '<p class="sub">Toda chamada de ferramenta, com estado, duração e erro normalizado. Use o nome da coluna para filtrar (ex.: Estado = erro). Clique para abrir na timeline.</p>'
      + table('au-tools', [
        { k: 'at', label: 'Quando', l: 1, type: 'date', f: (x) => fDate(x.at) },
        { k: 'tool', label: 'Ferramenta', l: 1, type: 'text' }, { k: 'category', label: 'Tipo', l: 1, f: (x) => catTag(x.category) },
        { k: 'agent', label: 'Agente', l: 1 }, { k: 'model', label: 'Modelo', l: 1 },
        { k: 'target', label: 'Alvo', l: 1, type: 'text', f: (x) => (x.target ? '<span class="mono">' + esc(x.target) + '</span>' : '<span class="note">—</span>') },
        { k: 'status', label: 'Estado', l: 1, f: (x) => tag({ ok: 'ok', erro: 'bad', negado: 'warn', cancelado: 'warn' }[x.status] || '', x.status) },
        { k: 'duration', label: 'Duração', f: (x) => fDurS(x.duration) },
        { k: 'error_signature', label: 'Erro', l: 1, cls: 'name', type: 'text', f: (x) => (x.error_signature ? '<span class="mono">' + esc(x.error_signature) + '</span>' : '') },
        { k: 'title', label: 'Sessão', l: 1, cls: 'name', type: 'text', f: (x) => esc(x.title || x.session_id.slice(0, 8)) },
      ], r.map((x) => ({ ...x, _click: x.event_id ? 'v2-ev:' + x.session_id + '|' + x.event_id : '' })), 'at');
  } else if (S.AU.sub === 'errors') {
    const r = want('au-err', 'audit:errors', FX());
    b = r === undefined ? LOADING : isErr(r) ? errBox(r) : '<p class="sub">Falhas agrupadas por ferramenta + assinatura do erro. “Repetidas com mesmo parâmetro” indica tentativas idênticas que não tinham como dar outro resultado.</p>'
      + table('au-err', [
        { k: 'tool', label: 'Ferramenta', l: 1, type: 'text' }, { k: 'category', label: 'Tipo', l: 1, f: (x) => catTag(x.category) },
        { k: 'signature', label: 'Erro (normalizado)', l: 1, cls: 'name', type: 'text', f: (x) => '<span class="mono">' + esc(x.signature || '—') + '</span>' },
        { k: 'n', label: 'Ocorrências' }, { k: 'sessions', label: 'Sessões' }, { k: 'repeated_same_input', label: 'Repetidas c/ mesmo parâmetro' },
        { k: 'agents', label: 'Agentes', l: 1, type: 'text' },
        { k: 'last_at', label: 'Último', type: 'date', f: (x) => fDate(x.last_at) },
      ], r.map((x) => ({ ...x, _click: x.sample_event ? 'v2-ev:' + x.sample_session + '|' + x.sample_event : '' })), 'n', { empty: 'Nenhuma falha no filtro atual.' });
  }
  return tabs + b;
}

function auditOverview() {
  const o = want('au-ov', 'audit:overview', FX());
  if (o === undefined) return LOADING;
  if (isErr(o)) return errBox(o);
  const t = o.totals;
  const metric = S.AU.chart;
  const pts = o.daily.map((x) => ({ k: x.d, v: metric === 'requests' ? x.requests : metric === 'calls' ? x.calls : metric === 'accuracy' ? (x.accuracy == null ? 0 : x.accuracy * 100) : x.err }));
  const fmt = { requests: (v) => String(Math.round(v)), calls: (v) => String(Math.round(v)), accuracy: (v) => v.toFixed(0) + '%', errors: (v) => String(Math.round(v)) }[metric];
  const det = (k) => { const x = o.daily.find((y) => y.d === k) || {}; return [['Respostas', String(x.requests || 0)], ['Custo', fUsd2(x.cost || 0)], ['Ferramentas', String(x.calls || 0)], ['Falhas', String(x.err || 0), 'var(--bad)'], ['Acurácia', x.accuracy == null ? '—' : fPctBR(x.accuracy), 'var(--accent)']]; };
  const seg = [['requests', 'Respostas'], ['calls', 'Ferramentas'], ['errors', 'Falhas'], ['accuracy', 'Acurácia']].map(([k, l]) => '<button data-v2-auchart="' + k + '" class="' + (metric === k ? 'on' : '') + '">' + l + '</button>').join('');
  const cats = Object.entries(o.categories).sort((a, b) => b[1].calls - a[1].calls);
  return '<div class="mcards six">'
    + card('Respostas', 'layers', (t.requests || 0).toLocaleString('pt-BR'), (t.sessions || 0) + ' sessões · ' + (t.prompts || 0) + ' prompts')
    + card('Custo equivalente', 'coins', t.cost == null ? unavailable('sem preço') : fUsd2(t.cost), fTokBR((t.tin || 0) + (t.tout || 0) + (t.cr || 0) + (t.cw || 0)) + ' tokens')
    + card('Chamadas de ferramenta', 'wrench', (t.calls || 0).toLocaleString('pt-BR'), (t.err || 0) + ' falhas · ' + (t.tests || 0) + ' testes')
    + card('Acurácia de ferramentas', 'target', pctv(t.accuracy), 'ok ÷ (ok + erro)')
    + card('Negadas / canceladas', 'shield', (t.denied || 0) + ' / ' + (t.cancelled || 0), (t.unknown || 0) + ' sem resultado registrado')
    + card('Sucesso das tarefas', 'flag', pctv(t.task_success), t.evaluated ? t.approved + ' de ' + t.evaluated + ' avaliada(s)' : 'sem testes no filtro')
    + '</div>'
    + (t.api_errors || t.compactions ? '<div class="note" style="margin:-6px 0 12px">' + ico('alert', 'inl') + ' ' + t.api_errors + ' erro(s) de API · ' + t.compactions + ' compactação(ões) no filtro.</div>' : '')
    + '<div class="grid-main"><div class="card"><div class="card-h"><b>Por dia</b><div class="seg">' + seg + '</div></div>' + (pts.length ? areaChart(pts, fmt, det) : '<div class="state">Sem dados.</div>') + '</div>'
    + '<div class="card"><div class="card-h"><b>Tipos de ferramenta</b></div>' + cats.map(([c, x]) => '<div class="irow"><span>' + catTag(c) + ' ' + x.tools + ' ferramenta(s)</span><b>' + x.calls + ' · ' + (x.ok + x.err ? fPctBR(x.ok / (x.ok + x.err)) : '—') + '</b></div>').join('')
    + '<div class="isec">Modelos</div>' + o.byModel.map((m) => '<div class="irow"><span>' + esc(m.model) + '</span><b>' + m.requests + ' · ' + (m.cost == null ? '—' : fUsd(m.cost)) + '</b></div>').join('') + '</div></div>'
    + '<h3>Ferramentas — volume e acurácia</h3>'
    + table('au-ovtools', [
      { k: 'tool', label: 'Ferramenta', l: 1, cls: 'name', type: 'text' }, { k: 'category', label: 'Tipo', l: 1, f: (x) => catTag(x.category) },
      { k: 'calls', label: 'Chamadas' }, { k: 'ok', label: 'OK' }, { k: 'err', label: 'Erros' }, { k: 'denied', label: 'Negadas' },
      { k: 'accuracy', label: 'Acurácia', f: (x) => accTag(x.accuracy) }, { k: 'sessions', label: 'Sessões' },
    ], o.byTool.map((x) => ({ ...x, _click: 'v2-tool:' + x.tool })), 'calls', { fixed: false, size: 10 });
}

// =============================== LIMITES NA VISÃO GERAL ===============================
function v2Limits() {
  const u = want('limits', 'subscription:usage');
  if (u === undefined || isErr(u)) return '';
  const bar = (label, w) => {
    if (!w || !w.last) return '<div class="limc"><div class="limh"><b>' + label + '</b>' + tag('', 'indisponível') + '</div><div class="limbar"><i style="width:0"></i></div><div class="note">sem leitura</div></div>';
    const p = Math.max(0, Math.min(100, w.last.used_pct));
    return '<div class="limc"><div class="limh"><b>' + label + '</b><span class="limv">' + p.toFixed(0) + '%</span>' + tag(w.freshness === 'fresco' ? 'ok' : 'warn', w.freshness) + '</div><div class="limbar' + (p >= 90 ? ' hot' : '') + '"><i style="width:' + p + '%"></i></div><div class="note">reinicia ' + (w.last.resets_at ? fDate(w.last.resets_at) : '—') + '</div></div>';
  };
  const none = !(u['5h'] && u['5h'].last) && !(u['7d'] && u['7d'].last);
  return '<div class="card limcard"><div class="card-h"><b>' + ico('clock', 'inl2') + ' Limites da sessão (assinatura)</b>'
    + (none ? '<button class="btn sm" data-v2-gotab="config">Ativar coleta</button>' : '<span class="note">fonte: status line · snapshots reais</span>') + '</div>'
    + '<div class="limgrid">' + bar('Janela de 5 horas', u['5h']) + bar('Janela de 7 dias', u['7d']) + '</div>'
    + (none ? '<div class="note">O Claude Code só informa o uso do plano para a status line. Ative o coletor em Configurações (sua status line atual é preservada); os valores aparecem aqui na próxima sessão.</div>' : '') + '</div>';
}

// =============================== GITHUB (dentro de Explorar) ===============================
function viewGithub() {
  const G = S.GH;
  const modes = [['marketplace', 'Marketplaces instaláveis'], ['plugin', 'Plugins'], ['skill', 'Skills'], ['mcp', 'MCP servers']];
  const key = 'gh|' + JSON.stringify([G.mode, G.q, G.sort, G.page]);
  const r = key in S.W.cache ? S.W.cache[key] : (S.W.pending[key] ? undefined : (S.W.pending[key] = window.ledger.api('github:search', { mode: G.mode, q: G.q, sort: G.sort, page: G.page })
    .then((x) => { S.W.cache[key] = x; delete S.W.pending[key]; render(); }).catch((e) => { S.W.cache[key] = { __error: e.message }; delete S.W.pending[key]; render(); }), undefined));
  let h = '<div class="ghbar"><div class="tchips">' + modes.map(([k, l]) => '<button class="tchip ' + (G.mode === k ? 'on' : '') + '" data-v2-ghmode="' + k + '">' + l + '</button>').join('') + '</div>'
    + '<div class="tlright"><div class="xsearch sm">' + ico('search') + '<input data-v2-ghq placeholder="Buscar no GitHub (Enter)…" value="' + esc(G.q) + '" spellcheck="false"></div>'
    + '<select data-v2-ghsort aria-label="Ordenar"><option value="stars"' + (G.sort === 'stars' ? ' selected' : '') + '>Mais estrelas</option><option value="updated"' + (G.sort === 'updated' ? ' selected' : '') + '>Atualizados recentemente</option></select></div></div>';
  if (r === undefined) return h + LOADING;
  if (isErr(r)) return h + errBox(r);
  const b = r.backend || {};
  h += '<div class="note ghinfo">' + (b.ok ? ico('check', 'inl') + ' via gh CLI' + (b.user ? ' (conta ' + esc(b.user) + ')' : '') : ico('alert', 'inl') + ' API pública sem login — ' + esc(b.reason || '') + '. Busca de código indisponível.')
    + (r.limit && !isNaN(r.limit.remaining) ? ' · limite ' + r.limit.remaining + '/' + r.limit.limit + ' por minuto' : '')
    + ' · ' + (r.total || 0).toLocaleString('pt-BR') + ' resultado(s)' + (G.mode === 'marketplace' ? ' (arquivos .claude-plugin/marketplace.json)' : ' com o tópico do tipo') + '</div>';
  if (r.message) return h + '<div class="state">' + esc(r.message) + '</div>';
  const pid = 'x-gh';
  S.pg[pid] = { i: G.page - 1, size: r.per || 20, auto: false };
  const items = r.items.map((x) => '<div class="xitem"><div class="xmain"><div class="xname"><b>' + esc(x.full_name) + '</b>'
    + (x.installable ? ' ' + tag('ok', 'instalável') : '') + (x.archived ? ' ' + tag('warn', 'arquivado') : '') + (x.license ? ' ' + tag('', x.license) : '') + '</div>'
    + '<div class="xsum">' + esc(x.description || '—') + '</div><div class="xmeta"><span class="xcost">' + ico('star') + (x.stars ?? 0).toLocaleString('pt-BR') + '</span>' + (x.updated_at ? '<span>atualizado ' + fDate(Date.parse(x.updated_at)) + '</span>' : '') + x.topics.slice(0, 4).map((t) => '<span>#' + esc(t) + '</span>').join('') + '</div></div>'
    + '<div class="xact"><button class="btn primary" data-xan="' + esc(x.url) + '">Analisar e instalar</button><button class="btn" data-v2-open="' + esc(x.url) + '">' + ico('ext') + 'Abrir no GitHub</button></div></div>').join('') || '<div class="empty">Nada encontrado.</div>';
  const total = Math.min(r.total || 0, (G.mode === 'marketplace' ? 50 : 20) * 10);
  return h + '<div class="card tcard fixed plistp" data-pgid="' + pid + '"><div class="pbody">' + items + '</div>' + pager(pid, total, 20) + '</div>';
}

// =============================== EVENTOS ===============================
document.getElementById('view').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-v2-back],[data-v2-asub],[data-v2-ausub],[data-v2-auchart],[data-v2-goev],[data-v2-gotab],[data-v2-csv],[data-v2-ghmode],[data-v2-open],tr[data-click^="v2-"]');
  if (!el) return;
  const d = el.dataset;
  if (el.matches('tr[data-click]')) {
    const c = d.click, i = c.indexOf(':'), kind = c.slice(0, i), val = c.slice(i + 1);
    if (kind === 'v2-agent') { S.tab = 'agentes'; S.A = { name: val, sub: 'resumo' }; render(); }
    else if (kind === 'v2-ev') { const [sid, ev] = val.split('|'); goEvidence(sid, +ev); }
    else if (kind === 'v2-tool') {
      // abre Auditoria › Ferramentas já filtrada pela ferramenta (filtro de coluna)
      S.tab = 'audit'; S.AU.sub = 'tools'; S.flt['au-tools'] = { tool: { type: 'text', q: val } }; if (S.pg['au-tools']) S.pg['au-tools'].i = 0; render();
    }
    return;
  }
  if ('v2Back' in d) { S.A = { name: null, sub: 'resumo' }; render(); return; }
  if (d.v2Asub) { S.A.sub = d.v2Asub; render(); return; }
  if (d.v2Ausub) { S.AU.sub = d.v2Ausub; render(); return; }
  if (d.v2Auchart) { S.AU.chart = d.v2Auchart; render(); return; }
  if (d.v2Goev) { const [sid, ev] = d.v2Goev.split('|'); goEvidence(sid, +ev); return; }
  if (d.v2Gotab) { S.tab = d.v2Gotab; render(); return; }
  if (d.v2Ghmode) { S.GH.mode = d.v2Ghmode; S.GH.page = 1; render(); return; }
  if (d.v2Open) { window.ledger.api('app:openExternal', d.v2Open); return; }
  if ('v2Csv' in d) {
    const id = { agents: 'au-agents', responses: 'au-resp', tools: 'au-tools', errors: 'au-err' }[S.AU.sub];
    const T = S.tables[id];
    if (!T) return;
    const cols = T.cols.filter((c) => !c.nf);
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [cols.map((c) => q(c.label)).join(',')].concat(T.filtered.map((r) => cols.map((c) => { const v = c.fv ? c.fv(r) : c.v ? c.v(r) : r[c.k]; return q(c.type === 'date' && v ? new Date(v).toISOString() : v); }).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })); a.download = 'auditoria-' + S.AU.sub + '.csv'; a.click();
  }
});
document.getElementById('view').addEventListener('keydown', (e) => {
  if (e.target.dataset.v2Ghq != null && e.key === 'Enter') { S.GH.q = e.target.value; S.GH.page = 1; render(); }
});
document.getElementById('view').addEventListener('change', (e) => {
  if (e.target.dataset.v2Ghsort != null) { S.GH.sort = e.target.value; S.GH.page = 1; render(); }
});
// paginação do GitHub é no servidor: troca de página = nova busca
document.getElementById('view').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pg^="x-gh|"]');
  if (!b || b.disabled) return;
  e.stopImmediatePropagation();
  S.GH.page = +b.dataset.pg.split('|')[1] + 1;
  render();
}, true);
window.ledger.onDbUpdated(() => { S.W.cache = {}; S.W.pending = {}; });
