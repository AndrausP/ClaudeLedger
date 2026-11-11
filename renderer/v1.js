'use strict';
/* global S, $, esc, ico, ICON, tag, tip, table, pager, pageOf, render, fDate, fUsd, fUsd2, fTok, fTokBR, fPctBR, areaChart, dayKey */
// Telas da especificação v1: Sessões (timeline, diagnóstico, mudanças, custos), Diagnósticos, Eficiência,
// Custos e assinatura, Assuntos e Configurações. Dados vêm do banco (canais IPC), nunca do renderer.

Object.assign(ICON, {
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-12 4"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  trend: '<path d="M3 17 9 11l4 4 8-8M15 7h6v6"/>',
  tagI: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H6v18h12V7l-4-4Z"/><path d="M14 3v4h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.5-1.5a4 4 0 0 1-5-5L13 2l-2 2"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
});

// menu remontado aqui porque usa ícones definidos acima
document.getElementById('tabs').innerHTML = TABS.map(([k, l, i, , g], idx) => (idx === 0 || TABS[idx - 1][4] !== g ? '<div class="navsec">' + g + '</div>' : '') + '<button data-tab="' + k + '">' + ico(i) + '<span>' + l + '</span></button>').join('');

S.V = { cache: {}, pending: {}, sid: null, stab: 'timeline', tl: { types: [], status: '', agent: '', q: '' }, sel: null, hl: null, eff: 'project', diagFilter: '', diff: null, confirm: '', msg: '', form: null };

// cache por chave; dispara busca uma vez e re-renderiza quando chega
function need(key, ch, ...args) {
  if (key in S.V.cache) return S.V.cache[key];
  if (!S.V.pending[key]) {
    S.V.pending[key] = window.ledger.api(ch, ...args).then((r) => { S.V.cache[key] = r; delete S.V.pending[key]; render(); })
      .catch((e) => { S.V.cache[key] = { __error: e.message }; delete S.V.pending[key]; render(); });
  }
  return undefined;
}
const drop = (prefix) => { for (const k of Object.keys(S.V.cache)) if (!prefix || k.startsWith(prefix)) delete S.V.cache[k]; };
const LOADING = '<div class="state"><span class="spin"></span>Carregando…</div>';
const errBox = (r) => '<div class="state err">' + ico('alert') + ' ' + esc(r.__error) + '</div>';
const isErr = (r) => r && r.__error;
// início do período arredondado ao minuto: a chave do cache precisa ser estável entre renders
const range = () => FX(); // filtro global (renderer/filters.js)
const rkey = () => JSON.stringify(range());
const fDur = (ms) => (ms == null ? '—' : ms < 1000 ? ms + ' ms' : ms < 60000 ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : ms < 3600000 ? Math.round(ms / 60000) + ' min' : (ms / 3600000).toFixed(1).replace('.', ',') + ' h');
const fTime = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR') : '—');
const sessName = (s) => s.title || 'Sessão ' + String(s.id).slice(0, 8);
const SEV = { 'crítico': 'bad', 'atenção': 'warn', info: 'info' };
const REC = { validated: ['ok', 'validado'], divergent: ['bad', 'divergente'], insufficient_data: ['', 'dados insuficientes'] };
const OUT = { approved: ['ok', 'aprovada'], rejected: ['bad', 'reprovada'], partial: ['warn', 'parcial'], unreviewed: ['', 'não avaliada'] };
const recTag = (st) => tag((REC[st] || REC.insufficient_data)[0], (REC[st] || REC.insufficient_data)[1]);
const outTag = (o) => tag((OUT[o] || OUT.unreviewed)[0], (OUT[o] || OUT.unreviewed)[1]);
const card = (label, icon, value, sub, cls = '') => '<div class="mcard ' + cls + '"><div class="ml">' + ico(icon) + esc(label) + '</div><div class="mv">' + value + '</div>' + (sub ? '<div class="ms">' + sub + '</div>' : '') + '</div>';
const unavailable = (why) => '<span class="na" title="' + esc(why) + '">indisponível</span>';

// =============================== SESSÕES ===============================
function viewSessoesV1() {
  if (S.V.sid) return viewSessionDetail();
  const list = need('sessions|' + rkey(), 'sessions:list', range());
  if (list === undefined) return LOADING;
  if (isErr(list)) return errBox(list);
  const rows = list.map((s) => ({ ...s, name: sessName(s), dur: s.start_at && s.end_at ? s.end_at - s.start_at : null, sev: s.worst || 0, _click: 'v-session:' + s.id }));
  const max = Math.max(0, ...rows.map((r) => r.cost || 0));
  const cols = [
    { k: 'name', label: 'Sessão', l: 1, type: 'text', f: (r) => esc(r.name) + (r.title ? '' : ' <span class="note mono">' + esc(r.id.slice(0, 8)) + '</span>') },
    { k: 'project', label: 'Projeto', l: 1 },
    { k: 'start_at', label: 'Início', type: 'date', f: (r) => fDate(r.start_at) },
    { k: 'dur', label: 'Duração', f: (r) => fDur(r.dur) },
    { k: 'cost', label: 'Custo equiv.', f: (r) => (r.cost == null ? unavailable('sem preço para o modelo') : fUsd(r.cost) + (r.unpriced ? ' <span class="na">parcial</span>' : '')) + '<span class="meter"><i style="width:' + (max ? ((r.cost || 0) / max) * 100 : 0) + '%"></i></span>' },
    { k: 'requests', label: 'Requisições' }, { k: 'tools', label: 'Ferramentas' },
    { k: 'tool_errors', label: 'Erros' }, { k: 'subagents', label: 'Subagentes' },
    { k: 'sev', label: 'Achados', fv: (r) => r.findings, f: (r) => (r.findings ? tag(['', 'info', 'warn', 'bad'][r.sev], r.findings + (r.sev === 3 ? ' crítico' : r.sev === 2 ? ' atenção' : ' info')) : '<span class="note">—</span>') },
  ];
  return '<p class="sub">Clique numa sessão para abrir a timeline, o diagnóstico, as mudanças de código e a reconciliação de custos. Dados do banco local (coleta incremental a cada minuto).</p>'
    + table('v-sessions', cols, rows, 'start_at');
}

function sessionHeader(d) {
  const s = d.session, r = d.requests;
  const dur = s.start_at && s.end_at ? s.end_at - s.start_at : null;
  const rec = d.reconciliation;
  const out = d.outcome || {};
  const ev = d.events || {};
  const outSel = '<select data-v-outcome="' + esc(s.id) + '" title="Avaliação manual (prevalece sobre a automática)">' + [['', 'automática'], ['approved', 'aprovada'], ['rejected', 'reprovada'], ['partial', 'parcial'], ['unreviewed', 'não avaliada']].map(([v, l]) => '<option value="' + v + '"' + ((out.evaluation_method === 'human' ? out.outcome : '') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  return '<div class="shead"><button class="btn" data-v-back>' + ico('back') + 'Sessões</button>'
    + '<div class="stitle"><h2 class="sh2">' + esc(sessName(s)) + '</h2><div class="smeta"><span class="mono">' + esc(s.id) + '</span> · ' + esc(s.project || s.project_id) + ' · ' + fDate(s.start_at) + ' → ' + fTime(s.end_at) + ' · ' + fDur(dur)
    + ' · ' + d.models.map((m) => esc(m.model)).join(', ') + ' · ' + tag('', 'completude: ' + s.source_completeness) + '</div>'
    + '<div class="smeta2">' + ico('flag') + ' Avaliação: ' + outTag(out.outcome) + ' <span class="note">' + esc(out.evaluation_method === 'human' ? 'manual' : out.evaluation_method === 'tests' ? 'por testes' : 'sem evidência') + (out.evidence && out.evidence.reason ? ' — ' + esc(out.evidence.reason) : '') + '</span> ' + outSel
    + '<span class="tagbox">' + ico('tagI') + '<input data-v-tags="' + esc(s.id) + '" value="' + esc((d.tags || []).join(', ')) + '" placeholder="assuntos: bug, refatoração…" spellcheck="false"></span></div></div></div>'
    + '<div class="mcards compact">'
    + card('Custo equivalente', 'coins', r.cost == null ? unavailable('modelo sem preço') : fUsd2(r.cost), r.unpriced ? r.unpriced + ' requisição(ões) sem preço' : 'tabela de preços local · não é fatura')
    + card('Tokens', 'bolt', fTokBR((r.tin || 0) + (r.tout || 0) + (r.cr || 0) + (r.w5 || 0) + (r.w1 || 0)), 'entrada ' + fTokBR(r.tin || 0) + ' · saída ' + fTokBR(r.tout || 0) + ' · cache leit. ' + fTokBR(r.cr || 0) + ' · cache escr. ' + fTokBR((r.w5 || 0) + (r.w1 || 0)))
    + card('Ferramentas', 'wrench', String(d.tools.n || 0), (d.tools.err || 0) + ' erro(s) · ' + (d.tools.denied || 0) + ' negada(s) · ' + (d.tools.tests || 0) + ' teste(s)')
    + card('Erros de API', 'alert', String(ev.api_error || 0), ev.api_error ? 'conexão / resposta incompleta' : 'nenhum registrado')
    + card('Subagentes', 'bot', String(d.agents.filter((a) => a.kind === 'subagent').length), d.agents.filter((a) => a.kind === 'subagent').map((a) => esc(a.name)).slice(0, 3).join(', ') || '—')
    + card('Compactações', 'compress', String(ev.compaction || 0), (ev.turn || 0) + ' turnos')
    + card('Reconciliação', 'shield', recTag(rec.status), rec.total ? 'reportado ' + (rec.total.reported == null ? '—' : fUsd(rec.total.reported)) + ' · recalculado ' + (rec.total.recalculated == null ? '—' : fUsd(rec.total.recalculated)) : esc(rec.reason || ''), rec.status === 'divergent' ? 'warnc' : '')
    + '</div>';
}

function viewSessionDetail() {
  const id = S.V.sid;
  const d = need('session|' + id, 'sessions:get', id);
  if (d === undefined) return LOADING;
  if (isErr(d) || !d) return errBox(d || { __error: 'Sessão não encontrada.' });
  const nd = (d.diagnostics || []).filter((x) => !['falso_positivo', 'ignorado'].includes(x.feedback)).length;
  const tabs = [['timeline', 'Timeline', d.events ? Object.values(d.events).reduce((a, b) => a + b, 0) : null], ['diag', 'Diagnóstico', nd], ['changes', 'Mudanças', null], ['costs', 'Custos', null]];
  let body = '';
  if (S.V.stab === 'timeline') body = timelineView(d);
  else if (S.V.stab === 'diag') body = diagView(d.diagnostics || [], id);
  else if (S.V.stab === 'changes') body = changesView(id);
  else body = sessionCosts(d);
  // controles da timeline na mesma linha das abas (ganha altura para mais eventos por página)
  const controls = S.V.stab === 'timeline' ? timelineControls(d) : '';
  return sessionHeader(d)
    + '<div class="strow"><div class="subtabs" role="tablist">' + tabs.map(([k, l, n]) => '<button role="tab" data-v-stab="' + k + '" class="' + (S.V.stab === k ? 'on' : '') + '">' + l + (n != null ? '<span class="cnt">' + n + '</span>' : '') + '</button>').join('') + '</div>' + controls + '</div>'
    + body;
}

// ---------- timeline ----------
const ETYPE = {
  user_prompt: ['Prompt', 'user'], model_response: ['Resposta do modelo', 'layers'], tool_call: ['Ferramenta', 'wrench'],
  compaction: ['Compactação', 'compress'], turn: ['Turno', 'clock'], api_error: ['Erro de API', 'alert'],
};
const STAT = { ok: ['ok', 'sucesso'], erro: ['bad', 'falha'], negado: ['warn', 'negado'], cancelado: ['warn', 'cancelado'], desconhecido: ['', 'desconhecido'] };
function evDesc(e) {
  const p = e.payload || {};
  switch (e.type) {
    case 'user_prompt': return (p.chars || 0).toLocaleString('pt-BR') + ' caracteres <span class="note">(texto não armazenado)</span>';
    case 'model_response': return esc(String(p.model || '').replace(/^claude-/, '')) + ' · ' + fTokBR((p.in || 0) + (p.cr || 0) + (p.cw || 0)) + ' entrada · ' + fTokBR(p.out || 0) + ' saída' + (p.tools && p.tools.length ? ' · chamou ' + esc(p.tools.join(', ')) : '');
    case 'tool_call': return '<b>' + esc(p.tool || '?') + '</b>' + (p.target ? ' · <span class="mono">' + esc(p.target) + '</span>' : '') + (p.label && !p.target ? ' · ' + esc(p.label) : '') + (p.is_test ? ' ' + tag('info', 'teste') : '');
    case 'compaction': return esc(p.trigger || '') + ' · ' + fTokBR(p.preTokens || 0) + ' → ' + fTokBR(p.postTokens || 0) + ' tokens' + (p.durationMs ? ' · ' + fDur(p.durationMs) : '');
    case 'turn': return (p.messages || 0) + ' mensagens';
    case 'api_error': return esc(p.error || '') + (p.cause ? ' · ' + esc(p.cause) : '');
    default: return '';
  }
}
function timelineControls(d) {
  const t = S.V.tl;
  return '<div class="tlright">'
    + '<select data-v-tstatus aria-label="Estado"><option value="">Todos os estados</option>' + Object.entries(STAT).map(([k, [, l]]) => '<option value="' + k + '"' + (t.status === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
    + '<select data-v-tagent aria-label="Agente"><option value="">Todos os agentes</option>' + d.agents.map((a) => '<option value="' + esc(a.id) + '"' + (t.agent === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select>'
    + '<div class="xsearch sm">' + ico('search') + '<input data-v-tq placeholder="Ferramenta, arquivo, modelo…" value="' + esc(t.q) + '" spellcheck="false"></div>'
    + '<button class="btn" data-v-export="json" title="Exportar eventos filtrados (JSON)">' + ico('download') + 'JSON</button><button class="btn" data-v-export="csv" title="Exportar eventos filtrados (CSV)">' + ico('download') + 'CSV</button></div>';
}
function tlFilters() {
  const t = S.V.tl;
  return { types: t.types.length ? t.types : undefined, status: t.status ? [t.status] : undefined, agents: t.agent ? [t.agent] : undefined, q: t.q || undefined };
}
function timelineView(d) {
  const id = S.V.sid, t = S.V.tl, pid = 'v-tl';
  const p = S.pg[pid] || (S.pg[pid] = { i: 0, size: 12, auto: true });
  const f = { ...tlFilters(), page: p.i, size: p.size };
  const key = 'tl|' + id + '|' + JSON.stringify(f);
  const data = need(key, 'sessions:timeline', id, f);
  const chips = Object.entries(ETYPE).map(([k, [l, i]]) => '<button class="tchip ' + (t.types.includes(k) ? 'on' : '') + '" data-v-ttype="' + k + '">' + ico(i) + l + (d.events[k] ? '<span>' + d.events[k] + '</span>' : '') + '</button>').join('');
  const bar = '<div class="tlbar"><div class="tchips">' + chips + '</div></div>';
  let list;
  if (data === undefined) list = LOADING;
  else if (isErr(data)) list = errBox(data);
  else {
    p.i = data.page;
    list = data.items.map((e) => {
      const [label, icon] = ETYPE[e.type] || [e.type, 'pulse'];
      const st = STAT[e.status || 'desconhecido'] || STAT.desconhecido;
      const dur = e.end_at != null && e.at != null ? e.end_at - e.at : null;
      const cost = e.type === 'model_response' && e.payload && e.payload.cost != null ? fUsd(e.payload.cost) : '';
      return '<div class="tev t-' + e.type + (e.status === 'erro' || e.type === 'api_error' ? ' t-err' : '') + (S.V.hl === e.id ? ' hl' : '') + (S.V.sel === e.id ? ' sel' : '') + '" data-v-ev="' + e.id + '">'
        + '<span class="tt mono">' + fTime(e.at) + '</span><span class="tdot">' + ico(icon) + '</span>'
        + '<span class="tl">' + esc(label) + '</span><span class="ta">' + esc(e.agent_name || '—') + '</span>'
        + '<span class="td">' + evDesc(e) + '</span><span class="tdu mono">' + (dur != null && e.type !== 'model_response' ? fDur(dur) : '') + '</span>'
        + '<span class="tc mono">' + cost + '</span><span class="ts">' + (e.type === 'tool_call' || e.type === 'api_error' ? tag(st[0], st[1]) : '') + '</span></div>';
    }).join('') || '<div class="empty">Nenhum evento com estes filtros.</div>';
  }
  // durante o carregamento mantém o último total: total 0 faria a paginação voltar para a página 1
  if (data && !isErr(data)) S.V.tlTotal = data.total;
  const total = data && !isErr(data) ? data.total : (S.V.tlTotal || 0);
  const panel = '<div class="card tcard fixed tlpanel" data-pgid="' + pid + '"><div class="pbody tlbody">' + list + '</div>' + pager(pid, total, 12) + '</div>';
  return bar + '<div class="tlwrap' + (S.V.sel ? ' withinsp' : '') + '">' + panel + (S.V.sel ? inspector() : '') + '</div>'
    + '<div class="note">Fonte: transcrito local (horários de gravação; durações de ferramenta são aproximadas e incluem espera por aprovação). Nenhum evento é inventado para preencher lacunas. Visão Gantt: indisponível — exige início/fim confiáveis por evento (traces OTel).</div>';
}
function inspector() {
  const e = need('ev|' + S.V.sel, 'sessions:event', S.V.sel);
  let b;
  if (e === undefined) b = LOADING;
  else if (!e || isErr(e)) b = errBox(e || { __error: 'Evento não encontrado.' });
  else {
    const row = (k, v) => '<div class="irow"><span>' + esc(k) + '</span><b>' + v + '</b></div>';
    b = '<div class="ihead"><b>' + esc((ETYPE[e.type] || [e.type])[0]) + '</b><button class="btn" data-v-close>' + ico('x') + '</button></div>'
      + row('ID do evento', '<span class="mono">' + e.id + '</span>') + row('Fonte', esc(e.source)) + row('ID na fonte', '<span class="mono">' + esc(e.source_event_id) + '</span>')
      + row('Início', fDate(e.at) + ' ' + fTime(e.at)) + row('Fim', e.end_at ? fTime(e.end_at) : '—') + row('Duração', e.end_at ? fDur(e.end_at - e.at) : '—')
      + row('Agente', esc(e.agent_name || '—')) + row('Estado', esc(e.status || '—'))
      + (e.tool ? row('Ferramenta', esc(e.tool.tool_name)) + row('Arquivo', e.tool.target_label ? '<span class="mono">' + esc(e.tool.target_label) + '</span>' : '—') + row('Hash dos parâmetros', '<span class="mono">' + esc(e.tool.input_hash || '—') + '</span>') + row('Precisão da duração', esc(e.tool.duration_precision)) + (e.tool.error_signature ? row('Assinatura do erro', '<span class="mono">' + esc(e.tool.error_signature) + '</span>') : '') : '')
      + '<div class="isec">Campos sanitizados</div><pre class="out">' + esc(JSON.stringify(e.payload, null, 2)) + '</pre>'
      + '<div class="isec">Diagnósticos ligados</div>' + (e.findings.length ? e.findings.map((f) => '<div class="ilink" data-v-gofind="' + f.id + '">' + tag(SEV[f.severity], f.severity) + ' ' + esc(f.title) + '</div>').join('') : '<div class="note">nenhum</div>')
      + '<div class="note">Texto de prompts, respostas e saídas de ferramenta não é armazenado.</div>';
  }
  return '<aside class="insp">' + b + '</aside>';
}

// ---------- diagnóstico ----------
function diagView(list, sid) {
  const visible = list.filter((f) => !S.V.diagFilter || f.severity === S.V.diagFilter);
  const counts = { 'crítico': 0, 'atenção': 0, info: 0 };
  for (const f of list) if (!['falso_positivo', 'ignorado'].includes(f.feedback)) counts[f.severity]++;
  const head = '<div class="dsum">' + Object.entries(counts).map(([k, n]) => '<button class="dcount ' + SEV[k] + (S.V.diagFilter === k ? ' on' : '') + '" data-v-dfilter="' + k + '"><b>' + n + '</b>' + k + '</button>').join('')
    + '<button class="btn" data-v-recompute="' + esc(sid || '') + '">' + ico('pulse') + 'Recalcular</button></div>';
  if (!visible.length) return head + '<div class="state">' + ico('check') + ' Nenhum achado' + (S.V.diagFilter ? ' com esta gravidade' : '') + '. As regras só disparam com evidência suficiente.</div>';
  return head + visible.map((f) => '<div class="finding ' + SEV[f.severity] + (f.feedback ? ' fb-' + f.feedback : '') + '">'
    + '<div class="fh">' + tag(SEV[f.severity], f.severity) + '<b>' + esc(f.title) + '</b>' + (!sid ? '<span class="note">' + esc(f.session_title || String(f.session_id).slice(0, 8)) + '</span>' : '') + '<span class="fr mono">' + esc(f.rule_id) + ' v' + f.rule_version + '</span></div>'
    + '<p>' + esc(f.explanation) + '</p>'
    + (f.recommendation ? '<p class="frec">' + ico('spark') + esc(f.recommendation) + '</p>' : '')
    + '<div class="fmeta"><span>Confiança: ' + esc(f.confidence || '—') + '</span></div>'
    + '<div class="fev"><span class="note">Evidências (' + f.evidence_ids.length + '):</span>' + f.evidence_ids.slice(0, 12).map((x) => '<button class="evchip mono" data-v-goev="' + f.session_id + '|' + x + '">#' + x + '</button>').join('') + (f.evidence_ids.length > 12 ? '<span class="note">+' + (f.evidence_ids.length - 12) + '</span>' : '') + '</div>'
    + '<div class="fact"><button class="btn primary" data-v-goev="' + f.session_id + '|' + f.evidence_ids[0] + '">Ver evidências na timeline</button>'
    + [['util', 'Útil'], ['falso_positivo', 'Falso positivo'], ['ignorado', 'Ignorar nesta sessão']].map(([v, l]) => '<button class="btn' + (f.feedback === v ? ' on' : '') + '" data-v-fb="' + f.id + '|' + (f.feedback === v ? '' : v) + '">' + l + '</button>').join('') + '</div></div>').join('');
}

// ---------- mudanças (git + file-history) ----------
function diffViewer(files) {
  return files.map((f) => '<div class="dfile"><div class="dfh"><span class="mono">' + esc(f.path || f.rel) + '</span><span class="dstat"><i class="plus">+' + (f.added ?? '?') + '</i> <i class="minus">−' + (f.removed ?? '?') + '</i></span></div>'
    + (f.binary ? '<div class="note">arquivo binário</div>' : f.tooLarge ? '<div class="note">diferença grande demais para exibir</div>'
      : f.hunks.map((h) => '<div class="dh mono">' + esc(h.header) + '</div>' + h.lines.map((l) => '<div class="dl d' + (l.t === '+' ? 'a' : l.t === '-' ? 'r' : 'c') + '"><span class="dn">' + (l.na ?? '') + '</span><span class="dn">' + (l.nb ?? '') + '</span><span class="dsig">' + (l.t === ' ' ? '' : l.t) + '</span><code>' + esc(l.text) + '</code></div>').join('')).join(''))
    + '</div>').join('');
}
function changesView(id) {
  const g = need('commits|' + id, 'changes:commits', id);
  const fh = need('files|' + id, 'changes:files', id);
  let h = '<div class="grid2">';
  h += '<div class="card"><div class="card-h"><b>' + ico('git', 'inl2') + ' Commits durante a sessão</b></div>';
  if (g === undefined) h += LOADING;
  else if (isErr(g)) h += errBox(g);
  else if (!g.available) h += '<div class="state">' + esc(g.reason) + '</div>';
  else {
    h += '<div class="note" style="margin:0 0 8px">Repositório <span class="mono">' + esc(g.top) + '</span> · janela da sessão (+10 min)' + (g.uncommitted != null ? ' · ' + g.uncommitted + ' arquivo(s) com mudança não commitada agora' : '') + '</div>';
    h += g.commits.length ? g.commits.map((c) => '<div class="crow' + (S.V.diff && S.V.diff.kind === 'commit' && S.V.diff.id === c.hash ? ' on' : '') + '" data-v-commit="' + c.hash + '"><span class="mono">' + esc(c.short) + '</span><span class="cs">' + esc(c.subject) + '</span><span class="note">' + esc(c.author) + ' · ' + fTime(c.at) + '</span><span class="dstat"><i class="plus">+' + c.added + '</i> <i class="minus">−' + c.removed + '</i> · ' + c.files.length + ' arq.</span></div>').join('') : '<div class="state">Nenhum commit nesse intervalo.</div>';
  }
  h += '</div><div class="card"><div class="card-h"><b>' + ico('file', 'inl2') + ' Arquivos editados pelo Claude</b></div>';
  if (fh === undefined) h += LOADING;
  else if (isErr(fh)) h += errBox(fh);
  else if (!fh.available) h += '<div class="state">' + esc(fh.reason) + '</div>';
  else {
    h += '<div class="note" style="margin:0 0 8px">Fonte: file-history do Claude Code (cópia de antes da 1ª edição) × <b>estado atual em disco</b> — mudanças posteriores à sessão também aparecem.</div>';
    h += fh.files.map((f) => '<div class="crow' + (S.V.diff && S.V.diff.kind === 'file' && S.V.diff.id === f.rel ? ' on' : '') + '" data-v-file="' + esc(f.rel) + '"><span class="mono cs">' + esc(f.rel) + '</span>' + (f.created ? tag('ok', 'criado') : '') + (f.exists === false ? tag('bad', 'removido') : '') + '<span class="note">' + f.versions + ' versão(ões)</span></div>').join('');
  }
  h += '</div></div>';
  if (S.V.diff) {
    const dk = S.V.diff.kind === 'commit' ? 'show|' + id + '|' + S.V.diff.id : 'fdiff|' + id + '|' + S.V.diff.id;
    const dd = S.V.diff.kind === 'commit' ? need(dk, 'changes:show', id, S.V.diff.id) : need(dk, 'changes:fileDiff', id, S.V.diff.id);
    h += '<div class="card"><div class="card-h"><b>Diff · <span class="mono">' + esc(S.V.diff.kind === 'commit' ? S.V.diff.id.slice(0, 10) : S.V.diff.id) + '</span></b><button class="btn" data-v-closediff>' + ico('x') + 'Fechar</button></div>';
    if (dd === undefined) h += LOADING;
    else if (isErr(dd)) h += errBox(dd);
    else if (S.V.diff.kind === 'commit') h += (dd.truncated ? '<div class="note">Patch grande: exibindo o início.</div>' : '') + diffViewer(dd.files);
    else if (!dd.available) h += '<div class="state">' + esc(dd.reason) + '</div>';
    else h += (dd.deleted ? '<div class="note">O arquivo não existe mais em disco.</div>' : '') + diffViewer([{ rel: S.V.diff.id, ...dd }]);
    h += '</div>';
  }
  return h;
}

// ---------- custos da sessão ----------
function sessionCosts(d) {
  const rec = d.reconciliation;
  const rows = (rec.rows || []).concat(rec.total ? [rec.total] : []);
  const recTable = rows.length ? '<table><thead><tr><th class="l nf">Modelo</th><th class="nf">Reportado</th><th class="nf">Recalculado</th><th class="nf">Diferença</th><th class="l nf">Estado</th></tr></thead><tbody>'
    + rows.map((r) => '<tr' + (r.model === 'total' ? ' class="totrow"' : '') + '><td class="l">' + esc(r.model) + '</td><td>' + (r.reported == null ? unavailable('sem dado reportado') : fUsd(r.reported)) + '</td><td>' + (r.recalculated == null ? unavailable('modelo sem preço') : fUsd(r.recalculated)) + '</td><td>' + (r.diffPct == null ? '—' : (r.diffPct >= 0 ? '+' : '') + r.diffPct.toFixed(1).replace('.', ',') + '%') + '</td><td class="l">' + recTag(r.status) + '</td></tr>').join('') + '</tbody></table>'
    : '<div class="state">' + esc(rec.reason || 'Sem dados para reconciliar.') + '</div>';
  const agents = '<table><thead><tr><th class="l nf">Agente</th><th class="l nf">Tipo</th><th class="nf">Requisições</th><th class="nf">Custo equiv.</th><th class="nf">Duração</th></tr></thead><tbody>'
    + d.agents.map((a) => '<tr><td class="l">' + esc(a.name) + '</td><td class="l">' + tag(a.kind === 'main' ? 'info' : '', a.kind === 'main' ? 'principal' : 'subagente') + '</td><td>' + a.requests + '</td><td>' + (a.cost == null ? '—' : fUsd(a.cost)) + '</td><td>' + fDur(a.start_at && a.end_at ? a.end_at - a.start_at : null) + '</td></tr>').join('') + '</tbody></table>';
  return '<div class="grid2"><div class="card"><div class="card-h"><b>Reportado × recalculado</b></div>' + recTable
    + '<div class="note">Reportado = <span class="mono">cost-state</span> gravado pelo próprio Claude Code no transcrito' + (rec.unknownModelCost ? ' (com modelo de custo desconhecido)' : '') + '. Recalculado = tokens × tabela de preços versionada. Ambos são <b>custo equivalente de API</b>, não a fatura da assinatura.</div></div>'
    + '<div class="card"><div class="card-h"><b>Por agente</b></div>' + agents + '<div class="note">Subagentes só recebem requisições do próprio transcrito (atribuição comprovada).</div></div></div>';
}

// =============================== DIAGNÓSTICOS (global) ===============================
function viewDiagnosticos() {
  const list = need('diag|all|' + rkey(), 'diagnostics:list', { filter: range() });
  if (list === undefined) return LOADING;
  if (isErr(list)) return errBox(list);
  const inRange = list; // já filtrado no banco pelo filtro global
  const rows = inRange.map((f) => ({ ...f, sev: { 'crítico': 3, 'atenção': 2, info: 1 }[f.severity], sess: f.session_title || 'Sessão ' + f.session_id.slice(0, 8), fbk: f.feedback || '—', _click: 'v-diag:' + f.session_id }));
  const cols = [
    { k: 'sev', label: 'Gravidade', fv: (r) => r.severity, f: (r) => tag(SEV[r.severity], r.severity) },
    { k: 'rule_id', label: 'Regra', l: 1, mono: 1 },
    { k: 'title', label: 'Achado', l: 1, cls: 'name', type: 'text' },
    { k: 'sess', label: 'Sessão', l: 1, type: 'text' }, { k: 'project', label: 'Projeto', l: 1 },
    { k: 'session_start', label: 'Quando', type: 'date', f: (r) => fDate(r.session_start) },
    { k: 'fbk', label: 'Feedback', l: 1 },
  ];
  const counts = { 'crítico': 0, 'atenção': 0, info: 0 };
  for (const f of inRange) counts[f.severity]++;
  return '<p class="sub">Regras determinísticas e versionadas. Cada achado aponta eventos da timeline como evidência. Recomendações são hipóteses — marque falso positivo para calibrar.</p>'
    + '<div class="dsum">' + Object.entries(counts).map(([k, n]) => '<span class="dcount ' + SEV[k] + '"><b>' + n + '</b>' + k + '</span>').join('') + '<button class="btn" data-v-recompute="*">' + ico('pulse') + 'Recalcular tudo</button></div>'
    + table('v-diag', cols, rows, 'sev');
}

// =============================== EFICIÊNCIA ===============================
function viewEficiencia() {
  const f = { ...range(), groupBy: S.V.eff };
  const r = need('eff|' + JSON.stringify(f), 'efficiency:analyze', f);
  if (r === undefined) return LOADING;
  if (isErr(r)) return errBox(r);
  const o = r.overall;
  const pct = (x) => (x == null ? unavailable('sem avaliação suficiente') : fPctBR(x));
  const seg = [['project', 'Projeto'], ['model', 'Modelo'], ['agent', 'Uso de subagentes']].map(([k, l]) => '<button data-v-effg="' + k + '" class="' + (S.V.eff === k ? 'on' : '') + '">' + l + '</button>').join('');
  const warn = o.insufficient ? '<div class="banner warn">' + ico('alert') + ' Amostra pequena: só <b>' + o.evaluated + '</b> tarefa(s) avaliada(s) no período. Taxas e comparações não são confiáveis com menos de 5.</div>' : '';
  const trendPts = r.trend.map((w) => ({ k: dayKey(w.week), v: w.cost_per_approved || 0 }));
  const cols = [
    { k: 'key', label: { project: 'Projeto', model: 'Modelo', agent: 'Grupo' }[S.V.eff], l: 1, cls: 'name' },
    { k: 'n', label: 'Sessões (n)' },
    { k: 'evaluated', label: 'Avaliadas' },
    { k: 'success_rate', label: 'Taxa de sucesso', f: (x) => pct(x.success_rate) + (x.insufficient ? ' <span class="na" title="menos de 5 avaliadas">n baixo</span>' : '') },
    { k: 'coverage', label: 'Cobertura', f: (x) => pct(x.coverage) },
    { k: 'cost_per_approved', label: 'Custo/aprovada', f: (x) => (x.cost_per_approved == null ? '—' : fUsd(x.cost_per_approved)) },
    { k: 'tool_failure_rate', label: 'Falha de ferramentas', f: (x) => pct(x.tool_failure_rate) },
    { k: 'duration_median', label: 'Duração mediana', f: (x) => fDur(x.duration_median) },
    { k: 'duration_p90', label: 'P90', f: (x) => fDur(x.duration_p90) },
    { k: 'cache_read_share', label: 'Cache leitura', f: (x) => pct(x.cache_read_share) },
  ];
  return '<p class="sub">Desempenho sem confundir “gastou pouco” com “fez bem”. Tarefa = sessão. Avaliação automática pelo <b>último comando de teste</b> da sessão (passou → aprovada; falhou → reprovada); sem teste fica <b>não avaliada</b> e sai do denominador. Avaliação manual na sessão prevalece.</p>'
    + warn
    + '<div class="mcards six">'
    + card('Taxa de sucesso', 'check', pct(o.success_rate), o.approved + ' aprovada(s) / ' + o.evaluated + ' avaliada(s)')
    + card('Cobertura de avaliação', 'flag', pct(o.coverage), o.evaluated + ' de ' + o.n + ' sessões')
    + card('Custo por aprovada', 'coins', o.cost_per_approved == null ? unavailable('nenhuma aprovada') : fUsd2(o.cost_per_approved), 'equivalente de API · ' + (o.cost_complete ? 'completo' : 'há modelos sem preço'))
    + card('Falha de ferramentas', 'wrench', pct(o.tool_failure_rate), 'erros / resultados conhecidos')
    + card('Duração mediana', 'clock', fDur(o.duration_median), 'P90 ' + fDur(o.duration_p90) + ' · n=' + o.duration_n)
    + card('Cache leitura', 'db', pct(o.cache_read_share), 'cache read / entrada total')
    + '</div>'
    + '<div class="grid-main"><div class="card"><div class="card-h"><b>Custo por tarefa aprovada (semanal)</b></div>' + (trendPts.some((p) => p.v) ? areaChart(trendPts, (v) => (v === 0 ? '$0' : '$' + v.toFixed(v >= 10 ? 0 : 2)), (k) => { const w = r.trend.find((x) => dayKey(x.week) === k); return [['Custo/aprovada', w.cost_per_approved == null ? '—' : fUsd2(w.cost_per_approved), 'var(--accent)'], ['Aprovadas', String(w.approved)], ['Avaliadas', String(w.evaluated)], ['Sessões', String(w.n)]]; }) : '<div class="state">Nenhuma tarefa aprovada no período — sem tendência para mostrar.</div>') + '</div>'
    + (() => {
      const by = { approved: 0, rejected: 0, partial: 0, unreviewed: 0 }, meth = {};
      for (const s of r.sessions) { by[s.outcome] = (by[s.outcome] || 0) + 1; meth[s.evaluation_method] = (meth[s.evaluation_method] || 0) + 1; }
      const tot = r.sessions.length || 1;
      const bar = (k) => '<div class="hbar nohover"><span>' + outTag(k) + '</span><div class="track"><i style="width:' + (by[k] / tot) * 100 + '%;background:' + { approved: 'var(--accent)', rejected: 'var(--bad)', partial: 'var(--warn)', unreviewed: '#3a3a3a' }[k] + '"></i></div><em>' + by[k] + '</em></div>';
      return '<div class="card"><div class="card-h"><b>Distribuição dos resultados</b></div>' + ['approved', 'rejected', 'partial', 'unreviewed'].map(bar).join('')
        + '<div class="isec">Método de avaliação</div>' + Object.entries(meth).map(([m, n]) => '<div class="irow"><span>' + esc({ tests: 'testes (automático)', human: 'manual', rule: 'sem evidência' }[m] || m) + '</span><b>' + n + '</b></div>').join('') + '</div>';
    })() + '</div>'
    + '<div class="card-h" style="margin-top:6px"><b>Indicadores por grupo</b><div class="seg">' + seg + '</div></div>'
    + table('v-eff-' + S.V.eff, cols, r.groups, 'n', { fixed: false, size: 10 })
    + '<div class="note">Indicadores separados de propósito — não existe índice único. Fórmulas: sucesso = aprovadas ÷ avaliadas (parcial no denominador); custo/aprovada = custo do grupo ÷ aprovadas; falha = erros ÷ resultados conhecidos; cache = cache read ÷ (entrada + cache read + cache write).</div>';
}

// =============================== CUSTOS E ASSINATURA ===============================
function limitBar(label, w) {
  if (!w || !w.last) return '<div class="lim"><div class="limh"><b>' + label + '</b>' + tag('', 'indisponível') + '</div><div class="limbar"><i style="width:0"></i></div><div class="note">Sem leitura. Ative o coletor da status line em Configurações — só snapshots reais são exibidos, nada é estimado.</div></div>';
  const l = w.last, used = Math.max(0, Math.min(100, l.used_pct));
  return '<div class="lim"><div class="limh"><b>' + label + '</b><span class="limv">' + used.toFixed(0) + '%</span>' + tag(w.freshness === 'fresco' ? 'ok' : 'warn', w.freshness) + '</div>'
    + '<div class="limbar' + (used >= 90 ? ' hot' : '') + '"><i style="width:' + used + '%"></i></div>'
    + '<div class="note">Reinicia ' + (l.resets_at ? fDate(l.resets_at) : '—') + ' · última coleta ' + fDate(l.captured_at) + ' · fonte=status_line · não convertível em dólares</div></div>';
}
function viewCustos() {
  const sum = need('costs|' + rkey(), 'costs:summary', range());
  const sub = need('sub', 'subscription:usage');
  if (sum === undefined) return LOADING;
  if (isErr(sum)) return errBox(sum);
  const st = sum.settings || {};
  const metric = S.V.costChart || 'cost';
  const pts = sum.daily.map((d) => ({ k: d.day, v: metric === 'cost' ? d.cost || 0 : metric === 'tokens' ? d.tokens : d.sessions }));
  const fmt = { cost: (v) => (v === 0 ? '$0' : '$' + (v >= 10 ? Math.round(v) : v.toFixed(2))), tokens: (v) => fTok(v), sessions: (v) => String(Math.round(v)) }[metric];
  const rc = sum.reconciliation;
  const recRows = need('rec|' + rkey(), 'costs:reconciliation', range());
  const cols = [
    { k: 'title', label: 'Sessão', l: 1, cls: 'name', type: 'text', f: (r) => esc(r.title || 'Sessão ' + r.id.slice(0, 8)) },
    { k: 'project', label: 'Projeto', l: 1 },
    { k: 'start_at', label: 'Início', type: 'date', f: (r) => fDate(r.start_at) },
    { k: 'reported', label: 'Reportado', f: (r) => (r.reported == null ? unavailable('sem cost-state') : fUsd(r.reported)) },
    { k: 'recalculated', label: 'Recalculado', f: (r) => (r.recalculated == null ? unavailable('modelo sem preço') : fUsd(r.recalculated)) },
    { k: 'diffPct', label: 'Diferença', f: (r) => (r.diffPct == null ? '—' : (r.diffPct >= 0 ? '+' : '') + r.diffPct.toFixed(1).replace('.', ',') + '%') },
    { k: 'status', label: 'Estado', l: 1, f: (r) => recTag(r.status) },
  ];
  const ratio = rc.reported && rc.recalculated ? rc.recalculated / rc.reported : null;
  return '<p class="sub"><b>Três coisas diferentes, nunca somadas:</b> custo equivalente de API (estimativa por tokens × tabela) · valor pago no plano (informado por você) · limite de uso da assinatura (percentual lido da status line).</p>'
    + (sum.budgetExceeded ? '<div class="banner bad">' + ico('alert') + ' Orçamento mensal excedido: equivalente do mês ' + fUsd2(sum.monthCost) + ' > ' + fUsd2(st.budget) + '.</div>' : '')
    + '<div class="mcards">'
    + card('Equivalente de API (período)', 'coins', sum.total.cost == null ? unavailable('sem preço') : fUsd2(sum.total.cost), (sum.total.unpriced ? sum.total.unpriced + ' requisição(ões) sem preço · ' : '') + 'estimativa — não é fatura')
    + card('Mensalidade do plano', 'flag', st.monthlyFee == null ? '<span class="na">não informada</span>' : (st.currency || 'USD') + ' ' + Number(st.monthlyFee).toFixed(2), (st.plan ? esc(st.plan) + ' · ' : '') + 'entrada manual (Configurações)')
    + card('Equivalente no mês', 'trend', fUsd2(sum.monthCost || 0), st.budget != null ? 'orçamento ' + fUsd2(st.budget) : 'sem orçamento configurado', sum.budgetExceeded ? 'warnc' : '')
    + card('Reconciliação', 'shield', rc.counts.validated + ' / ' + rc.counts.divergent + ' / ' + rc.counts.insufficient_data, 'validadas / divergentes / sem dados')
    + card('Recalculado ÷ reportado', 'sliders', ratio == null ? unavailable('sem sessões com cost-state') : ratio.toFixed(2).replace('.', ',') + '×', 'em ' + rc.sessions + ' sessão(ões) com custo reportado')
    + '</div>'
    + (ratio && Math.abs(ratio - 1) > 0.05 ? '<div class="banner warn">' + ico('alert') + ' A tabela de preços local diverge do custo que o próprio Claude Code reporta (' + ratio.toFixed(2).replace('.', ',') + '×). Os tokens batem; a diferença está nos preços. Ajuste em <b>Preços</b> — a mudança cria uma nova versão e não reescreve o histórico.</div>' : '')
    + '<div class="grid-main"><div class="card"><div class="card-h"><b>Série diária</b><div class="seg">' + [['cost', 'Custo'], ['tokens', 'Tokens'], ['sessions', 'Sessões']].map(([k, l]) => '<button data-v-cchart="' + k + '" class="' + (metric === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' + areaChart(pts, fmt) + '</div>'
    + '<div class="card"><div class="card-h"><b>Limites da assinatura</b></div>' + (sub === undefined ? LOADING : isErr(sub) ? errBox(sub) : limitBar('Janela de 5 horas', sub['5h']) + limitBar('Janela de 7 dias', sub['7d'])) + '</div></div>'
    + '<div class="grid2"><div class="card"><div class="card-h"><b>Por modelo</b></div><table><thead><tr><th class="l nf">Modelo</th><th class="nf">Requisições</th><th class="nf">Custo equiv.</th></tr></thead><tbody>' + sum.byModel.map((m) => '<tr><td class="l">' + esc(m.model) + '</td><td>' + m.n.toLocaleString('pt-BR') + '</td><td>' + (m.cost == null ? unavailable('sem preço') : fUsd(m.cost)) + '</td></tr>').join('') + '</tbody></table></div>'
    + '<div class="card"><div class="card-h"><b>Por agente</b></div><table><thead><tr><th class="l nf">Agente</th><th class="nf">Requisições</th><th class="nf">Custo equiv.</th></tr></thead><tbody>' + sum.byAgent.slice(0, 8).map((a) => '<tr><td class="l">' + esc(a.agent) + '</td><td>' + a.n.toLocaleString('pt-BR') + '</td><td>' + (a.cost == null ? '—' : fUsd(a.cost)) + '</td></tr>').join('') + '</tbody></table></div></div>'
    + '<h3>Reconciliação por sessão</h3>'
    + (recRows === undefined ? LOADING : isErr(recRows) ? errBox(recRows) : table('v-rec', cols, recRows.map((r) => ({ ...r, _click: 'v-cost:' + r.id })), 'start_at', { fixed: false, size: 10 }))
    + '<h3>Histórico de tarifas (imutável)</h3><div class="card">' + sum.pricing.map((v) => '<div class="pvrow"><span class="mono">v' + v.id + '</span><span>vigente desde ' + (v.effective_from ? fDate(v.effective_from) : 'o início') + '</span><span class="note">' + v.prices.map((p) => esc(p.match) + ' $' + p.in + '/$' + p.out).join(' · ') + '</span></div>').join('') + '</div>';
}

// =============================== ASSUNTOS ===============================
function viewAssuntos() {
  const t = need('topics|' + rkey(), 'topics:list', range());
  if (t === undefined) return LOADING;
  if (isErr(t)) return errBox(t);
  const total = t.tagged.reduce((a, x) => a + (x.cost || 0), 0) || 1;
  const cols = [
    { k: 'tag', label: 'Assunto', l: 1, cls: 'name' },
    { k: 'sessions', label: 'Sessões' }, { k: 'requests', label: 'Requisições' },
    { k: 'cost', label: 'Custo equiv.', f: (r) => fUsd(r.cost || 0) + '<span class="meter"><i style="width:' + ((r.cost || 0) / total) * 100 + '%"></i></span>' },
  ];
  return '<p class="sub">Assuntos são <b>etiquetas manuais</b> que você coloca no cabeçalho de cada sessão. Classificar automaticamente exigiria ler o texto dos prompts — por privacidade isso não é feito sem autorização explícita.</p>'
    + '<div class="mcards">' + card('Sessões com assunto', 'tagI', String(t.tagged.reduce((a, x) => a + x.sessions, 0)), t.all.length + ' assunto(s) distinto(s)') + card('Sem assunto', 'flag', String(t.untagged), 'abra a sessão para etiquetar') + '</div>'
    + table('v-topics', cols, t.tagged, 'cost', { empty: 'Nenhuma sessão etiquetada ainda.' });
}

// =============================== CONFIGURAÇÕES ===============================
function viewConfig() {
  const st = need('dbstatus', 'db:status');
  const cfg = need('settings', 'settings:get');
  if (st === undefined || cfg === undefined) return LOADING;
  if (isErr(st)) return errBox(st);
  if (isErr(cfg)) return errBox(cfg);
  const F = S.V.form || (S.V.form = JSON.parse(JSON.stringify(cfg)));
  const last = st.last || {};
  const srcRow = (label, state, cls, extra = '') => '<div class="srow"><b>' + label + '</b>' + tag(cls, state) + '<span class="note">' + extra + '</span></div>';
  const sl = st.statusline, ot = st.otel;
  const inp = (path, val, type = 'number', ph = '') => '<input data-v-cfg="' + path + '" type="' + type + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(ph) + '">';
  const rules = Object.entries(F.rules).map(([id, p]) => '<div class="rrow"><span class="mono">' + id + '</span>' + Object.entries(p).map(([k, v]) => '<label>' + k + inp('rules.' + id + '.' + k, v) + '</label>').join('') + '</div>').join('');
  const confirm = (key, label, cls = '') => '<button class="btn ' + cls + '" data-v-act="' + key + '">' + (S.V.confirm === key ? 'Confirmar: ' + label : label) + '</button>';
  return (S.V.msg ? '<div class="banner ok">' + esc(S.V.msg) + '</div>' : '')
    + '<div class="grid2"><div class="card"><div class="card-h"><b>Fontes de dados</b>' + confirm('ingest', 'Coletar agora') + '</div>'
    + srcRow('Transcritos locais', 'ativo', 'ok', (st.ingestion.files.n || 0) + ' arquivos · última leitura ' + fDate(st.ingestion.files.last) + (last.ms != null ? ' · ' + last.ms + ' ms' : '') + (st.ingestion.files.errors ? ' · ' + st.ingestion.files.errors + ' com erro' : ''))
    + srcRow('Status line (limites do plano)', sl.installed ? 'coletando' : 'desligado', sl.installed ? 'ok' : '', sl.installed ? sl.snapshots + ' snapshot(s)' + (sl.hasLimits ? '' : ' · sem campo rate_limits até agora') : sl.hasCustom ? 'você tem status line própria — ela será preservada' : '')
    + srcRow('OpenTelemetry local', ot.enabled ? (ot.listening ? 'recebendo em 127.0.0.1:4318' : 'ativado, receptor parado') : 'desligado', ot.enabled && ot.listening ? 'ok' : ot.enabled ? 'warn' : '', ot.conflict ? 'já existe outro endpoint: ' + esc(ot.conflict) : 'opt-in · só enquanto o app está aberto')
    + srcRow('Hooks', 'não usado', '', 'transcritos + status line + OTel cobrem os eventos desta versão')
    + (st.ingestion.errors.length ? '<pre class="out">' + esc(st.ingestion.errors.map((e) => e.source_id.split(/[\\/]/).slice(-2).join('/') + ': ' + e.error).join('\n')) + '</pre>' : '')
    + '</div>'
    + '<div class="card"><div class="card-h"><b>Coletores opcionais</b></div>'
    + '<p class="note" style="margin-top:0"><b>Status line:</b> instala um wrapper transparente que lê o JSON do Claude Code, grava só <span class="mono">rate_limits</span> e repassa tudo ao seu comando atual' + (sl.current && sl.current.command && !sl.installed ? ' (<span class="mono">' + esc(sl.current.command.slice(0, 60)) + (sl.current.command.length > 60 ? '…' : '') + '</span>)' : '') + ', que continua funcionando igual. Backup do settings.json antes; remover restaura o original.</p>'
    + (sl.installed ? confirm('sl-off', 'Remover wrapper', 'danger') : confirm('sl-on', 'Instalar wrapper da status line', 'primary'))
    + '<p class="note"><b>OpenTelemetry:</b> adiciona ao <span class="mono">env</span> do settings.json as variáveis que enviam métricas/logs para este app (127.0.0.1:4318, http/json). Prompts não são enviados (padrão do Claude Code). Vale para sessões novas.</p>'
    + (ot.enabled ? confirm('otel-off', 'Desativar OpenTelemetry', 'danger') : confirm('otel-on', 'Ativar OpenTelemetry local', 'primary'))
    + '</div></div>'
    + '<div class="grid2"><div class="card"><div class="card-h"><b>Custos e plano</b></div><div class="cform">'
    + '<label>Plano' + inp('costs.plan', F.costs.plan, 'text', 'ex.: Max 5x') + '</label><label>Mensalidade' + inp('costs.monthlyFee', F.costs.monthlyFee, 'number', 'informada por você') + '</label>'
    + '<label>Moeda' + inp('costs.currency', F.costs.currency, 'text') + '</label><label>Orçamento mensal (equivalente USD)' + inp('costs.budget', F.costs.budget, 'number', 'sem orçamento') + '</label>'
    + '<label>Tolerância da reconciliação (%)' + inp('costs.tolerancePct', F.costs.tolerancePct) + '</label></div>'
    + '<div class="note">Vermelho só aparece quando o orçamento configurado é excedido — aumento de uso, sozinho, não é ruim.</div></div>'
    + '<div class="card"><div class="card-h"><b>Privacidade e retenção</b></div><div class="cform"><label>Reter dados por (dias)' + inp('privacy.retentionDays', F.privacy.retentionDays, 'number', 'sem limite') + '</label></div>'
    + '<div class="note">Nunca armazenado: texto de prompts, respostas, parâmetros e saídas de ferramentas. Exclusões não apagam os transcritos do Claude Code e impedem a reimportação.</div>'
    + (cfg.excluded ? '<div class="srow"><span>' + cfg.excluded + ' sessão(ões) excluída(s)</span>' + confirm('restore', 'Reimportar excluídas') + '</div>' : '')
    + '<div class="srow"><select data-v-delproj><option value="">Excluir dados de um projeto…</option>' + [...document.querySelectorAll('#project option')].filter((o) => o.value).map((o) => '<option value="' + esc(o.value) + '"' + (S.V.delproj === o.value ? ' selected' : '') + '>' + esc(o.textContent) + '</option>').join('') + '</select>' + (S.V.delproj ? confirm('delproj', 'Excluir', 'danger') : '') + '</div>'
    + '<div class="isec">Registro de permissões</div>' + (F.privacy.consents.length ? F.privacy.consents.slice(0, 6).map((c) => '<div class="note">' + fDate(c.at) + ' · ' + esc(c.what) + ' · ' + (c.granted ? 'concedido' : 'revogado') + '</div>').join('') : '<div class="note">nenhuma ainda</div>') + '</div></div>'
    + '<div class="card"><div class="card-h"><b>Parâmetros das regras de diagnóstico</b></div>' + rules + '<div class="note">Ajuste com base nas suas sessões reais; salvar recalcula todos os diagnósticos.</div></div>'
    + '<div class="toolbar"><button class="btn primary" data-v-act="save">Salvar configurações</button><button class="btn" data-v-act="reset">Descartar alterações</button></div>';
}

// =============================== ALERTAS DA VISÃO GERAL ===============================
function v1Alerts() {
  const list = need('diag|all|' + rkey(), 'diagnostics:list', { filter: range() });
  const crit = Array.isArray(list) ? list.filter((f) => f.severity === 'crítico' && !['falso_positivo', 'ignorado'].includes(f.feedback)) : [];
  if (!crit.length) return '';
  return '<div class="banner bad clickable" data-v-gotab="diagnosticos">' + ico('alert') + ' <b>' + crit.length + ' achado(s) crítico(s)</b> nos diagnósticos — ' + esc(crit[0].title) + '. <u>Abrir diagnósticos</u></div>';
}

// =============================== EVENTOS ===============================
async function goEvidence(sid, evId) {
  S.tab = 'sessoes'; S.V.sid = sid; S.V.stab = 'timeline'; S.V.tl = { types: [], status: '', agent: '', q: '' };
  const d = await window.ledger.api('sessions:get', sid);
  if (d && !isErr(d)) S.V.tlTotal = Object.values(d.events || {}).reduce((a, b) => a + b, 0);
  const p = S.pg['v-tl'] || (S.pg['v-tl'] = { i: 0, size: 12, auto: true });
  S.V.hl = evId; S.V.sel = evId;
  // 1º render ajusta quantas linhas cabem; só então a página do evento é calculada com o tamanho final
  for (let k = 0; k < 2; k++) {
    const page = await window.ledger.api('sessions:eventPage', sid, evId, { size: p.size });
    if (page != null && !isErr(page)) p.i = page;
    render();
  }
  setTimeout(() => { const el = document.querySelector('[data-v-ev="' + evId + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 60);
}

function exportEvents(fmt) {
  (async () => {
    const all = [];
    for (let page = 0; ; page++) {
      const r = await window.ledger.api('sessions:timeline', S.V.sid, { ...tlFilters(), page, size: 500 });
      if (!r || isErr(r)) break;
      all.push(...r.items);
      if (page >= r.pages - 1) break;
    }
    let blob;
    if (fmt === 'json') blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    else {
      const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const lines = ['id,session_id,type,at,end_at,status,agent,source,source_event_id,payload'];
      for (const e of all) lines.push([e.id, e.session_id, e.type, new Date(e.at).toISOString(), e.end_at ? new Date(e.end_at).toISOString() : '', e.status || '', q(e.agent_name), e.source, q(e.source_event_id), q(JSON.stringify(e.payload))].join(','));
      blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'timeline-' + S.V.sid.slice(0, 8) + '.' + fmt; a.click();
  })();
}

function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {}; o[ks[ks.length - 1]] = v; }

document.getElementById('view').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-v-back],[data-v-stab],[data-v-ttype],[data-v-ev],[data-v-close],[data-v-goev],[data-v-fb],[data-v-recompute],[data-v-dfilter],[data-v-commit],[data-v-file],[data-v-closediff],[data-v-effg],[data-v-cchart],[data-v-act],[data-v-gotab],[data-v-export],[data-v-gofind],tr[data-click^="v-"]');
  if (!el) return;
  const d = el.dataset;
  if (el.matches('tr[data-click]')) {
    const [kind, id] = [d.click.slice(0, d.click.indexOf(':')), d.click.slice(d.click.indexOf(':') + 1)];
    S.tab = 'sessoes'; S.V.sid = id; S.V.sel = null; S.V.hl = null; S.V.diff = null;
    S.V.stab = kind === 'v-diag' ? 'diag' : kind === 'v-cost' ? 'costs' : 'timeline';
    if (S.pg['v-tl']) S.pg['v-tl'].i = 0;
    render(); return;
  }
  if ('vBack' in d) { S.V.sid = null; S.V.sel = null; S.V.hl = null; render(); return; }
  if (d.vStab) { S.V.stab = d.vStab; S.V.sel = null; render(); return; }
  if (d.vTtype) { const t = S.V.tl.types; const i = t.indexOf(d.vTtype); if (i >= 0) t.splice(i, 1); else t.push(d.vTtype); if (S.pg['v-tl']) S.pg['v-tl'].i = 0; render(); return; }
  if (d.vEv) { S.V.sel = S.V.sel === +d.vEv ? null : +d.vEv; render(); return; }
  if ('vClose' in d) { S.V.sel = null; render(); return; }
  if (d.vGoev) { const [sid, ev] = d.vGoev.split('|'); goEvidence(sid, +ev); return; }
  if (d.vGofind) { S.V.stab = 'diag'; S.V.sel = null; render(); return; }
  if (d.vFb) { const [id, v] = d.vFb.split('|'); await window.ledger.api('diagnostics:feedback', +id, v || null); drop('session|'); drop('diag|'); drop('sessions|'); render(); return; }
  if (d.vRecompute != null) { await window.ledger.api('diagnostics:recompute', d.vRecompute === '*' ? { force: true } : d.vRecompute ? { sessionId: d.vRecompute } : { force: true }); drop(); render(); return; }
  if (d.vDfilter) { S.V.diagFilter = S.V.diagFilter === d.vDfilter ? '' : d.vDfilter; render(); return; }
  if (d.vCommit) { S.V.diff = S.V.diff && S.V.diff.id === d.vCommit ? null : { kind: 'commit', id: d.vCommit }; render(); return; }
  if (d.vFile) { S.V.diff = S.V.diff && S.V.diff.id === d.vFile ? null : { kind: 'file', id: d.vFile }; render(); return; }
  if ('vClosediff' in d) { S.V.diff = null; render(); return; }
  if (d.vEffg) { S.V.eff = d.vEffg; render(); return; }
  if (d.vCchart) { S.V.costChart = d.vCchart; render(); return; }
  if (d.vGotab) { S.tab = d.vGotab; render(); return; }
  if (d.vExport) { exportEvents(d.vExport); return; }
  if (d.vAct) {
    const a = d.vAct;
    const needsConfirm = ['sl-on', 'sl-off', 'otel-on', 'otel-off', 'delproj', 'restore'];
    if (needsConfirm.includes(a) && S.V.confirm !== a) { S.V.confirm = a; render(); return; }
    S.V.confirm = '';
    let r;
    if (a === 'ingest') { S.V.msg = 'Coletando…'; render(); r = await window.ledger.api('db:ingest'); S.V.msg = r && !r.error ? `Coleta concluída: ${r.changed || 0} arquivo(s) com novidade, ${r.lines || 0} linha(s).` : 'Falha na coleta: ' + ((r && (r.error || r.__error)) || ''); }
    else if (a === 'sl-on') { r = await window.ledger.api('statusline:install'); S.V.msg = isErr(r) ? 'Erro: ' + r.__error : 'Wrapper instalado. Sua status line continua igual; vale para sessões novas. Backup: ' + (r.backup || '—'); }
    else if (a === 'sl-off') { r = await window.ledger.api('statusline:uninstall'); S.V.msg = isErr(r) ? 'Erro: ' + r.__error : 'Status line original restaurada.'; }
    else if (a === 'otel-on' || a === 'otel-off') { r = await window.ledger.api('otel:set', a === 'otel-on'); S.V.msg = isErr(r) ? 'Erro: ' + r.__error : r.error ? 'Variáveis gravadas, mas o receptor não subiu: ' + r.error : a === 'otel-on' ? 'OpenTelemetry ativado. Abra uma sessão nova do Claude Code.' : 'OpenTelemetry desativado.'; }
    else if (a === 'restore') { r = await window.ledger.api('admin:restore'); S.V.msg = 'Sessões excluídas serão reimportadas.'; }
    else if (a === 'delproj') { r = await window.ledger.api('admin:deleteProject', S.V.delproj); S.V.msg = isErr(r) ? 'Erro: ' + r.__error : r.sessions + ' sessão(ões) do projeto excluída(s).'; S.V.delproj = ''; }
    else if (a === 'save') { r = await window.ledger.api('settings:set', S.V.form); S.V.msg = isErr(r) ? 'Erro: ' + r.__error : 'Configurações salvas.'; S.V.form = null; }
    else if (a === 'reset') { S.V.form = null; S.V.msg = ''; }
    drop(); render(); return;
  }
});
document.getElementById('view').addEventListener('change', async (e) => {
  const d = e.target.dataset;
  if (d.vTstatus != null) { S.V.tl.status = e.target.value; if (S.pg['v-tl']) S.pg['v-tl'].i = 0; render(); }
  else if (d.vTagent != null) { S.V.tl.agent = e.target.value; if (S.pg['v-tl']) S.pg['v-tl'].i = 0; render(); }
  else if (d.vOutcome) { await window.ledger.api('outcome:set', d.vOutcome, e.target.value || null); drop('session|'); drop('eff|'); render(); }
  else if (d.vTags) { await window.ledger.api('tags:set', d.vTags, e.target.value.split(',')); drop('session|'); drop('topics'); render(); }
  else if (d.vDelproj != null) { S.V.delproj = e.target.value; S.V.confirm = ''; render(); }
  else if (d.vCfg) { setPath(S.V.form, d.vCfg, e.target.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value); }
});
let tqT;
document.getElementById('view').addEventListener('input', (e) => {
  if (e.target.dataset.vTq == null) return;
  S.V.tl.q = e.target.value; if (S.pg['v-tl']) S.pg['v-tl'].i = 0;
  clearTimeout(tqT);
  tqT = setTimeout(() => { const pos = e.target.selectionStart; render(); const n = document.querySelector('[data-v-tq]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250);
});

// dados novos no banco: invalida cache e atualiza a tela atual + indicador de coleta
window.ledger.onDbUpdated((r) => {
  drop();
  const live = document.getElementById('livemsg');
  if (live && r && !r.error) { live.textContent = 'Coleta ativa · atualizado ' + fTime(r.at || Date.now()); live.parentElement.classList.remove('off'); }
  else if (live && r && r.error) { live.textContent = 'Coleta com erro'; live.parentElement.classList.add('off'); }
  if (['sessoes', 'diagnosticos', 'eficiencia', 'custos', 'assuntos', 'config', 'geral'].includes(S.tab) && !document.querySelector('#colmenu.on')) render();
});
