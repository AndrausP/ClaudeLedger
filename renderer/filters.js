'use strict';
/* global S, $, esc, ico, render, TABS, dayKey */
// Módulo único de filtros (spec 1): período (inclui personalizado), projeto, agente, modelo e busca textual.
// - FX() devolve o filtro canônico usado por TODAS as telas (banco e parser)
// - filtros ativos viram etiquetas removíveis; tudo persiste na URL (compartilhável)

S.cFrom = S.cFrom || ''; // personalizado: 'AAAA-MM-DD'
S.cTo = S.cTo || '';
S.q = S.q || '';
S.FO = null; // opções vindas do banco

const minuteNow = () => Math.floor(Date.now() / 60000) * 60000; // estável entre renders (chave de cache)
const custom = () => S.period === 0 && (S.cFrom || S.cTo);

// filtro canônico
function FX() {
  let from, to;
  if (custom()) {
    from = S.cFrom ? new Date(S.cFrom + 'T00:00:00').getTime() : undefined;
    to = S.cTo ? new Date(S.cTo + 'T23:59:59.999').getTime() : undefined;
  } else if (S.period) from = minuteNow() - S.period * 864e5;
  return { from, to, project: S.project || undefined, agent: S.agent || undefined, model: S.model || undefined };
}

// --- substituem as versões do app.js (telas que leem do parser) para usar o MESMO filtro
function filtered() {
  const f = FX();
  return S.D.records.filter((r) => (f.from == null || r.t >= f.from) && (f.to == null || r.t <= f.to)
    && (!f.project || r.p === f.project) && (!f.model || r.m === f.model) && (!f.agent || r.a === f.agent));
}
// período anterior de mesmo tamanho (variação dos cards)
function previous() {
  const f = FX();
  if (f.from == null) return null;
  const end = f.to != null ? f.to : Date.now(), len = end - f.from;
  const from = f.from - len, to = f.from;
  if (Math.min(...S.D.records.map((r) => r.t)) > from) return null; // histórico não cobre a janela anterior
  return S.D.records.filter((r) => r.t >= from && r.t < to && (!f.project || r.p === f.project) && (!f.model || r.m === f.model) && (!f.agent || r.a === f.agent));
}

// --- URL
function saveHash() {
  const q = new URLSearchParams();
  if (S.period !== 30) q.set('dias', S.period);
  if (custom()) { if (S.cFrom) q.set('de', S.cFrom); if (S.cTo) q.set('ate', S.cTo); }
  if (S.project) q.set('projeto', S.project);
  if (S.model) q.set('modelo', S.model);
  if (S.agent) q.set('agente', S.agent);
  if (S.q) q.set('busca', S.q);
  if (S.tab === 'sessoes' && S.V && S.V.sid) { q.set('sessao', S.V.sid); q.set('aba', S.V.stab); }
  if (S.tab === 'agentes' && S.A && S.A.name) q.set('detalhe', S.A.name);
  if (S.tab === 'audit' && S.AU) q.set('sub', S.AU.sub);
  const h = '#/' + S.tab + (q.toString() ? '?' + q : '');
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const m = /^#\/([\w-]+)(?:\?(.*))?$/.exec(location.hash || '');
  if (!m) return;
  let tab = m[1];
  const q = new URLSearchParams(m[2] || '');
  if (tab === 'add') { tab = 'explore'; S.X.src = 'link'; } // aba antiga, agora dentro de Explorar
  if (TABS.some((t) => t[0] === tab)) S.tab = tab;
  if (q.has('dias')) S.period = +q.get('dias');
  S.cFrom = q.get('de') || ''; S.cTo = q.get('ate') || '';
  S.project = q.get('projeto') || ''; S.model = q.get('modelo') || ''; S.agent = q.get('agente') || ''; S.q = q.get('busca') || '';
  if (q.has('sessao') && S.V) { S.V.sid = q.get('sessao'); S.V.stab = q.get('aba') || 'timeline'; }
  if (q.has('detalhe') && S.A) S.A.name = q.get('detalhe');
  if (q.has('sub') && S.AU) S.AU.sub = q.get('sub');
  renderFilterBar();
}

// --- barra de filtros
const FILTER_OFF = ['perfis', 'precos', 'config', 'explore'];
const PERIODS = [[1, 'Hoje'], [7, 'Últimos 7 dias'], [30, 'Últimos 30 dias'], [90, 'Últimos 90 dias'], [0, 'Todo o histórico'], ['c', 'Personalizado…']];

function chipList() {
  const o = S.FO || { projects: [], agents: [], models: [] };
  const out = [];
  if (custom()) out.push(['periodo', 'Período', (S.cFrom ? S.cFrom.split('-').reverse().join('/') : '…') + ' → ' + (S.cTo ? S.cTo.split('-').reverse().join('/') : 'hoje')]);
  else if (S.period !== 30) out.push(['periodo', 'Período', (PERIODS.find((p) => p[0] === S.period) || [0, ''])[1]]);
  if (S.project) out.push(['project', 'Projeto', (o.projects.find((p) => p.id === S.project) || { name: S.project }).name]);
  if (S.agent) out.push(['agent', 'Agente', S.agent]);
  if (S.model) out.push(['model', 'Modelo', S.model]);
  if (S.q) out.push(['q', 'Busca', '“' + S.q + '”']);
  return out;
}

function renderFilterBar() {
  const el = document.getElementById('fmod');
  if (!el) return;
  const off = FILTER_OFF.includes(S.tab);
  el.hidden = off;
  if (off) return;
  const o = S.FO || { projects: [], agents: [], models: [] };
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const isCustom = S.period === 0 && (S.cFrom || S.cTo || S.fcOpen);
  const chips = chipList();
  const html = '<div class="frow1">'
    + '<label class="fctl">' + ico('calendar') + '<select data-f="period" aria-label="Período">' + PERIODS.map(([v, l]) => opt(v, l, isCustom ? 'c' : S.period)).join('') + '</select></label>'
    + (isCustom ? '<span class="fdates"><input type="date" data-f="cFrom" value="' + esc(S.cFrom) + '" aria-label="De"><span>→</span><input type="date" data-f="cTo" value="' + esc(S.cTo) + '" aria-label="Até"></span>' : '')
    + '<label class="fctl">' + ico('folder') + '<select data-f="project" aria-label="Projeto">' + opt('', 'Todos os projetos', S.project) + o.projects.map((p) => opt(p.id, p.name + ' (' + p.sessions + ')', S.project)).join('') + '</select></label>'
    + '<label class="fctl">' + ico('bot') + '<select data-f="agent" aria-label="Agente">' + opt('', 'Todos os agentes', S.agent) + o.agents.map((a) => opt(a.name, (a.kind === 'subagent' ? '↳ ' : '') + a.name, S.agent)).join('') + '</select></label>'
    + '<label class="fctl">' + ico('layers') + '<select data-f="model" aria-label="Modelo">' + opt('', 'Todos os modelos', S.model) + o.models.map((m) => opt(m.model, m.model, S.model)).join('') + '</select></label>'
    + '<label class="fctl fsearch">' + ico('search') + '<input data-f="q" placeholder="Buscar nas tabelas…" value="' + esc(S.q) + '" spellcheck="false" aria-label="Busca"></label>'
    + '</div>'
    + (chips.length ? '<div class="frow2">' + ico('filter') + chips.map(([k, l, v]) => '<span class="chip"><b>' + esc(l) + '</b> ' + esc(v) + '<button data-fclear="' + k + '" aria-label="Remover filtro ' + esc(l) + '">' + ico('x') + '</button></span>').join('') + '<button class="linkbtn" data-fclear="*">Limpar tudo</button><span class="fhint">vale para todas as telas</span></div>' : '');
  if (el._sig === html) return; // nada mudou: não recria (mantém o foco na busca)
  el._sig = html;
  el.innerHTML = html;
}

async function loadFilterOptions() {
  try { const r = await window.ledger.api('filters:options'); if (r && !r.__error) { S.FO = r; renderFilterBar(); } } catch { /* sem banco ainda */ }
}

function applyFilterChange() {
  for (const k of Object.keys(S.pg || {})) S.pg[k].i = 0; // filtro novo → primeira página
  if (S.V) { S.V.cache = {}; S.V.pending = {}; }
  if (S.W) { S.W.cache = {}; S.W.pending = {}; }
  renderFilterBar();
  render();
}

document.getElementById('fmod').addEventListener('change', (e) => {
  const k = e.target.dataset.f;
  if (!k || k === 'q') return;
  const v = e.target.value;
  if (k === 'period') {
    if (v === 'c') { S.period = 0; S.fcOpen = true; if (!S.cFrom) S.cFrom = dayKey(Date.now() - 6 * 864e5); if (!S.cTo) S.cTo = dayKey(Date.now()); }
    else { S.period = +v; S.cFrom = ''; S.cTo = ''; S.fcOpen = false; }
  } else if (k === 'cFrom' || k === 'cTo') S[k] = v;
  else S[k] = v;
  if (k === 'project') { const p = document.getElementById('project'); if (p) p.value = v; }
  applyFilterChange();
});
let fqT;
document.getElementById('fmod').addEventListener('input', (e) => {
  if (e.target.dataset.f !== 'q') return;
  S.q = e.target.value;
  clearTimeout(fqT);
  fqT = setTimeout(() => { const pos = e.target.selectionStart; applyFilterChange(); const n = document.querySelector('[data-f="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250);
});
document.getElementById('fmod').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fclear]');
  if (!b) return;
  const k = b.dataset.fclear;
  if (k === '*' || k === 'periodo') { S.period = 30; S.cFrom = ''; S.cTo = ''; S.fcOpen = false; }
  if (k === '*') { S.project = ''; S.agent = ''; S.model = ''; S.q = ''; }
  else if (k !== 'periodo') S[k] = '';
  applyFilterChange();
});
window.ledger.onDbUpdated(() => loadFilterOptions());
loadFilterOptions();
