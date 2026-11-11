'use strict';
// ---------- estado ----------
const S = {
  D: null, tab: 'geral', sub: 'plugins', sort: {}, session: '', search: '',
  pg: {}, // paginação por tabela: { id: { i: página, size, auto } }
  flt: {}, // filtros por coluna: { tabela: { coluna: filtro } }
  tables: {}, // última renderização de cada tabela (colunas, linhas, filtradas) — usada pelo menu de coluna e CSV
  period: 30, project: '', model: '', agent: '', chart: 'cost', donut: 'tok',
  X: { src: 'plugins', q: '', reviewed: false, sort: 'installs', plugins: null, mcp: null, mcpQ: null, com: null, cfg: null, busy: '', open: '', msg: '' },
  L: { input: '', busy: '', res: null, error: '', log: [], ack: false, assist: null, sel: new Set(), confirm: '' }, installs: [],
};
// ícones (traço, 24x24)
const ICON = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v1M15 13v1M2 13v3M22 13v3"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  puzzle: '<path d="M9 4h4v3a2 2 0 1 0 4 0V4h3v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V4h5Z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  coins: '<ellipse cx="10" cy="6" rx="7" ry="3"/><path d="M3 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M3 11v5c0 1.7 3.1 3 7 3 1.4 0 2.7-.2 3.8-.5"/><circle cx="18" cy="17" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z"/>',
  sortUp: '<path d="M8 19V5M4 9l4-4 4 4M14 7h6M14 12h4M14 17h2"/>',
  sortDown: '<path d="M8 5v14M4 15l4 4 4-4M14 7h2M14 12h4M14 17h6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevLL: '<path d="m17 18-6-6 6-6M11 18l-6-6 6-6"/>',
  chevRR: '<path d="m7 18 6-6-6-6M13 18l6-6-6-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
const ico = (k, cls = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICON[k]}</svg>`;
// [id, rótulo do menu, ícone, subtítulo do cabeçalho]
const TABS = [
  ['geral', 'Visão Geral', 'home', 'Resumo de uso, custo e desempenho dos agentes no Claude Code.', 'Análise'],
  ['sessoes', 'Sessões', 'chat', 'Cada conversa com timeline, diagnóstico, mudanças de código e custos.', 'Análise'],
  ['diagnosticos', 'Diagnósticos', 'shield', 'Padrões potencialmente ineficientes, com evidência clicável.', 'Análise'],
  ['eficiencia', 'Eficiência', 'trend', 'Resultado das tarefas × custo e tempo — sem rankings injustos.', 'Análise'],
  ['agentes', 'Agentes', 'bot', 'Quem gastou os tokens: sessão principal e cada subagente.', 'Análise'],
  ['modelos', 'Modelos', 'layers', 'Uso e composição do custo por modelo.', 'Análise'],
  ['assuntos', 'Assuntos', 'tagI', 'Custo por assunto, a partir das etiquetas que você coloca nas sessões.', 'Análise'],
  ['custos', 'Custos e assinatura', 'coins', 'Equivalente de API, mensalidade e limites do plano — sempre separados.', 'Análise'],
  ['audit', 'Auditoria', 'search', 'Resposta a resposta, para conferir os números.', 'Análise'],
  ['ext', 'Extensões', 'puzzle', 'Plugins, skills e MCP: instalado × usado de verdade.', 'Extensões'],
  ['explore', 'Explorar e instalar', 'search', 'Busque no diretório oficial, no GitHub, no registry de MCP e na comunidade — ou cole um link — e instale após análise em quarentena.', 'Extensões'],
  ['orchestra', 'Orchestra', 'orchestra', 'Gestão da extensão Orchestra Core: agentes, aderência ao catálogo, tarefas e relatório.', 'Extensões'],
  ['perfis', 'Perfis', 'gear', 'Configuração que toda sessão nova do Claude Code segue.', 'Configuração'],
  ['precos', 'Preços', 'sliders', 'Tabela de preços usada nas estimativas (versionada).', 'Configuração'],
  ['config', 'Configurações', 'gear', 'Fontes de dados, coletores opcionais, plano, privacidade e regras.', 'Configuração'],
];
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
const $ = (s) => document.querySelector(s);

// ---------- utilidades ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fTok = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const fUsd = (n) => (n >= 100 ? '$' + n.toFixed(0) : n >= 1 ? '$' + n.toFixed(2) : '$' + n.toFixed(3));
const fPct = (n) => (n * 100).toFixed(1) + '%';
const fDate = (t) => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const projName = (p) => { const m = p.replace(/^[A-Za-z]--/, '').split('-').filter(Boolean); return m.slice(-2).join('-') || p; };
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const tokens = (r) => r.i + r.o + r.cr + r.w5 + r.w1;

// ---------- custo ----------
function priceFor(model) { return S.D.pricing.find((p) => model.includes(p.match)); }
function costParts(r) {
  const p = priceFor(r.m);
  if (!p) return null;
  const inn = p.in / 1e6;
  return { in: r.i * inn, out: r.o * (p.out / 1e6), cr: r.cr * inn * 0.1, cw: (r.w5 * 1.25 + r.w1 * 2) * inn };
}
function priceAll() {
  S.unpriced = new Set();
  for (const r of S.D.records) {
    const c = costParts(r);
    if (!c) { r.$ = 0; r.cp = { in: 0, out: 0, cr: 0, cw: 0 }; S.unpriced.add(r.m); } else { r.cp = c; r.$ = c.in + c.out + c.cr + c.cw; }
  }
}

// ---------- filtro ----------
const match = (r) => (!S.project || r.p === S.project) && (!S.model || r.m === S.model) && (!S.agent || r.a === S.agent);
function filtered() {
  const since = S.period ? Date.now() - S.period * 864e5 : 0;
  return S.D.records.filter((r) => r.t >= since && match(r));
}
// mesmo tamanho de janela, imediatamente antes — base das variações nos cards
function previous() {
  if (!S.period) return null;
  const to = Date.now() - S.period * 864e5, from = to - S.period * 864e5;
  if (Math.min(...S.D.records.map((r) => r.t)) > from) return null; // histórico não cobre a janela anterior
  return S.D.records.filter((r) => r.t >= from && r.t < to && match(r));
}

// ---------- agregação ----------
function group(rs, keyFn) {
  const m = new Map();
  for (const r of rs) {
    const k = keyFn(r);
    let g = m.get(k);
    if (!g) m.set(k, (g = { k, n: 0, cost: 0, i: 0, o: 0, cr: 0, cw: 0, tok: 0, last: 0, models: new Set(), inv: new Set(), cp: { in: 0, out: 0, cr: 0, cw: 0 } }));
    g.n++; g.cost += r.$; g.i += r.i; g.o += r.o; g.cr += r.cr; g.cw += r.w5 + r.w1; g.tok += tokens(r);
    g.cp.in += r.cp.in; g.cp.out += r.cp.out; g.cp.cr += r.cp.cr; g.cp.cw += r.cp.cw;
    if (r.t > g.last) g.last = r.t;
    g.models.add(r.m);
    if (r.g) g.inv.add(r.g);
  }
  return [...m.values()];
}

// ---------- tabela genérica ----------
// ---------- paginação ----------
// size é calculado pelo espaço disponível (auto) até o usuário escolher um número fixo
const PAGE_SIZES = [10, 15, 25, 50, 100];
function pageOf(id, total, def = 15) {
  const p = S.pg[id] || (S.pg[id] = { i: 0, size: def, auto: true });
  const pages = Math.max(1, Math.ceil(total / p.size));
  if (p.i >= pages) p.i = pages - 1; // filtro reduziu o total: volta para a última página válida
  return { i: p.i, size: p.size, pages, auto: p.auto, from: total ? p.i * p.size : 0, to: Math.min(total, (p.i + 1) * p.size) };
}
// rodapé sempre presente (mesmo vazio) para nunca mudar de posição
function pager(id, total, def = 15) {
  const p = pageOf(id, total, def);
  const nums = new Set([0, p.pages - 1]);
  for (let k = p.i - 2; k <= p.i + 2; k++) if (k >= 0 && k < p.pages) nums.add(k);
  let pages = '', prev = -1;
  for (const k of [...nums].sort((x, y) => x - y)) {
    if (k - prev > 1) pages += '<span class="gap">…</span>';
    pages += '<button data-pg="' + id + '|' + k + '" class="' + (k === p.i ? 'on' : '') + '" aria-label="Página ' + (k + 1) + '"' + (k === p.i ? ' aria-current="page"' : '') + (total ? '' : ' disabled') + '>' + (k + 1) + '</button>';
    prev = k;
  }
  const nav = (k, icon, label, off) => '<button data-pg="' + id + '|' + k + '" aria-label="' + label + '" title="' + label + '"' + (off ? ' disabled' : '') + '>' + ico(icon) + '</button>';
  const info = total ? 'Mostrando <b>' + (p.from + 1).toLocaleString('pt-BR') + '–' + p.to.toLocaleString('pt-BR') + '</b> de <b>' + total.toLocaleString('pt-BR') + '</b>' : 'Nenhum resultado';
  return '<div class="pager"><div class="pinfo">' + info + '</div>'
    + '<div class="pages">' + nav(0, 'chevLL', 'Primeira página', p.i === 0) + nav(p.i - 1, 'chevL', 'Página anterior', p.i === 0) + pages + nav(p.i + 1, 'chevR', 'Próxima página', p.i >= p.pages - 1) + nav(p.pages - 1, 'chevRR', 'Última página', p.i >= p.pages - 1) + '</div>'
    + '<label class="psize">Linhas<select data-pgsize="' + id + '"><option value="auto"' + (p.auto ? ' selected' : '') + '>Auto (' + p.size + ')</option>' + PAGE_SIZES.map((n) => '<option value="' + n + '"' + (!p.auto && n === p.size ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label></div>';
}

// ---------- filtros por coluna ----------
// fv = valor para FILTRAR (ex.: texto da gravidade); v = valor para ORDENAR (ex.: peso numérico)
const sval = (c, r) => (c.v ? c.v(r) : r[c.k]);
const fval = (c, r) => (c.fv ? c.fv(r) : sval(c, r));
function colType(c, rows) {
  if (c.type) return c.type;
  const vals = rows.map((r) => fval(c, r)).filter((x) => x != null && x !== '');
  if (vals.length && vals.every((x) => typeof x === 'number')) return 'num';
  return new Set(vals.map(String)).size <= 15 ? 'cat' : 'text';
}
function passes(f, val) {
  if (f.type === 'cat') return f.vals.includes(String(val ?? ''));
  if (f.type === 'text') return String(val ?? '').toLowerCase().includes(f.q.toLowerCase());
  const n = +val;
  if (f.type === 'num') return (f.min == null || n >= f.min) && (f.max == null || n <= f.max);
  if (f.type === 'date') return (f.from == null || n >= f.from) && (f.to == null || n <= f.to);
  return true;
}
const fDateShort = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
function chipText(f) {
  if (f.type === 'cat') return f.vals.length <= 2 ? f.vals.map((v) => v || '(vazio)').join(', ') : f.vals.slice(0, 2).join(', ') + ' +' + (f.vals.length - 2);
  if (f.type === 'text') return 'contém “' + f.q + '”';
  if (f.type === 'num') return f.min != null && f.max != null ? f.min + ' – ' + f.max : f.min != null ? '≥ ' + f.min : '≤ ' + f.max;
  if (f.type === 'date') return (f.from != null ? fDateShort(f.from) : '…') + ' – ' + (f.to != null ? fDateShort(f.to) : '…');
  return '';
}

// tabela padrão: filtros por coluna, ordenação, painel de altura fixa e paginação estável
function table(id, cols, rows, def, opts = {}) {
  const fixed = opts.fixed !== false;
  const st = S.sort[id] || (S.sort[id] = { k: def, asc: !!opts.asc });
  const flt = S.flt[id] || {};
  const active = Object.entries(flt).filter(([k]) => cols.some((c) => c.k === k));
  if (S.q && !opts.noSearch) { const q = S.q.toLowerCase(); rows = rows.filter((r) => cols.some((c) => !c.nf && String(fval(c, r) ?? '').toLowerCase().includes(q))); }
  const filtered = active.length ? rows.filter((r) => active.every(([k, f]) => passes(f, fval(cols.find((c) => c.k === k), r)))) : rows;
  const col = cols.find((c) => c.k === st.k) || cols[0];
  const sorted = [...filtered].sort((x, y) => { const p = sval(col, x), q = sval(col, y); const c = typeof p === 'string' || typeof q === 'string' ? String(p ?? '').localeCompare(String(q ?? '')) : (p ?? 0) - (q ?? 0); return st.asc ? c : -c; });
  S.tables[id] = { cols, rows, filtered: sorted };
  const head = cols.map((c) => c.nf
    ? '<th class="' + (c.l ? 'l' : '') + ' nf">' + esc(c.label) + '</th>'
    : '<th data-t="' + id + '" data-k="' + c.k + '" tabindex="0" aria-haspopup="menu" class="' + (c.l ? 'l ' : '') + (c.k === st.k ? 'sorted' + (st.asc ? ' asc' : '') + ' ' : '') + (flt[c.k] ? 'filtered' : '') + '"><span class="thl">' + esc(c.label) + '</span>' + (flt[c.k] ? ico('filter', 'thf') : '') + '</th>').join('');
  const pg = pageOf(id, sorted.length, opts.size || 15);
  const body = sorted.slice(pg.from, pg.to).map((r) => '<tr' + (r._click ? ' class="click" data-click="' + esc(r._click) + '"' : '') + '>' + cols.map((c) => '<td class="' + (c.l ? 'l ' : '') + (c.k === 'name' || c.cls === 'name' ? 'name ' : '') + (c.mono ? 'mono' : '') + '">' + (c.f ? c.f(r) : esc(r[c.k] ?? '')) + '</td>').join('') + '</tr>').join('');
  const empty = '<tr class="emptyrow"><td colspan="' + cols.length + '">' + (active.length ? 'Nenhuma linha com estes filtros.' : esc(opts.empty || 'Sem dados no período.')) + '</td></tr>';
  const chips = active.length ? '<div class="fbar">' + ico('filter') + active.map(([k, f]) => '<span class="chip"><b>' + esc(cols.find((c) => c.k === k).label) + '</b> ' + esc(chipText(f)) + '<button data-fdel="' + id + '|' + k + '" aria-label="Remover filtro">' + ico('x') + '</button></span>').join('') + '<button class="linkbtn" data-fclr="' + id + '">Limpar filtros</button><span class="fcount">' + sorted.length.toLocaleString('pt-BR') + ' de ' + rows.length.toLocaleString('pt-BR') + '</span></div>' : '';
  return '<div class="card tcard' + (fixed ? ' fixed' : '') + '" data-pgid="' + id + '">' + chips + '<div class="tscroll"><table><thead><tr>' + head + '</tr></thead><tbody>' + (body || empty) + '</tbody></table></div>' + pager(id, sorted.length, opts.size || 15) + '</div>';
}

// lista de cartões (Explorar) no mesmo padrão de painel fixo + paginação
function plist(id, items, renderItem, emptyMsg) {
  const pg = pageOf(id, items.length, 6);
  return '<div class="card tcard fixed plistp" data-pgid="' + id + '"><div class="pbody">' + (items.slice(pg.from, pg.to).map(renderItem).join('') || '<div class="empty">' + emptyMsg + '</div>') + '</div>' + pager(id, items.length, 6) + '</div>';
}

// ajusta altura do painel ao espaço restante da janela e calcula linhas por página
// rerender=false: só aplica alturas (usado dentro do próprio render para não entrar em laço)
function fitPanels(rerender = true) {
  const main = $('#view');
  if (!main) return;
  let changed = false;
  const mtop = main.getBoundingClientRect().top;
  for (const el of main.querySelectorAll('.tcard.fixed')) {
    const top = el.getBoundingClientRect().top - mtop + main.scrollTop;
    const h = Math.max(340, main.clientHeight - top - 22);
    el.style.height = h + 'px';
    const p = S.pg[el.dataset.pgid];
    if (!p || !p.auto) continue;
    const bodyEl = el.querySelector('.tscroll, .pbody');
    const other = [...el.children].filter((c) => c !== bodyEl).reduce((s, c) => s + c.offsetHeight, 0);
    const thead = el.querySelector('thead');
    const item = el.querySelector('tbody tr:not(.emptyrow), .pbody > .xitem:not(.open), .pbody > .tev');
    const rowH = item ? item.offsetHeight + (item.tagName === 'TR' || item.classList.contains('tev') ? 0 : 8) : (el.classList.contains('plistp') ? 120 : el.classList.contains('tlpanel') ? 42 : 53);
    const n = Math.max(3, Math.floor((h - other - (thead ? thead.offsetHeight : 0) - 4) / rowH));
    if (n !== p.size) { const first = p.i * p.size; p.size = n; p.i = Math.floor(first / n); changed = true; }
  }
  if (changed && rerender) render(true);
}
let fitT;
window.addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitPanels, 120); closeColMenu(); });

// ---------- menu da coluna: ordenar + filtrar ----------
const cmEl = document.createElement('div');
cmEl.id = 'colmenu'; cmEl.setAttribute('role', 'menu');
document.body.appendChild(cmEl);
function closeColMenu() { cmEl.classList.remove('on'); S.cm = null; }
function openColMenu(th) {
  const id = th.dataset.t, k = th.dataset.k, T = S.tables[id];
  if (!T) return;
  const c = T.cols.find((x) => x.k === k), type = colType(c, T.rows), cur = (S.flt[id] || {})[k], st = S.sort[id];
  S.cm = { id, k, type };
  let f = '';
  if (type === 'cat') {
    const counts = new Map();
    for (const r of T.rows) { const v = String(fval(c, r) ?? ''); counts.set(v, (counts.get(v) || 0) + 1); }
    const vals = [...counts].sort((x, y) => y[1] - x[1]);
    f = '<input class="cm-search" placeholder="Buscar valor…" spellcheck="false"><div class="cm-list">' + vals.map(([v, n]) => '<label class="cm-opt" data-v="' + esc(v.toLowerCase()) + '"><input type="checkbox" value="' + esc(v) + '"' + (!cur || cur.vals.includes(v) ? ' checked' : '') + '><span>' + esc(v || '(vazio)') + '</span><em>' + n.toLocaleString('pt-BR') + '</em></label>').join('') + '</div><div class="cm-mini"><button data-cmall>Marcar todos</button><button data-cmnone>Desmarcar</button></div>';
  } else if (type === 'text') {
    f = '<input class="cm-q" placeholder="Contém…" value="' + esc(cur ? cur.q : '') + '" spellcheck="false">';
  } else if (type === 'num') {
    const ns = T.rows.map((r) => +fval(c, r)).filter((n) => !isNaN(n));
    const lo = ns.length ? Math.min(...ns) : 0, hi = ns.length ? Math.max(...ns) : 0;
    f = '<div class="cm-range"><input type="number" step="any" class="cm-min" placeholder="mín ' + +lo.toFixed(4) + '" value="' + (cur && cur.min != null ? cur.min : '') + '"><span>–</span><input type="number" step="any" class="cm-max" placeholder="máx ' + +hi.toFixed(4) + '" value="' + (cur && cur.max != null ? cur.max : '') + '"></div>';
  } else if (type === 'date') {
    const iso = (t) => (t != null ? new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '');
    f = '<div class="cm-range"><input type="date" class="cm-from" value="' + iso(cur && cur.from) + '"><span>–</span><input type="date" class="cm-to" value="' + iso(cur && cur.to) + '"></div>';
  }
  const asc = st && st.k === k && st.asc, desc = st && st.k === k && !st.asc;
  const kindLbl = { cat: 'lista', text: 'texto', num: 'número', date: 'data' }[type];
  cmEl.innerHTML = '<div class="cm-title">' + esc(c.label) + '<span>' + kindLbl + '</span></div>'
    + '<div class="cm-sort"><button data-cms="asc" class="' + (asc ? 'on' : '') + '">' + ico('sortUp') + 'Crescente</button><button data-cms="desc" class="' + (desc ? 'on' : '') + '">' + ico('sortDown') + 'Decrescente</button></div>'
    + '<div class="cm-lbl">Filtrar</div>' + f
    + '<div class="cm-foot"><button class="btn" data-cmclr>Limpar</button><button class="btn primary" data-cmapply>Aplicar</button></div>';
  cmEl.classList.add('on');
  const r = th.getBoundingClientRect(), w = cmEl.offsetWidth;
  cmEl.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  const top = r.bottom + 6;
  cmEl.style.top = Math.min(top, innerHeight - cmEl.offsetHeight - 8) + 'px';
  const first = cmEl.querySelector('.cm-search, .cm-q, .cm-min, .cm-from');
  if (first) first.focus();
}
function applyColMenu(clear) {
  const { id, k, type } = S.cm, T = S.tables[id];
  const flt = S.flt[id] || (S.flt[id] = {});
  let f = null;
  if (!clear) {
    if (type === 'cat') {
      const boxes = [...cmEl.querySelectorAll('.cm-list input')];
      const on = boxes.filter((b) => b.checked).map((b) => b.value);
      if (on.length < boxes.length) f = { type, vals: on };
    } else if (type === 'text') {
      const q = cmEl.querySelector('.cm-q').value.trim();
      if (q) f = { type, q };
    } else if (type === 'num') {
      const mn = cmEl.querySelector('.cm-min').value, mx = cmEl.querySelector('.cm-max').value;
      if (mn !== '' || mx !== '') f = { type, min: mn === '' ? null : +mn, max: mx === '' ? null : +mx };
    } else if (type === 'date') {
      const fr = cmEl.querySelector('.cm-from').value, to = cmEl.querySelector('.cm-to').value;
      if (fr || to) f = { type, from: fr ? new Date(fr + 'T00:00:00').getTime() : null, to: to ? new Date(to + 'T23:59:59.999').getTime() : null };
    }
  }
  if (f) flt[k] = f; else delete flt[k];
  if (S.pg[id]) S.pg[id].i = 0;
  closeColMenu(); render();
  if (!T) return;
}
cmEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !S.cm) return;
  if (b.dataset.cms) { S.sort[S.cm.id] = { k: S.cm.k, asc: b.dataset.cms === 'asc' }; if (S.pg[S.cm.id]) S.pg[S.cm.id].i = 0; closeColMenu(); render(); }
  else if (b.hasAttribute('data-cmall') || b.hasAttribute('data-cmnone')) cmEl.querySelectorAll('.cm-opt:not([hidden]) input').forEach((x) => { x.checked = b.hasAttribute('data-cmall'); });
  else if (b.hasAttribute('data-cmclr')) applyColMenu(true);
  else if (b.hasAttribute('data-cmapply')) applyColMenu(false);
});
cmEl.addEventListener('input', (e) => {
  if (!e.target.classList.contains('cm-search')) return;
  const q = e.target.value.trim().toLowerCase();
  cmEl.querySelectorAll('.cm-opt').forEach((o) => { o.hidden = !!q && !o.dataset.v.includes(q); });
});
cmEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.cm) { e.preventDefault(); applyColMenu(false); } });
document.addEventListener('mousedown', (e) => { if (S.cm && !cmEl.contains(e.target) && !e.target.closest('th[data-t]')) closeColMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.cm) closeColMenu(); });

const meter = (x, max) => `<span class="meter"><i style="width:${max ? Math.min(100, (x / max) * 100) : 0}%"></i></span>`;
const tag = (cls, t) => `<span class="tag ${cls}">${esc(t)}</span>`;

// ---------- gráficos ----------
function modelColorMap(rs) {
  const g = group(rs, (r) => r.m).sort((a, b) => b.cost - a.cost);
  const map = {};
  g.forEach((x, i) => { map[x.k] = COLORS[Math.min(i, COLORS.length - 1)]; });
  return map;
}
function legend(map) { return `<div class="legend">${Object.entries(map).map(([k, c]) => `<span><i style="background:${c}"></i>${esc(k)}</span>`).join('')}</div>`; }

// série diária [{k, v}] cobrindo o período inteiro (dias vazios = 0)
const METRIC = { cost: (rs) => sum(rs, (r) => r.$), tok: (rs) => sum(rs, tokens), sess: (rs) => new Set(rs.map((r) => r.s)).size, n: (rs) => rs.length,
  hit: (rs) => { const i = sum(rs, (r) => r.i + r.cr + r.w5 + r.w1); return i ? sum(rs, (r) => r.cr) / i : 0; } };
function series(rs, metric, from, to) {
  const by = new Map();
  for (const r of rs) { const k = dayKey(r.t); (by.get(k) || by.set(k, []).get(k)).push(r); }
  if (from == null) { const ks = [...by.keys()].sort(); if (!ks.length) return []; from = new Date(ks[0] + 'T12:00:00').getTime(); to = Date.now(); }
  const out = [];
  for (let t = from; dayKey(t) <= dayKey(to); t += 864e5) { const k = dayKey(t); out.push({ k, v: METRIC[metric](by.get(k) || []) }); }
  return out;
}
const rangeFrom = () => (S.period ? Date.now() - (S.period - 1) * 864e5 : null);

// curva suave (catmull-rom → bézier), controle preso ao eixo pra não passar abaixo de 0
function smooth(pts, floor) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function niceMax(v) { if (v <= 0) return 1; const e = 10 ** Math.floor(Math.log10(v / 5)); const s = [1, 2, 2.5, 5, 10].map((m) => m * e).find((x) => x * 5 >= v); return s * 5; }

let gid = 0;
// ---------- popup (tooltip) ----------
// data-tip = JSON {t: título, r: [[rótulo, valor, cor?], ...]} — renderizado com textContent (sem HTML injetável)
const tip = (title, rows) => ` data-tip="${esc(JSON.stringify({ t: title, r: rows }))}"`;
const fDay = (k) => { const s = new Date(k + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
// colunas invisíveis sobre cada ponto: hover mostra guia + ponto + popup
function hoverZones(xy, tips, top, bottom, left, right, dot = 5) {
  const n = xy.length;
  return xy.map(([x, y], i) => {
    const x0 = i === 0 ? left : (xy[i - 1][0] + x) / 2, x1 = i === n - 1 ? right : (x + xy[i + 1][0]) / 2;
    return `<g class="hz"${tips[i]}><rect x="${x0}" y="${top}" width="${Math.max(1, x1 - x0)}" height="${bottom - top}" fill="transparent"/><line class="guide" x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" vector-effect="non-scaling-stroke"/>${dot ? `<circle class="guide" cx="${x}" cy="${y}" r="${dot}"/>` : ''}</g>`;
  }).join('');
}

function sparkline(pts, color, fmt) {
  if (pts.length < 2) return '<svg class="spark"></svg>';
  const W = 200, H = 34, max = Math.max(...pts.map((p) => p.v), 1e-9);
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * W, H - 3 - (p.v / max) * (H - 8)]);
  const line = smooth(xy, H - 1), id = 'sg' + gid++;
  const tips = pts.map((p) => tip(fDay(p.k), [['', fmt ? fmt(p.v) : String(p.v)]]));
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${line} L${W},${H} L0,${H} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${hoverZones(xy, tips, 0, H, 0, W, 0)}</svg>`;
}

function areaChart(pts, fmt, detail) {
  if (!pts.length) return '<div class="empty">Sem dados no período.</div>';
  const W = 760, H = 330, L = 50, R = 12, T = 12, B = 30;
  const max = niceMax(Math.max(...pts.map((p) => p.v)));
  const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i / (pts.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const xy = pts.map((p, i) => [x(i), y(p.v)]);
  const line = smooth(xy, H - B), id = 'ag' + gid++;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Série diária" style="font-size:13px"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".42"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".02"/></linearGradient></defs>`;
  for (let i = 0; i <= 5; i++) {
    const v = (max * i) / 5, yy = y(v);
    s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--line)"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(pts.length / 10));
  pts.forEach((p, i) => { if (i % step === 0) s += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="${x(i)}" y="${H - 8}" text-anchor="middle">${p.k.slice(5)}</text>`; });
  s += `<path d="${line} L${xy[xy.length - 1][0]},${H - B} L${xy[0][0]},${H - B} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4"/>`;
  if (pts.length <= 45) pts.forEach((p, i) => { s += `<circle cx="${xy[i][0]}" cy="${xy[i][1]}" r="4.2" fill="#c9f5e3" stroke="var(--bg)" stroke-width="1.5"/>`; });
  const tips = pts.map((p) => tip(fDay(p.k), detail ? detail(p.k) : [['Valor', fmt(p.v)]]));
  s += hoverZones(xy, tips, T, H - B, L, W - R, 7);
  return s + '</svg>';
}

function donut(parts, center, sub) { // [{label, v, c, rows?}]
  const t = sum(parts, (p) => p.v) || 1, r = 82, C = 2 * Math.PI * r;
  let off = 0;
  const tipOf = (p) => tip(p.label, [['Participação', fPctBR(p.v / t), p.c], ...(p.rows || [])]);
  const segs = parts.map((p) => { const len = (p.v / t) * C; const el = `<circle class="seg-arc" cx="110" cy="110" r="${r}" fill="none" stroke="${p.c}" stroke-width="34" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 110 110)"${tipOf(p)}/>`; off += len; return el; }).join('');
  return `<div class="donut"><svg viewBox="0 0 220 220" width="210" height="210">${segs}<text x="110" y="112" text-anchor="middle" style="font-size:26px;font-weight:700;fill:var(--text);pointer-events:none">${esc(center)}</text><text x="110" y="134" text-anchor="middle" style="font-size:12px;pointer-events:none">${esc(sub)}</text></svg>
  <div class="dleg">${parts.map((p) => `<div${tipOf(p)}><i style="background:${p.c}"></i><span>${esc(p.label)}</span><em>${fPctBR(p.v / t)}</em></div>`).join('')}</div></div>`;
}

function ring(v, label, good) {
  const r = 50, C = 2 * Math.PI * r, len = Math.max(0, Math.min(1, v)) * C, col = good ? 'var(--accent)' : 'var(--bad)';
  return `<svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="9"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${len} ${C - len}" transform="rotate(-90 60 60)"/><text x="60" y="67" text-anchor="middle" style="font-size:22px;font-weight:700;fill:var(--text)">${esc(label)}</text></svg>`;
}

function segBar(parts) { // [{v,c,label}]
  const t = sum(parts, (p) => p.v) || 1;
  return `<svg viewBox="0 0 200 10" width="180" height="10" style="vertical-align:middle">${(() => { let x = 0; return parts.map((p) => { const w = (p.v / t) * 200; const r = `<rect x="${x}" y="0" width="${w}" height="10" fill="${p.c}"${tip(p.label, [['Custo', fUsd(p.v), p.c], ['Participação', fPctBR(p.v / t)]])}/>`; x += w; return r; }).join(''); })()}</svg>`;
}

// ---------- views ----------
const fUsd2 = (n) => '$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fTokBR = (n) => fTok(n).replace('.', ',');
const fPctBR = (n, d = 1) => (n * 100).toFixed(d).replace('.', ',') + '%';

const KFMT = { cost: (v) => fUsd2(v), tok: (v) => fTokBR(v) + ' tokens', hit: (v) => fPctBR(v) + ' cache hit', n: (v) => v.toLocaleString('pt-BR') + ' respostas', sess: (v) => v + ' sessões' };
function kpi(label, icon, value, cur, prev, metric, upIsBad, color, hot) {
  let delta = '<span class="delta flat">—</span>';
  if (prev) {
    const a = METRIC[metric](cur), b = METRIC[metric](prev);
    if (metric === 'hit') { const pp = (a - b) * 100; delta = `<span class="delta ${pp >= 0 ? 'good' : 'bad'}">${pp >= 0 ? '▲' : '▼'} ${pp >= 0 ? '+' : ''}${pp.toFixed(1).replace('.', ',')} p.p.</span>`; }
    else if (b > 0) { const d = (a - b) / b; const bad = upIsBad ? d > 0 : d < 0; delta = `<span class="delta ${bad ? 'bad' : 'good'}">${d >= 0 ? '▲ +' : '▼ '}${fPctBR(d)}</span>`; }
  }
  return `<div class="kpi${hot ? ' hot' : ''}"><div class="l">${ico(icon)}${esc(label)}</div><div class="row"><div class="v">${value}</div>${delta}</div>${sparkline(series(cur, metric, rangeFrom(), Date.now()), color, KFMT[metric])}</div>`;
}

function viewGeral(rs) {
  const prev = previous();
  const cost = sum(rs, (r) => r.$), tok = sum(rs, tokens), sess = new Set(rs.map((r) => r.s)).size;
  const hit = METRIC.hit(rs);
  const warn = S.unpriced.size ? `<div class="note" style="color:var(--warn);margin:-6px 0 12px">Sem preço configurado: ${[...S.unpriced].map(esc).join(', ')} — custo contado como $0. Ajuste em Custos.</div>` : '';

  // gráfico principal
  const fmt = { cost: (v) => (v === 0 ? '$0' : v >= 10 ? '$' + Math.round(v) : '$' + v.toFixed(2)), tok: (v) => fTok(v), sess: (v) => String(Math.round(v)) }[S.chart];
  const title = { cost: 'Custo ao longo do tempo', tok: 'Tokens ao longo do tempo', sess: 'Sessões ao longo do tempo' }[S.chart];
  const seg = [['cost', 'Custo'], ['tok', 'Tokens'], ['sess', 'Sessões']].map(([k, l]) => `<button data-chart="${k}" class="${S.chart === k ? 'on' : ''}">${l}</button>`).join('');

  const byDay = new Map();
  for (const r of rs) { const k = dayKey(r.t); (byDay.get(k) || byDay.set(k, []).get(k)).push(r); }
  const detail = (k) => {
    const d = byDay.get(k) || [];
    if (!d.length) return [['Sem uso neste dia', '']];
    const top = group(d, (r) => r.m).sort((x, y) => y.cost - x.cost)[0];
    const topA = group(d, (r) => r.a).sort((x, y) => y.cost - x.cost)[0];
    const rows = [['Custo', fUsd2(sum(d, (r) => r.$)), 'var(--accent)'], ['Tokens', fTokBR(sum(d, tokens))], ['Sessões', String(new Set(d.map((r) => r.s)).size)], ['Respostas', d.length.toLocaleString('pt-BR')], ['Cache hit', fPctBR(METRIC.hit(d))], ['Modelo principal', top.k], ['Agente mais caro', topA.k + ' · ' + fUsd(topA.cost)]];
    const order = { cost: 0, tok: 1, sess: 2 }[S.chart];
    return [rows[order], ...rows.filter((_, i) => i !== order)];
  };

  // donut
  const gm = group(rs, (r) => r.m).sort((a, b) => b.tok - a.tok);
  const dv = (g) => (S.donut === 'tok' ? g.tok : g.cost);
  const parts = gm.sort((a, b) => dv(b) - dv(a)).map((g, i) => ({ label: g.k, v: dv(g), c: COLORS[Math.min(i, COLORS.length - 1)], rows: [['Tokens', fTokBR(g.tok)], ['Custo', fUsd2(g.cost)], ['Respostas', g.n.toLocaleString('pt-BR')], ['Saída', fTokBR(g.o)]] }));

  // ranking de agentes
  const ga = group(rs, (r) => r.a).sort((a, b) => b.cost - a.cost).slice(0, 6);
  const rank = ga.map((g, i) => `<tr${tip(g.k, [['Custo', fUsd2(g.cost), 'var(--accent)'], ['Tokens', fTokBR(g.tok)], ['Respostas', g.n.toLocaleString('pt-BR')], ['Execuções', g.k === 'main' ? '—' : String(g.inv.size)], ['Modelos', [...g.models].join(', ')]])}><td><span class="num${i === 0 ? ' first' : ''}">${i + 1}</span></td><td class="l">${esc(g.k)}</td><td>${fUsd(g.cost)}</td><td>${fTokBR(g.tok)}</td><td><span class="pill">${fPctBR(cost ? g.cost / cost : 0)}</span></td></tr>`).join('');

  // top extensões (MCP, skills, subagentes)
  const st = extStats(rs);
  const kindIco = { mcp: 'plug', skill: 'spark', agent: 'bot' };
  const exts = ['mcp', 'skill', 'agent'].flatMap((k) => [...st[k]].map(([id, e]) => ({ k, id, cost: e.cost, n: e.n }))).sort((a, b) => b.cost - a.cost);
  const extTot = sum(exts, (e) => e.cost) || 1;
  const bars = exts.slice(0, 5).map((e) => `<div class="hbar"${tip(e.id, [['Tipo', { mcp: 'MCP server', skill: 'Skill', agent: 'Subagente' }[e.k]], ['Turnos', String(e.n)], ['Custo dos turnos', fUsd2(e.cost), 'var(--accent)'], ['Participação', fPctBR(e.cost / extTot)]])}>${ico(kindIco[e.k])}<span>${esc(e.id)}</span><div class="track"><i style="width:${(e.cost / exts[0].cost) * 100}%"></i></div><em>${fPctBR(e.cost / extTot)}</em></div>`).join('') || '<div class="empty">Nenhuma extensão chamada no período.</div>';

  // eficiência
  const inv = S.D.inventory, used = allTimeUse();
  const idle = inv.plugins.filter((p) => !used.plugin.has(p.id)).length + inv.skills.filter((s) => !used.skill.has(s.id)).length + inv.mcps.filter((m) => !used.mcp.has(m.id)).length;
  const subCost = sum(rs.filter((r) => r.a !== 'main'), (r) => r.$);
  const hrow = (ok, label, val, bad) => `<div class="hrow"><i style="color:${ok ? 'var(--ok)' : 'var(--warn)'};display:flex">${ico(ok ? 'check' : 'alert')}</i><span>${esc(label)}</span><b style="${bad ? 'color:var(--bad)' : ''}">${val}</b></div>`;
  const prevCost = prev ? sum(prev, (r) => r.$) : 0, dc = prevCost ? (cost - prevCost) / prevCost : null;

  return `${typeof v1Alerts === 'function' ? v1Alerts() : ''}${warn}
  <div class="kpis">
    ${kpi('Custo estimado', 'coins', fUsd2(cost), rs, prev, 'cost', true, 'var(--bad)', true)}
    ${kpi('Tokens', 'bolt', fTokBR(tok), rs, prev, 'tok', true, 'var(--accent)')}
    ${kpi('Cache Hit', 'db', fPctBR(hit), rs, prev, 'hit', false, 'var(--accent)')}
    ${kpi('Respostas', 'chat', rs.length.toLocaleString('pt-BR'), rs, prev, 'n', false, 'var(--accent)')}
    ${kpi('Sessões', 'pulse', sess.toLocaleString('pt-BR'), rs, prev, 'sess', false, 'var(--accent)')}
  </div>
  ${typeof v2Limits === 'function' ? v2Limits() : ''}
  <div class="grid-main">
    <div class="card"><div class="card-h"><b>${title}</b><div class="seg">${seg}</div></div>${areaChart(series(rs, S.chart, rangeFrom(), Date.now()), fmt, detail)}</div>
    <div class="card"><div class="card-h"><b>Uso por modelo</b><select id="donutsel"><option value="tok"${S.donut === 'tok' ? ' selected' : ''}>% Tokens</option><option value="cost"${S.donut === 'cost' ? ' selected' : ''}>% Custo</option></select></div>
      ${parts.length ? donut(parts, S.donut === 'tok' ? fTokBR(tok) : fUsd(cost), S.donut === 'tok' ? 'Tokens' : 'Custo') : '<div class="empty">Sem dados.</div>'}</div>
  </div>
  <div class="grid3">
    <div class="card"><div class="card-h"><b>Ranking de agentes</b></div><table class="rank"><thead><tr><th class="l">#</th><th class="l">Agente</th><th>Custo</th><th>Tokens</th><th>% custo</th></tr></thead><tbody>${rank || '<tr><td colspan="5" class="empty">Sem dados.</td></tr>'}</tbody></table></div>
    <div class="card"><div class="card-h"><b>Extensões <small>(Top 5 por custo)</small></b></div>${bars}</div>
    <div class="card"><div class="card-h"><b>Eficiência</b></div><div class="health"><div>
      ${hrow(hit >= 0.8, 'Cache hit', fPctBR(hit))}
      ${hrow(true, 'Custo médio por resposta', rs.length ? fUsd(cost / rs.length) : '—')}
      ${dc == null ? hrow(true, 'Custo vs. período anterior', '—') : hrow(dc <= 0, 'Custo vs. período anterior', (dc >= 0 ? '+' : '') + fPctBR(dc), dc > 0)}
      ${hrow(true, 'Custo em subagentes', fPctBR(cost ? subCost / cost : 0))}
      ${hrow(idle === 0, 'Extensões instaladas sem uso', String(idle))}
    </div><div class="ring"><div class="cap">Cache hit</div>${ring(hit, fPctBR(hit), hit >= 0.8)}<div><span class="badge${hit >= 0.8 ? '' : ' bad'}">${hit >= 0.8 ? 'Bom' : 'Baixo'}</span></div></div></div></div>
  </div>`;
}

function viewAgentes(rs) {
  const cost = sum(rs, (r) => r.$);
  const g = group(rs, (r) => r.a).map((x) => ({ ...x, name: x.k, invN: x.inv.size, avg: x.inv.size ? x.cost / x.inv.size : 0, mods: [...x.models].join(', ') }));
  const max = Math.max(...g.map((x) => x.cost), 0);
  const cols = [
    { k: 'name', label: 'Agente', l: 1, f: (r) => esc(r.name) + (r.name === 'main' ? ' ' + tag('info', 'sessão principal') : '') },
    { k: 'cost', label: 'Custo', f: (r) => fUsd(r.cost) + meter(r.cost, max) },
    { k: 'share', label: '% do total', v: (r) => (cost ? r.cost / cost : 0), f: (r) => fPct(cost ? r.cost / cost : 0) },
    { k: 'invN', label: 'Execuções', f: (r) => (r.name === 'main' ? '—' : r.invN) },
    { k: 'avg', label: 'Custo/execução', f: (r) => (r.name === 'main' ? '—' : fUsd(r.avg)) },
    { k: 'n', label: 'Respostas' }, { k: 'tok', label: 'Tokens', f: (r) => fTok(r.tok) }, { k: 'o', label: 'Saída', f: (r) => fTok(r.o) },
    { k: 'mods', label: 'Modelos', l: 1 },
  ];
  const used = new Set(rs.map((r) => r.a));
  const idle = S.D.inventory.agents.filter((a) => !S.D.records.some((r) => r.a.toLowerCase() === a.name.toLowerCase())).map((a) => a.name);
  return `<h2>Agentes</h2><p class="sub">Quem gastou os tokens. Cada subagente tem transcrito próprio; <b>main</b> é a conversa principal. “Execução” = uma chamada do subagente.</p>
  ${idle.length ? `<div class="idle"><span>Instalados que nunca rodaram</span>${idle.map((n) => tag('warn', n)).join(' ')}</div>` : ''}
  ${table('agentes', cols, g, 'cost')}`;
}

function viewModelos(rs) {
  const cost = sum(rs, (r) => r.$);
  const g = group(rs, (r) => r.m).map((x) => ({ ...x, name: x.k }));
  const max = Math.max(...g.map((x) => x.cost), 0);
  const P = priceFor;
  const cols = [
    { k: 'name', label: 'Modelo', l: 1, f: (r) => esc(r.name) + (P(r.name) ? '' : ' ' + tag('bad', 'sem preço')) },
    { k: 'cost', label: 'Custo', f: (r) => fUsd(r.cost) + meter(r.cost, max) },
    { k: 'share', label: '%', v: (r) => (cost ? r.cost / cost : 0), f: (r) => fPct(cost ? r.cost / cost : 0) },
    { k: 'n', label: 'Respostas' },
    { k: 'i', label: 'Entrada', f: (r) => fTok(r.i) }, { k: 'o', label: 'Saída', f: (r) => fTok(r.o) },
    { k: 'cr', label: 'Cache leit.', f: (r) => fTok(r.cr) }, { k: 'cw', label: 'Cache escr.', f: (r) => fTok(r.cw) },
    { k: 'mix', label: 'Composição do custo', l: 1, v: (r) => r.cp.out, f: (r) => segBar([{ v: r.cp.in, c: 'var(--c1)', label: 'Entrada' }, { v: r.cp.out, c: 'var(--c2)', label: 'Saída' }, { v: r.cp.cr, c: 'var(--c3)', label: 'Cache leitura' }, { v: r.cp.cw, c: 'var(--c4)', label: 'Cache escrita' }]) },
  ];
  return `<h2>Modelos</h2><p class="sub">Uso e custo por modelo. Barra: <span style="color:var(--c1)">■</span> entrada <span style="color:var(--c2)">■</span> saída <span style="color:var(--c3)">■</span> cache leitura <span style="color:var(--c4)">■</span> cache escrita.</p>${table('modelos', cols, g, 'cost')}`;
}

// ----- extensões -----
function unitOf(x) { // chave de extensão -> {kind, id}
  const [kind, a, b] = x.split('|');
  if (kind === 'mcp') return { kind: 'mcp', id: a, sub: b };
  return { kind, id: a };
}
function pluginOf(u, inv) {
  const plugins = new Set(inv.plugins.map((p) => p.id));
  if (u.kind === 'skill') { const p = u.id.split(':')[0]; return u.id.includes(':') && plugins.has(p) ? p : null; }
  if (u.kind === 'mcp') { const p = u.id.split('/')[0]; return u.id.includes('/') && plugins.has(p) ? p : null; }
  if (u.kind === 'agent') { const a = inv.agents.find((x) => x.name === u.id); return a && a.plugin; }
  return null;
}
function extStats(rs) {
  const inv = S.D.inventory;
  const m = { skill: new Map(), mcp: new Map(), agent: new Map(), tool: new Map(), plugin: new Map() };
  const bump = (map, id, cost, t, tool) => {
    let e = map.get(id); if (!e) map.set(id, (e = { n: 0, cost: 0, last: 0, tools: new Set() }));
    e.n++; e.cost += cost; if (t > e.last) e.last = t; if (tool) e.tools.add(tool);
  };
  for (const r of rs) {
    if (!r.x.length) continue;
    const units = new Map(); // dedupe por unidade (mcp = servidor)
    for (const x of r.x) { const u = unitOf(x); units.set(u.kind + '|' + u.id, u); }
    const share = r.$ / units.size;
    const perPlugin = new Map();
    for (const u of units.values()) {
      bump(m[u.kind], u.id, share, r.t, u.sub);
      const p = pluginOf(u, inv);
      if (p) perPlugin.set(p, (perPlugin.get(p) || 0) + share);
    }
    for (const [p, c] of perPlugin) bump(m.plugin, p, c, r.t);
  }
  return m;
}
function allTimeUse() {
  const s = { skill: new Set(), mcp: new Set(), agent: new Set(), plugin: new Set() };
  const inv = S.D.inventory;
  for (const r of S.D.records) for (const x of r.x) {
    const u = unitOf(x);
    if (s[u.kind]) s[u.kind].add(u.id);
    const p = pluginOf(u, inv); if (p) s.plugin.add(p);
  }
  return s;
}
function viewExt(rs) {
  const inv = S.D.inventory, st = extStats(rs), used = allTimeUse();
  const kinds = [['plugins', 'Plugins', 'plugin'], ['skills', 'Skills', 'skill'], ['mcp', 'MCP', 'mcp'], ['agentes', 'Subagentes', 'agent'], ['tools', 'Ferramentas nativas', 'tool']];
  const [, , kind] = kinds.find((k) => k[0] === S.sub) || kinds[0];
  const invList = { plugin: inv.plugins, skill: inv.skills, mcp: inv.mcps, agent: inv.agents, tool: [] }[kind];
  const stats = st[kind];
  const ids = new Set([...invList.map((i) => i.id), ...stats.keys()]);
  const byId = new Map(invList.map((i) => [i.id, i]));
  const rows = [...ids].map((id) => {
    const i = byId.get(id), s = stats.get(id) || { n: 0, cost: 0, last: 0, tools: new Set() };
    let status, cls;
    if (kind === 'tool') { status = 'nativa'; cls = 'info'; }
    else if (!i) { status = 'não inventariado'; cls = 'info'; }
    else if (kind === 'plugin' && !i.enabled) { status = 'desativado'; cls = 'bad'; }
    else if (used[kind].has(id)) { status = 'em uso'; cls = 'ok'; }
    else { status = 'nunca usado'; cls = 'warn'; }
    let origin = kind === 'tool' ? 'Claude Code' : !i ? (kind === 'mcp' && id.startsWith('claude.ai') ? 'conector claude.ai' : 'built-in / removido') : i.plugin ? 'plugin ' + i.plugin : i.source === 'user' ? 'usuário' : 'plugin';
    if (kind === 'plugin' && i) origin = `v${String(i.version || '?').slice(0, 8)} · ${i.skills} skills · ${i.agents} agentes · ${i.mcps} mcp`;
    return { name: id, origin, status, cls, n: s.n, cost: s.cost, last: s.last, tools: [...s.tools].join(', '), _click: kind === 'plugin' ? '' : '' };
  });
  const max = Math.max(...rows.map((r) => r.cost), 0);
  const cols = [
    { k: 'name', label: 'Nome', l: 1 }, { k: 'status', label: 'Status', l: 1, f: (r) => tag(r.cls, r.status) },
    { k: 'origin', label: 'Origem', l: 1 },
    { k: 'n', label: 'Turnos' }, { k: 'cost', label: 'Custo dos turnos', f: (r) => fUsd(r.cost) + meter(r.cost, max) },
    { k: 'last', label: 'Último uso (período)', type: 'date', f: (r) => fDate(r.last) },
  ];
  if (kind === 'mcp') cols.splice(3, 0, { k: 'tools', label: 'Tools chamadas', l: 1 });
  const dead = rows.filter((r) => r.cls === 'warn').length;
  return `<h2>Extensões</h2>
  <p class="sub">Inventário (<code>~/.claude</code>) cruzado com o uso real. <b>Custo dos turnos</b> = custo das respostas em que a extensão foi chamada, dividido igualmente entre tudo que foi chamado no mesmo turno. É aproximação: o peso do resultado da tool não é medido pelo transcrito. Plugins que agem só por hook (ex.: caveman) não deixam rastro de chamada e aparecem como “nunca usado”.</p>
  <div class="subtabs" role="tablist">${kinds.map(([k, l, kd]) => { const inL = { plugin: inv.plugins, skill: inv.skills, mcp: inv.mcps, agent: inv.agents, tool: [] }[kd]; const n = new Set([...inL.map((i) => i.id), ...st[kd].keys()]).size; return `<button role="tab" aria-selected="${k === S.sub}" data-sub="${k}" class="${k === S.sub ? 'on' : ''}">${l}<span class="cnt">${n}</span></button>`; }).join('')}</div>
  ${dead ? `<div class="note" style="margin:0 0 8px;color:var(--warn)">${dead} instalado(s) sem nenhum uso registrado — candidatos a remover.</div>` : ''}
  ${table('ext-' + kind, cols, rows, 'cost')}`;
}

function viewSessoes(rs) {
  const g = group(rs, (r) => r.s).map((x) => {
    const first = rs.filter((r) => r.s === x.k);
    const t0 = Math.min(...first.map((r) => r.t));
    const top = group(first, (r) => r.m).sort((a, b) => b.cost - a.cost)[0];
    return { ...x, name: x.k.slice(0, 8), proj: projName(first[0].p), t0, topModel: top ? top.k : '', agents: new Set(first.map((r) => r.a)).size, _click: 'session:' + x.k };
  });
  const max = Math.max(...g.map((x) => x.cost), 0);
  const cols = [
    { k: 'name', label: 'Sessão', l: 1, mono: 1, type: 'text' }, { k: 'proj', label: 'Projeto', l: 1 },
    { k: 't0', label: 'Início', type: 'date', f: (r) => fDate(r.t0) }, { k: 'last', label: 'Fim', type: 'date', f: (r) => fDate(r.last) },
    { k: 'cost', label: 'Custo', f: (r) => fUsd(r.cost) + meter(r.cost, max) },
    { k: 'n', label: 'Respostas' }, { k: 'tok', label: 'Tokens', f: (r) => fTok(r.tok) }, { k: 'agents', label: 'Agentes' }, { k: 'topModel', label: 'Modelo principal', l: 1 },
  ];
  return `<h2>Sessões</h2><p class="sub">Clique numa sessão para ver cada resposta na Auditoria.</p>${table('sessoes', cols, g, 'cost')}`;
}

function auditRows(rs) {
  const q = S.search.toLowerCase();
  return rs.filter((r) => (!S.session || r.s === S.session) && (!q || (r.m + ' ' + r.a + ' ' + r.x.join(' ') + ' ' + r.s).toLowerCase().includes(q))).sort((a, b) => b.t - a.t);
}
function viewAudit(rs) {
  const rows = auditRows(rs).map((r) => ({ t: r.t, s: r.s, a: r.a, m: r.m, i: r.i, o: r.o, cr: r.cr, cw: r.w5 + r.w1, $: r.$, x: r.x.map((x) => x.split('|').slice(1).join(':')).join(', '), _r: r }));
  const cols = [
    { k: 't', label: 'Quando', l: 1, type: 'date', f: (r) => fDate(r.t) },
    { k: 's', label: 'Sessão', l: 1, mono: 1, type: 'text', f: (r) => esc(r.s.slice(0, 8)) },
    { k: 'a', label: 'Agente', l: 1 }, { k: 'm', label: 'Modelo', l: 1 },
    { k: 'i', label: 'Entrada' }, { k: 'o', label: 'Saída' },
    { k: 'cr', label: 'Cache leit.', f: (r) => fTok(r.cr) }, { k: 'cw', label: 'Cache escr.', f: (r) => fTok(r.cw) },
    { k: '$', label: 'Custo', f: (r) => fUsd(r.$) },
    { k: 'x', label: 'Extensões chamadas', l: 1, cls: 'name', type: 'text' },
  ];
  const grid = table('audit', cols, rows, 't', { empty: 'Nada encontrado.' });
  const shown = S.tables.audit.filtered;
  return '<h2>Auditoria</h2><p class="sub">Cada resposta do assistente, como lida do transcrito. Clique no nome de uma coluna para ordenar ou filtrar. Custo = tokens × preço da aba Custos (cache leitura 0,1×; escrita 5m 1,25×; escrita 1h 2×).</p>'
    + '<div class="toolbar"><div class="xsearch">' + ico('search') + '<input id="q" placeholder="Buscar em tudo: modelo, agente, extensão, sessão…" value="' + esc(S.search) + '" spellcheck="false"></div>'
    + (S.session ? '<button class="btn" id="clrs">Sessão ' + esc(S.session.slice(0, 8)) + ' ✕</button>' : '') + '<button class="btn" id="csv">' + ico('download') + 'Exportar CSV</button>'
    + '<span class="note">' + shown.length.toLocaleString('pt-BR') + ' respostas · ' + fUsd(sum(shown, (r) => r.$)) + '</span></div>' + grid;
}
function exportCsv(rs) {
  // exporta exatamente o que está na tela: busca + filtros de coluna + ordenação
  const rows = S.tables.audit ? S.tables.audit.filtered.map((x) => x._r) : auditRows(rs);
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const out = ['time,session,project,agent,model,input,output,cache_read,cache_write_5m,cache_write_1h,cost_usd,extensions'];
  for (const r of rows) out.push([new Date(r.t).toISOString(), r.s, r.p, r.a, r.m, r.i, r.o, r.cr, r.w5, r.w1, r.$.toFixed(6), q(r.x.join(';'))].join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' }));
  a.download = 'claude-ledger.csv'; a.click();
}

function viewPrecos() {
  const rows = S.D.pricing, models = [...new Set(S.D.records.map((r) => r.m))];
  return `<h2>Preços</h2><p class="sub">USD por 1M tokens. O primeiro <code>match</code> contido no id do modelo vale. Valores iniciais são <b>estimativas</b> — confira na tabela oficial e ajuste. Cache: leitura 0,1×, escrita 5m 1,25×, escrita 1h 2× da entrada.</p>
  <div class="card"><table><thead><tr><th class="l">Trecho do modelo</th><th>Entrada</th><th>Saída</th><th class="l">Modelos casados</th><th></th></tr></thead><tbody>
  ${rows.map((p, i) => `<tr><td class="l"><input data-p="${i}" data-f="match" value="${esc(p.match)}"></td><td><input class="price-in" data-p="${i}" data-f="in" type="number" step="0.01" value="${p.in}"></td><td><input class="price-in" data-p="${i}" data-f="out" type="number" step="0.01" value="${p.out}"></td><td class="l">${models.filter((m) => priceFor(m) === p).map((m) => esc(m)).join(', ') || '—'}</td><td><button class="btn" data-del="${i}">✕</button></td></tr>`).join('')}
  </tbody></table>
  <div class="toolbar" style="margin:12px 0 0"><button class="btn" id="addp">+ Linha</button><button class="btn" id="resetp">Restaurar padrão</button><button class="btn" id="savep">Salvar e recalcular</button></div></div>
  ${S.unpriced.size ? `<div class="note" style="color:var(--warn)">Sem preço: ${[...S.unpriced].map(esc).join(', ')}</div>` : ''}`;
}

// ---------- perfis ----------
const MODELS = [['', 'Padrão do Claude Code'], ['opus', 'Opus (alias)'], ['sonnet', 'Sonnet (alias)'], ['haiku', 'Haiku (alias)'], ['fable', 'Fable (alias)']];
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function profileFromCurrent(name) {
  const c = S.P.current, inv = S.D.inventory;
  return {
    id: uid(), name, model: c.model || '', caveman: false, nirvana: false, instructions: '',
    disabledPlugins: inv.plugins.filter((p) => c.enabledPlugins[p.key] === false).map((p) => p.key),
    blockedMcp: [], blockedSkills: [], startSkills: [],
  };
}
const editing = () => S.P && S.P.profiles.find((p) => p.id === S.editId);
const chk = (attr, id, on, label) => '<label class="chk"><input type="checkbox" ' + attr + '="' + esc(id) + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';

function viewPerfis() {
  const P = S.P, inv = S.D.inventory;
  if (!P) return '<div class="empty">Carregando…</div>';
  const list = P.profiles.map((p) => '<button class="prof ' + (p.id === S.editId ? 'on' : '') + '" data-edit="' + p.id + '">' + esc(p.name) + (p.id === P.active ? ' ' + tag('ok', 'ativo') : '') + '</button>').join('') || '<div class="note">Nenhum perfil ainda.</div>';
  const p = editing();
  let ed = '<div class="empty">Crie ou selecione um perfil.</div>';
  if (p) {
    const models = [...MODELS, ...[...new Set(S.D.records.map((r) => r.m))].map((m) => [m, m])];
    if (p.model && !models.some((m) => m[0] === p.model)) models.push([p.model, p.model]);
    const groups = {};
    for (const s of inv.skills) (groups[s.plugin ? 'plugin ' + s.plugin : 'skills do usuário'] ||= []).push(s);
    const skillRows = Object.entries(groups).map(([g, ss]) => '<tr><td colspan="3" class="l grp">' + esc(g) + '</td></tr>' + ss.map((s) =>
      '<tr><td class="l">' + esc(s.id) + '</td><td><input type="checkbox" data-sk="' + esc(s.id) + '"' + (!(p.blockedSkills || []).includes(s.id) ? ' checked' : '') + '></td><td><input type="checkbox" data-ss="' + esc(s.id) + '"' + ((p.startSkills || []).includes(s.id) ? ' checked' : '') + '></td></tr>').join('')).join('');
    ed = '<div class="card">'
      + '<div class="frow"><label>Nome<input data-pf="name" value="' + esc(p.name) + '"></label>'
      + '<label>Modelo padrão<select data-pf="model">' + models.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === (p.model || '') ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label></div>'
      + '<h3>Sempre ativo em toda sessão</h3><div class="chks">'
      + chk('data-pb', 'caveman', p.caveman, 'Caveman (respostas comprimidas)') + chk('data-pb', 'nirvana', p.nirvana, 'Nirvana (protocolo do broker + cadeia de 9 agentes)') + '</div>'
      + ((p.requires || []).length ? '<h3>Plugins que este perfil usa</h3><div class="chks">' + p.requires.map((q) => { const have = inv.plugins.some((x) => x.key === q.id); return have ? tag('ok', q.id) : (q.source ? '<button class="btn" data-req="' + esc(q.source + '|' + q.id) + '">Instalar ' + esc(q.id) + '</button>' : tag('warn', q.id + ' (sem origem)')); }).join(' ') + '</div>' : '')
      + '<h3>Plugins</h3><div class="chks">' + inv.plugins.map((x) => chk('data-pl', x.key, !(p.disabledPlugins || []).includes(x.key), x.id)).join('') + '</div>'
      + '<h3>MCP servers liberados</h3><div class="chks">' + inv.mcps.map((x) => chk('data-mcp', x.id, !(p.blockedMcp || []).includes(x.id), x.id)).join('') + '</div>'
      + '<h3>Skills</h3><div class="card" style="padding:0;max-height:300px;overflow:auto"><table><thead><tr><th class="l">Skill</th><th>Liberada</th><th>Rodar no início</th></tr></thead><tbody>' + skillRows + '</tbody></table></div>'
      + '<h3>Instruções extras (vão para o CLAUDE.md global)</h3><textarea data-pf="instructions" rows="5" placeholder="Ex.: sempre responder em português; rodar testes antes de commit…">' + esc(p.instructions || '') + '</textarea>'
      + '<div class="toolbar" style="margin-top:12px"><button class="btn" id="psave">Salvar</button><button class="btn" id="pplan">Aplicar ao Claude Code…</button><button class="btn" id="pdup">Duplicar</button><button class="btn" id="pexp">Exportar arquivo</button><button class="btn" id="pproj"' + tip('Perfil de time', [['Grava em', '<projeto>/.claude/settings.json'], ['e', '<projeto>/CLAUDE.md'], ['Efeito', 'quem clonar recebe o mesmo setup']]) + '>Exportar para projeto (time)</button><button class="btn danger" id="pdel">Excluir</button></div>'
      + (S.plan ? '<div class="card plan"><b>O que muda ao aplicar “' + esc(p.name) + '”</b><ul>' + S.plan.changes.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul><details><summary>Bloco que vai no CLAUDE.md</summary><pre>' + esc(S.plan.block) + '</pre></details><div class="note">Backup automático de settings.json e CLAUDE.md antes de gravar. Vale para sessões novas — as abertas não mudam.</div><div class="toolbar" style="margin-top:10px"><button class="btn primary" id="papply">Confirmar e aplicar</button><button class="btn" id="pcancel">Cancelar</button></div></div>' : '')
      + (S.pmsg ? '<div class="note" style="color:var(--ok)">' + esc(S.pmsg) + '</div>' : '')
      + '</div>';
  }
  const act = P.profiles.find((x) => x.id === P.active);
  return '<h2>Perfis</h2><p class="sub">Cada perfil define modelo, plugins, MCP, skills e instruções fixas. Ao aplicar, o app grava em <code>~/.claude/settings.json</code> e num bloco próprio do <code>~/.claude/CLAUDE.md</code> — toda sessão nova do Claude Code segue o perfil sem você ativar nada no chat.</p>'
    + '<div class="note" style="margin-bottom:12px">Perfil ativo: <b>' + (act ? esc(act.name) : 'nenhum') + '</b>' + (P.appliedAt ? ' · aplicado ' + fDate(P.appliedAt) : '') + (act ? ' <button class="btn" id="pdetach">Desvincular</button>' : '') + '</div>'
    + '<div class="pgrid"><div><div class="plist">' + list + '</div><button class="btn" id="pnew" style="width:100%;margin-top:8px">+ Novo perfil (da config atual)</button><button class="btn" id="pimp" style="width:100%;margin-top:6px">Importar arquivo…</button></div><div>' + ed + '</div></div>';
}
async function loadProfiles() { S.P = await window.ledger.profiles.get(); if (!S.editId && S.P.profiles.length) S.editId = S.P.active || S.P.profiles[0].id; }
async function saveProfiles() { const r = await window.ledger.profiles.save({ profiles: S.P.profiles }); S.P = { ...S.P, ...r }; }
const toggle = (arr, id, off) => { const s = new Set(arr || []); if (off) s.add(id); else s.delete(id); return [...s]; };

// ---------- explorar ----------
const num = (s) => { if (s == null) return null; const t = String(s).trim().toLowerCase(); const k = t.endsWith('k'); const n = parseFloat(t.replace(/k$/, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isNaN(n) ? null : k ? n * 1000 : n; };
const fInst = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n || 0));
function goAnalyze(link) { S.tab = 'explore'; S.X.src = 'link'; S.L.input = link; render(); analyzeLink(); }
async function loadExplore() {
  const X = S.X;
  if (X.src === 'plugins' && !X.plugins) { X.plugins = await window.ledger.catalog.plugins(); render(); }
  if (X.src === 'mcp' && X.mcpQ !== X.q) { X.busy = 'mcp'; X.mcpQ = X.q; render(); const r = await window.ledger.catalog.mcp(X.q); X.mcp = r.items; X.msg = r.ok ? '' : r.error; X.busy = ''; render(); }
  if (X.src === 'community' && !X.com) { X.cfg = await window.ledger.config.get(); X.busy = 'com'; render(); X.com = await window.ledger.catalog.community(); X.busy = ''; render(); }
}
function viewExplore() {
  const X = S.X, inv = S.D.inventory;
  const tabs = [['plugins', 'Diretório oficial', X.plugins ? X.plugins.items.length : null], ['github', 'GitHub', null], ['mcp', 'MCP servers', X.mcp ? X.mcp.length : null], ['community', 'Comunidade', X.com && X.com.items ? X.com.items.length : null], ['link', 'Por link' + (S.L.res ? ' · análise' : ''), S.installs ? S.installs.length || null : null]];
  const tabsHtml = '<div class="subtabs" role="tablist">' + tabs.map(([k, l, n]) => '<button role="tab" aria-selected="' + (X.src === k) + '" data-xsrc="' + k + '" class="' + (X.src === k ? 'on' : '') + '">' + l + (n != null ? '<span class="cnt">' + n.toLocaleString('pt-BR') + '</span>' : '') + '</button>').join('') + '</div>';
  if (X.src === 'link') return tabsHtml + viewAdd();
  if (X.src === 'github') return tabsHtml + viewGithub();
  let h = tabsHtml
    + '<div class="toolbar"><div class="xsearch">' + ico('search') + '<input id="xq" placeholder="' + (X.src === 'mcp' ? 'Buscar no registry de MCP (Enter)…' : 'Buscar por nome ou descrição…') + '" value="' + esc(X.q) + '" spellcheck="false"></div>'
    + (X.src === 'plugins' ? '<label class="chk"><input type="checkbox" id="xrev"' + (X.reviewed ? ' checked' : '') + '> Só revisados</label><select id="xsort"><option value="installs"' + (X.sort === 'installs' ? ' selected' : '') + '>Mais instalados</option><option value="cheap"' + (X.sort === 'cheap' ? ' selected' : '') + '>Menor custo fixo</option><option value="name"' + (X.sort === 'name' ? ' selected' : '') + '>Nome</option></select>' : '')
    + '</div>';
  if (X.msg) h += '<div class="note" style="color:var(--bad)">' + esc(X.msg) + '</div>';
  const q = X.q.trim().toLowerCase();
  const hit = (x) => !q || (x.name + ' ' + (x.title || '') + ' ' + x.summary).toLowerCase().includes(q);

  if (X.src === 'plugins') {
    if (!X.plugins) return h + '<div class="empty">Carregando catálogo…</div>';
    if (!X.plugins.available) return h + '<div class="empty">Catálogo local não encontrado. Abra o Claude Code e rode <code>/plugin</code> uma vez para ele baixar o diretório.</div>';
    let list = X.plugins.items.filter((x) => hit(x) && (!X.reviewed || x.reviewed));
    const sorters = { installs: (a, b) => (b.installs || 0) - (a.installs || 0), cheap: (a, b) => (a.alwaysOn ?? 1e9) - (b.alwaysOn ?? 1e9), name: (a, b) => a.name.localeCompare(b.name) };
    list.sort(sorters[X.sort]);
    h += '<div class="note" style="margin:-2px 0 10px">' + list.length.toLocaleString('pt-BR') + ' resultado(s) · catálogo de ' + fDate(Date.parse(X.plugins.fetchedAt)) + '</div>';
    h += plist('x-plugins', list, (x) => {
      const installed = x.official && inv.plugins.some((p) => p.key === x.official);
      const cost = x.alwaysOn != null ? '<span class="xcost"' + tip('Custo em tokens (estimativa oficial)', [['Fixo por sessão', '~' + x.alwaysOn.toLocaleString('pt-BR') + ' tok', 'var(--accent)'], ['Ao usar (soma)', x.onInvoke != null ? '~' + x.onInvoke.toLocaleString('pt-BR') + ' tok' : '—'], ['Skills', String(x.skills ?? '—')], ['Agentes', String(x.agents ?? '—')]]) + '>' + ico('bolt') + '~' + x.alwaysOn.toLocaleString('pt-BR') + ' tok/sessão</span>' : '';
      const act = installed ? tag('ok', 'instalado')
        : x.official ? '<button class="btn primary" data-xoff="' + esc(x.official) + '"' + (X.busy ? ' disabled' : '') + '>' + (X.busy === x.official ? 'Instalando…' : 'Instalar') + '</button>' + (x.repo ? '<button class="btn" data-xan="' + esc(x.repo) + '">Analisar</button>' : '')
        : x.repo ? '<button class="btn" data-xan="' + esc(x.repo) + '">Analisar e instalar</button>' : '';
      return '<div class="xitem"><div class="xmain"><div class="xname"><b>' + esc(x.name) + '</b>' + (x.version ? ' <span class="note">v' + esc(x.version) + '</span>' : '') + ' ' + (x.reviewed ? tag('ok', 'revisado') : tag('warn', 'não revisado')) + (x.official ? ' ' + tag('info', 'oficial') : '') + '</div>'
        + '<div class="xsum">' + esc(x.summary || '—') + '</div><div class="xmeta">' + cost + (x.installs ? '<span>' + fInst(x.installs) + ' instalações</span>' : '') + (x.repo ? '<span>' + esc(x.repo.replace('https://github.com/', '')) + '</span>' : '') + '</div></div><div class="xact">' + act + '</div></div>';
    }, 'Nada encontrado.');
  }

  if (X.src === 'mcp') {
    if (X.busy === 'mcp' || X.mcp === null) return h + '<div class="empty">Buscando no registry…</div>';
    const installedMcp = new Set(inv.mcps.map((m) => m.name));
    h += '<div class="note" style="margin:-2px 0 10px">' + X.mcp.length + ' servidor(es) no registry oficial de MCP' + (X.q ? ' para “' + esc(X.q) + '”' : '') + '. Servidores locais (npx/uvx/docker) executam código na sua máquina.</div>';
    h += plist('x-mcp', X.mcp, (x) => {
      const i = X.mcp.indexOf(x);
      // nome sugerido: título do servidor; o fim do id costuma ser genérico ("mcp", "server")
      const tail = x.name.split('/').pop();
      const short = ((x.title && x.title !== tail) || /^(mcp|server|mcp-server)$/i.test(tail) ? x.title || x.name.split('/')[0] : tail).toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'mcp-server';
      const open = X.open === x.key;
      return '<div class="xitem' + (open ? ' open' : '') + '"><div class="xmain"><div class="xname"><b>' + esc(x.title) + '</b> <span class="note">' + esc(x.name) + (x.version ? ' · v' + esc(x.version) : '') + '</span> ' + tag(x.kind === 'remoto' ? 'info' : 'warn', x.kind === 'remoto' ? 'remoto (http)' : 'local · ' + x.kind) + (installedMcp.has(short) ? ' ' + tag('ok', 'adicionado') : '') + '</div>'
        + '<div class="xsum">' + esc(x.summary || '—') + '</div><div class="xmeta">' + (x.repo ? '<span>' + esc(x.repo.replace('https://github.com/', '')) + '</span>' : '') + '</div>'
        + (open ? '<div class="mcpbox"><div class="frow"><label>Nome<input data-xmname="' + i + '" value="' + esc(short) + '"></label></div><textarea rows="6" spellcheck="false" data-xmcfg="' + i + '">' + esc(JSON.stringify(x.config || {}, null, 2)) + '</textarea><div class="toolbar" style="margin-top:6px"><button class="btn primary" data-xmadd="' + i + '"' + (X.busy ? ' disabled' : '') + '>Adicionar ao Claude Code</button><span class="note">Preencha chaves/segredos vazios antes. Fica em escopo de usuário.</span></div></div>' : '')
        + '</div><div class="xact">' + (x.config ? '<button class="btn" data-xmopen="' + esc(x.key) + '">' + (open ? 'Fechar' : 'Configurar') + '</button>' : '<span class="note">sem instalação automática</span>') + (x.repo ? '<button class="btn" data-xan="' + esc(x.repo) + '">Analisar repo</button>' : '') + '</div></div>';
    }, 'Nada encontrado.');
  }

  if (X.src === 'community') {
    const cfg = X.cfg || { registryUrl: '' };
    h += '<div class="card"><div class="card-h"><b>Registry da comunidade</b></div><div class="note" style="margin:0 0 10px">Um repositório GitHub com um <code>index.json</code>. Qualquer pessoa envia extensões por Pull Request; a validação automática fixa o commit e marca hooks. O app lê o índice por CDN — sem servidor.</div>'
      + '<div class="lrow"><input id="xreg" placeholder="https://cdn.jsdelivr.net/gh/SEU-USUARIO/claude-ledger-registry@main/index.json" value="' + esc(cfg.registryUrl || '') + '" spellcheck="false"><button class="btn" id="xregsave">Salvar</button></div></div>';
    if (X.busy === 'com') h += '<div class="empty">Carregando índice…</div>';
    else if (X.com && !X.com.ok) h += '<div class="note" style="color:var(--bad)">' + esc(X.com.error) + '</div>';
    else if (X.com && X.com.configured) {
      const list = X.com.items.filter(hit);
      h += plist('x-com', list, (x) => '<div class="xitem"><div class="xmain"><div class="xname"><b>' + esc(x.name) + '</b> ' + (x.kind ? tag('info', x.kind) : '') + (x.hooks ? ' ' + tag('bad', 'tem hooks') : '') + x.tags.map((t) => ' ' + tag('', t)).join('') + '</div><div class="xsum">' + esc(x.summary || '—') + '</div><div class="xmeta">' + (x.alwaysOn != null ? '<span class="xcost">' + ico('bolt') + '~' + x.alwaysOn.toLocaleString('pt-BR') + ' tok/sessão</span>' : '') + '<span>' + esc(x.repo.replace('https://github.com/', '')) + (x.commit ? ' @' + esc(x.commit.slice(0, 8)) : '') + '</span></div></div><div class="xact"><button class="btn" data-xan="' + esc(x.repo) + '">Analisar e instalar</button></div></div>', 'Índice vazio ou sem resultados.');
    }
  }
  return h;
}

// ---------- adicionar por link ----------
const LEVEL = { alto: 'bad', 'médio': 'warn', info: 'info' };
function viewAdd() {
  const L = S.L, r = L.res && L.res.report, busy = !!L.busy;
  const highRisk = r && r.risks.some((x) => x.level === 'alto');
  const locked = highRisk && !L.ack;
  const dis = (extra) => (busy || locked || extra ? ' disabled' : '');
  let h = '<div class="card linkbox"><div class="lrow">' + ico('link') + '<input id="linkin" placeholder="https://github.com/dono/repo   ·   dono/repo   ·   …/tree/main/pasta" value="' + esc(L.input) + '" spellcheck="false">'
    + '<button class="btn primary" id="lgo"' + (busy ? ' disabled' : '') + '>' + (L.busy === 'analyze' ? 'Analisando…' : 'Analisar') + '</button></div>'
    + '<div class="note">GitHub, GitLab, Bitbucket ou qualquer git <b>https</b>. O repositório é clonado em quarentena e lido sem executar nada. Instalação só acontece quando você clica, sempre pelo CLI oficial (<code>claude plugin</code> / <code>claude mcp</code>).</div></div>';
  if (L.error) h += '<div class="card plan"><b style="color:var(--bad)">Não deu</b><div class="note">' + esc(L.error) + '</div></div>';

  if (r) {
    const n = L.res.n;
    const v = r.validation;
    h += '<div class="card"><div class="card-h"><b>' + esc(n.label) + (n.sub ? ' <small>/ ' + esc(n.sub) + '</small>' : '') + '</b><span class="note" style="margin:0">commit ' + esc(L.res.sha.slice(0, 10)) + ' · ' + r.files + ' arquivos · ' + Math.round(r.bytes / 1024) + ' KB</span></div>'
      + '<div class="chks">' + (r.kind.length ? r.kind.map((k) => tag('info', k)).join(' ') : tag('warn', 'formato não reconhecido'))
      + (v ? ' ' + (v.success ? tag('ok', 'manifesto válido (claude plugin validate)') : tag('bad', 'manifesto com erro')) : '') + '</div>';
    const ch = L.res.changes;
    if (ch && ch.same) h += '<div class="note">' + ico('check', 'inl') + ' Mesmo commit da sua análise de ' + fDate(ch.at) + '.</div>';
    else if (ch) {
      const lines = [...ch.hooks.added.map((x) => '+ hook ' + x), ...ch.hooks.removed.map((x) => '− hook ' + x), ...ch.mcp.added.map((x) => '+ mcp ' + x), ...ch.mcp.removed.map((x) => '− mcp ' + x)];
      h += '<div class="card plan" style="margin:10px 0"><b>Mudou desde sua análise de ' + fDate(ch.at) + '</b> <span class="note">' + esc(ch.fromSha.slice(0, 8)) + ' → ' + esc(L.res.sha.slice(0, 8)) + '</span>'
        + (lines.length ? '<pre class="out">' + esc(lines.join('\n')) + '</pre>' + (ch.hooks.added.length ? '<div class="note" style="color:var(--bad)">Hooks novos — revise antes de atualizar.</div>' : '') : '<div class="note">Sem mudança em hooks ou MCP.</div>') + '</div>';
    }
    if (v && !v.success) h += '<pre class="out">' + esc(JSON.stringify(v.manifest ? v.manifest.errors : v.raw, null, 2).slice(0, 1500)) + '</pre>';
    if (r.risks.length) {
      h += '<h3>O que isso executa na sua máquina</h3>' + r.risks.map((x) => '<div class="hrow">' + tag(LEVEL[x.level] || 'info', x.level) + '<span>' + esc(x.text) + '</span></div>').join('');
      if (r.hooks.length) h += '<details><summary class="note">Ver comandos dos hooks</summary><pre class="out">' + esc(r.hooks.map((x) => x.event + ': ' + x.command).join('\n')) + '</pre></details>';
      if (highRisk) h += '<label class="chk ack"><input type="checkbox" id="lack"' + (L.ack ? ' checked' : '') + '> Entendi: hooks rodam comandos automaticamente em toda sessão. Confio nesta fonte.</label>';
    } else h += '<div class="note">Nenhum hook, MCP ou script executável encontrado.</div>';

    if (r.marketplace) {
      const rows = r.marketplace.plugins.map((p) => {
        const c = r.costs[p.name];
        const cost = c && c.alwaysOn ? '~' + c.alwaysOn + ' tok/sessão' : '<span class="note">após instalar</span>';
        const comp = c && c.ok ? [c.skills && c.skills + ' skills', c.agents && c.agents + ' agentes', c.mcp && c.mcp + ' mcp', c.hooks && 'hooks: ' + c.hooks].filter(Boolean).join(' · ') : '';
        const installed = S.D.inventory.plugins.some((x) => x.key === p.name + '@' + r.marketplace.name);
        const ins = c && c.installed;
        let cmp = '';
        if (ins) {
          const was = num(ins.alwaysOn), now = num(c.alwaysOn);
          const d = was && now ? (now - was) / was : null;
          cmp = '<div class="vcmp"' + tip('Custo fixo por sessão', [['Instalado (v' + (ins.version || '?').slice(0, 10) + ')', ins.alwaysOn ? '~' + ins.alwaysOn + ' tok' : '—'], ['Versão do link', c.alwaysOn ? '~' + c.alwaysOn + ' tok' : '—', 'var(--accent)'], ['Diferença', d == null ? '—' : (d >= 0 ? '+' : '') + fPctBR(d)]]) + '>instalado ~' + esc(ins.alwaysOn || '?') + ' → ~' + esc(c.alwaysOn || '?') + ' tok' + (d != null ? ' <span class="delta ' + (d > 0.05 ? 'bad' : d < -0.05 ? 'good' : 'flat') + '">' + (d >= 0 ? '+' : '') + fPctBR(d, 0) + '</span>' : '') + '</div>';
        }
        return '<tr><td class="l"><b>' + esc(p.name) + '</b>' + (p.local ? '' : ' ' + tag('warn', 'repo externo')) + '<div class="note" style="margin:2px 0 0;white-space:normal;max-width:520px">' + esc(p.description.slice(0, 180)) + (comp ? '<br>' + esc(comp) : '') + '</div></td><td>' + cost + '</td><td>'
          + (installed ? cmp + '<button class="btn" data-upd="' + esc(p.name + '@' + r.marketplace.name) + '"' + dis() + '>' + (L.busy === 'u:' + p.name ? 'Atualizando…' : 'Atualizar') + '</button>' : '<button class="btn" data-iplug="' + esc(p.name) + '"' + dis() + '>' + (L.busy === 'p:' + p.name ? 'Instalando…' : 'Instalar') + '</button>') + '</td></tr>';
      }).join('');
      h += '<h3>Plugins do marketplace “' + esc(r.marketplace.name) + '”' + (r.marketplace.owner ? ' · ' + esc(r.marketplace.owner) : '') + '</h3><table><thead><tr><th class="l">Plugin</th><th>Custo fixo</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    } else if (r.plugin) {
      h += '<h3>Plugin “' + esc(r.plugin.name) + '”</h3><div class="note">O repositório tem <code>plugin.json</code> mas não tem <code>marketplace.json</code>, então o Claude Code não instala direto. ' + (r.skills.length ? 'Dá para instalar as skills soltas abaixo.' : 'Peça ao autor um marketplace.json ou use o assistente.') + '</div>';
    }
    const loose = !r.marketplace;
    if (loose && r.skills.length) {
      h += '<h3>Skills (' + r.skills.length + ')</h3><div class="card" style="padding:0;max-height:260px;overflow:auto"><table><tbody>' + r.skills.map((s, i) => '<tr><td style="width:30px"><input type="checkbox" data-lsk="' + i + '"' + (L.sel.has(i) ? ' checked' : '') + '></td><td class="l"><b>' + esc(s.name) + '</b><div class="note" style="margin:2px 0 0;white-space:normal">' + esc(s.description.slice(0, 160)) + '</div></td><td class="l note">' + esc(s.dir) + '</td></tr>').join('') + '</tbody></table></div>'
        + '<div class="toolbar"><button class="btn" id="lskall">Marcar todas</button><button class="btn primary" id="lskins"' + dis(!L.sel.size) + '>Instalar ' + L.sel.size + ' skill(s) em ~/.claude/skills</button></div>';
    }
    if (loose && r.agents.length) h += '<h3>Agentes</h3>' + r.agents.map((g, i) => '<div class="hrow"><span><b>' + esc(g.name) + '</b> <span class="note">' + esc(g.description.slice(0, 120)) + '</span></span><button class="btn" data-iagent="' + i + '"' + dis() + '>Instalar</button></div>').join('');
    if (r.mcp.length) h += '<h3>MCP servers</h3>' + r.mcp.map((m, i) => mcpEditor('r', i, m.name, m.config, dis())).join('');
    if (r.profile) h += '<h3>Perfil</h3><div class="hrow"><span>Perfil “' + esc(r.profile.name || '?') + '” do Claude Ledger</span><button class="btn primary" id="lprof"' + dis() + '>Importar perfil</button></div>';

    h += '<h3>Assistente</h3><div class="hrow"><span class="note" style="margin:0">Repo fora do padrão (MCP descrito só no README, por exemplo)? O Claude lê o repositório, <b>só com ferramentas de leitura</b>, e propõe a configuração. Usa o seu plano do Claude.</span><button class="btn" id="lassist"' + (busy ? ' disabled' : '') + '>' + (L.busy === 'assist' ? 'Analisando com Claude…' : 'Pedir ao Claude') + '</button></div>';
    if (L.assist) {
      const p = L.assist.proposal;
      if (!p) h += '<pre class="out">' + esc(L.assist.raw) + '</pre>';
      else {
        h += '<div class="card plan"><b>Proposta do Claude</b> <span class="note">revise antes de instalar — é sugestão, não verdade</span><p>' + esc(p.resumo || '') + '</p>'
          + (p.mcp || []).map((m, i) => mcpEditor('a', i, m.name, m.config, dis())).join('')
          + ((p.skills || []).length ? '<div class="note">Skills sugeridas: ' + p.skills.map(esc).join(', ') + '</div>' : '')
          + ((p.observacoes || []).length ? '<ul>' + p.observacoes.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul>' : '') + '</div>';
      }
    }
    if (r.readme) h += '<details><summary class="note">README</summary><pre class="out">' + esc(r.readme) + '</pre></details>';
    h += '</div>';
  }
  if (L.log.length) h += '<div class="card"><div class="card-h"><b>Resultado</b><button class="btn" id="lclr">Limpar</button></div>' + L.log.map((x) => '<div class="logline">' + tag(x.ok ? 'ok' : 'bad', x.ok ? 'ok' : 'falhou') + ' <code>' + esc(x.cmd || '') + '</code>' + (x.accept ? ' <button class="btn" data-accept="' + esc(x.accept) + '">Aceitar comando e tentar de novo</button>' : '') + '<pre class="out">' + esc(x.out || '') + '</pre></div>').join('') + '</div>';

  const inst = S.installs;
  const instCols = [
    { k: 'type', label: 'Tipo', l: 1, f: (x) => tag('info', x.type) },
    { k: 'id', label: 'Nome', l: 1, cls: 'name', type: 'text' },
    { k: 'source', label: 'Origem', l: 1, type: 'text', fv: (x) => x.source || '', f: (x) => '<span class="mono note">' + esc(x.source || '') + (x.sha ? ' @' + esc(x.sha.slice(0, 8)) : '') + '</span>' },
    { k: 'at', label: 'Quando', l: 1, type: 'date', f: (x) => fDate(x.at) },
    { k: 'act', label: '', nf: 1, f: (x) => '<button class="btn danger" data-rm="' + esc(x.key) + '">' + (S.L.confirm === x.key ? 'Confirmar remoção' : 'Remover') + '</button>' },
  ];
  h += '<h3>Instalados pelo Ledger <span class="note" style="text-transform:none;letter-spacing:0;font-family:var(--sans)">· removíveis com um clique · valem em sessões novas</span></h3>'
    + table('installs', instCols, S.installs, 'at', { fixed: false, size: 8, empty: 'Nada instalado por aqui ainda.' });
  return h;
}
function mcpEditor(src, i, name, config, dis) {
  return '<div class="mcpbox"><div class="frow"><label>Nome<input data-mcpname="' + src + i + '" value="' + esc(name || '') + '"></label></div>'
    + '<textarea rows="5" spellcheck="false" data-mcpcfg="' + src + i + '">' + esc(JSON.stringify(config || {}, null, 2)) + '</textarea>'
    + '<div class="toolbar" style="margin-top:6px"><button class="btn" data-imcp="' + src + i + '"' + dis + '>Adicionar MCP (claude mcp add-json, escopo usuário)</button><span class="note">Preencha variáveis de ambiente vazias antes.</span></div></div>';
}
async function refreshAfterInstall() { S.D.inventory = await window.ledger.inventory(); S.installs = await window.ledger.installs.list(); }
async function linkAction(action, busyKey) {
  S.L.busy = busyKey || 'install'; render();
  const r = await window.ledger.link.install(S.L.res.token, action);
  S.L.log.unshift({ ok: r.ok, cmd: r.cmd || action.type, out: r.out, accept: r.needsAccept ? action.name + '|' + r.needsAccept : '' });
  S.L.busy = ''; await refreshAfterInstall(); render();
  return r;
}

// ---------- render ----------
function render(fromFit) {
  if (!S.D) return;
  if (!fromFit) closeColMenu();
  try { tipEl.classList.remove('on'); tipFor = null; } catch { /* popup ainda não criado */ }
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const t = TABS.find((x) => x[0] === S.tab);
  $('#ptitle').textContent = t[1];
  $('#psub').textContent = t[3];
  document.body.classList.toggle('nofilter', ['add', 'perfis', 'precos', 'explore', 'config'].includes(S.tab));
  document.body.classList.toggle('onlyscope', ['sessoes', 'diagnosticos', 'eficiencia', 'custos', 'assuntos'].includes(S.tab));
  saveHash();
  if (typeof renderFilterBar === 'function') renderFilterBar();
  const rs = filtered();
  const views = { geral: viewGeral, agentes: viewAgentesV2, modelos: viewModelos, ext: viewExt, sessoes: viewSessoesV1, audit: viewAuditV2, precos: viewPrecos, perfis: viewPerfis, add: viewAdd, explore: viewExplore,
    diagnosticos: viewDiagnosticos, orchestra: viewOrchestra, eficiencia: viewEficiencia, custos: viewCustos, assuntos: viewAssuntos, config: viewConfig };
  const sy = $('#view').scrollTop;
  $('#view').innerHTML = views[S.tab](rs);
  $('#view').scrollTop = sy;
  fitPanels(!fromFit);
  if (S.tab === 'audit') { const q = $('#q'); if (q) q.oninput = () => { S.search = q.value; if (S.pg.audit) S.pg.audit.i = 0; const p = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); }; }
}

function saveHash() {
  const q = new URLSearchParams();
  if (S.period !== 30) q.set('dias', S.period);
  if (S.project) q.set('projeto', S.project);
  if (S.model) q.set('modelo', S.model);
  if (S.agent) q.set('agente', S.agent);
  if (S.tab === 'sessoes' && S.V && S.V.sid) { q.set('sessao', S.V.sid); q.set('aba', S.V.stab); }
  const h = '#/' + S.tab + (q.toString() ? '?' + q : '');
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const m = /^#\/([\w-]+)(?:\?(.*))?$/.exec(location.hash || '');
  if (!m) return;
  if (TABS.some((t) => t[0] === m[1])) S.tab = m[1];
  const q = new URLSearchParams(m[2] || '');
  if (q.has('dias')) S.period = +q.get('dias');
  if (q.has('projeto')) S.project = q.get('projeto');
  if (q.has('modelo')) S.model = q.get('modelo');
  if (q.has('agente')) S.agent = q.get('agente');
  if (q.has('sessao') && S.V) { S.V.sid = q.get('sessao'); S.V.stab = q.get('aba') || 'timeline'; }
  $('#period').value = String(S.period);
}

async function load() {
  $('#loading').classList.remove('hide');
  S.D = await window.ledger.load();
  priceAll();
  const sel = $('#project'), cur = S.project;
  sel.innerHTML = '<option value="">Todos os projetos</option>' + [...new Set(S.D.records.map((r) => r.p))].sort().map((p) => `<option value="${esc(p)}">${esc(projName(p))}</option>`).join('');
  sel.value = S.project;
  const fill = (id, label, vals, keep) => { const el = $(id); el.innerHTML = `<option value="">${label}</option>` + vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join(''); el.value = keep; };
  fill('#fmodel', 'Todos os modelos', [...new Set(S.D.records.map((r) => r.m))].sort(), S.model);
  fill('#fagent', 'Todos os agentes', [...new Set(S.D.records.map((r) => r.a))].sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b))), S.agent);
  const last = Math.max(0, ...S.D.records.map((r) => r.t));
  $('#livemsg').textContent = `Coleta ativa · ${S.D.fileCount} arquivos`;
  $('#livemsg').title = 'Última resposta lida: ' + fDate(last);
  await loadProfiles();
  S.installs = await window.ledger.installs.list();
  $('#loading').classList.add('hide');
  render();
}

// ---------- popup: segue o mouse ----------
const tipEl = document.createElement('div');
tipEl.id = 'tip'; tipEl.setAttribute('role', 'tooltip');
document.body.appendChild(tipEl);
let tipFor = null;
document.addEventListener('mousemove', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { if (tipFor) { tipEl.classList.remove('on'); tipFor = null; } return; }
  if (el !== tipFor) {
    tipFor = el;
    let d; try { d = JSON.parse(el.dataset.tip); } catch { return; }
    tipEl.replaceChildren();
    const h = document.createElement('b'); h.textContent = d.t; tipEl.appendChild(h);
    for (const [l, v, c] of d.r || []) {
      const row = document.createElement('div');
      if (c) { const i = document.createElement('i'); i.style.background = c; row.appendChild(i); }
      const sl = document.createElement('span'); sl.textContent = l; row.appendChild(sl);
      const sv = document.createElement('em'); sv.textContent = v; row.appendChild(sv);
      tipEl.appendChild(row);
    }
    tipEl.classList.add('on');
  }
  const pad = 14, w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + hh > innerHeight - 8) y = e.clientY - hh - pad;
  tipEl.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
});
document.addEventListener('mouseleave', () => { tipEl.classList.remove('on'); tipFor = null; });
$('#view').addEventListener('scroll', () => { tipEl.classList.remove('on'); tipFor = null; });

// ---------- eventos ----------
$('#tabs').innerHTML = TABS.map(([k, l, i, , g], idx) => (idx === 0 || TABS[idx - 1][4] !== g ? `<div class="navsec">${g}</div>` : '') + `<button data-tab="${k}">${ico(i)}<span>${l}</span></button>`).join('');
$('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { if (S.tab === 'sessoes' && b.dataset.tab === 'sessoes' && S.V) { S.V.sid = null; S.V.sel = null; }
    if (S.tab === 'agentes' && b.dataset.tab === 'agentes' && S.A) S.A = { name: null, sub: 'resumo' };
    if (S.tab === 'orchestra' && b.dataset.tab === 'orchestra' && S.O) S.O.agent = null; S.tab = b.dataset.tab; render(); if (S.tab === 'explore') loadExplore(); } };
$('#period').onchange = (e) => { S.period = +e.target.value; render(); };
setTimeout(readHash, 0); // depois de v1.js carregar
$('#project').onchange = (e) => { S.project = e.target.value; render(); };
$('#fmodel').onchange = (e) => { S.model = e.target.value; render(); };
$('#fagent').onchange = (e) => { S.agent = e.target.value; render(); };
$('#reload').onclick = load;
window.ledger.onProgress(({ d, t }) => { $('#loadbar').style.width = (t ? (d / t) * 100 : 0) + '%'; $('#loadmsg').textContent = `Lendo transcritos… ${d}/${t}`; });

$('#view').addEventListener('click', async (e) => {
  const th = e.target.closest('th[data-t]');
  if (th) { if (S.cm && S.cm.id === th.dataset.t && S.cm.k === th.dataset.k) closeColMenu(); else openColMenu(th); return; }
  const fdel = e.target.closest('[data-fdel]'); if (fdel) { const [tid, k] = fdel.dataset.fdel.split('|'); delete S.flt[tid][k]; if (S.pg[tid]) S.pg[tid].i = 0; render(); return; }
  const fclr = e.target.closest('[data-fclr]'); if (fclr) { S.flt[fclr.dataset.fclr] = {}; if (S.pg[fclr.dataset.fclr]) S.pg[fclr.dataset.fclr].i = 0; render(); return; }
  const pgb = e.target.closest('[data-pg]');
  if (pgb && !pgb.disabled) { const [pid, k] = pgb.dataset.pg.split('|'); S.pg[pid].i = +k; render(); return; }
  const sub = e.target.closest('[data-sub]'); if (sub) { S.sub = sub.dataset.sub; render(); return; }
  const ch = e.target.closest('[data-chart]'); if (ch) { S.chart = ch.dataset.chart; render(); return; }
  // explorar
  const X = S.X, xb = e.target.closest('button') || e.target, xd = xb.dataset;
  if (xd.xsrc) { X.src = xd.xsrc; X.q = ''; X.msg = ''; X.open = ''; render(); loadExplore(); return; }
  if (xd.xan) { goAnalyze(xd.xan); return; }
  if (xd.xoff) {
    X.busy = xd.xoff; render();
    const [name] = xd.xoff.split('@');
    const r = await window.ledger.installFrom('anthropics/claude-plugins-official', name);
    X.busy = ''; X.msg = r.ok ? '' : 'Falhou: ' + r.out.slice(0, 400);
    await refreshAfterInstall(); render(); return;
  }
  if (xd.xmopen) { X.open = X.open === xd.xmopen ? '' : xd.xmopen; render(); return; }
  if (xd.xmadd != null) {
    const i = xd.xmadd, name = $('[data-xmname="' + i + '"]').value.trim();
    let config; try { config = JSON.parse($('[data-xmcfg="' + i + '"]').value); } catch { X.msg = 'JSON inválido.'; render(); return; }
    X.busy = 'add'; render();
    const r = await window.ledger.addMcp(name, config);
    X.busy = ''; X.msg = r.ok ? '' : 'Falhou: ' + r.out.slice(0, 400); if (r.ok) X.open = '';
    await refreshAfterInstall(); render(); return;
  }
  if (xb.id === 'xregsave') { const r = await window.ledger.config.set({ registryUrl: $('#xreg').value }); X.msg = r.ok ? '' : r.error; X.com = null; render(); loadExplore(); return; }
  // perfis: exportar para projeto
  if (xb.id === 'pproj' && editing()) { await saveProfiles(); const r = await window.ledger.exportProject(editing()); if (r.ok) S.pmsg = 'Gravado: ' + r.written.join(' · ') + '. Faça commit desses arquivos no repositório do time.'; else if (r.error) S.pmsg = 'Erro: ' + r.error; render(); return; }
  // adicionar por link
  const L = S.L, t = e.target, ds = t.dataset;
  if (ds.upd) { L.busy = 'u:' + ds.upd.split('@')[0]; render(); const r = await window.ledger.updatePlugin(ds.upd); L.log.unshift({ ok: r.ok, cmd: r.cmd, out: r.out + (r.ok ? '\nReinicie o Claude Code para aplicar.' : '') }); L.busy = ''; await refreshAfterInstall(); render(); return; }
  if (t.id === 'lgo') { await analyzeLink(); return; }
  if (t.id === 'lclr') { L.log = []; render(); return; }
  if (t.id === 'lassist') { L.busy = 'assist'; render(); L.assist = await window.ledger.link.assist(L.res.token); L.busy = ''; render(); return; }
  if (t.id === 'lskall') { L.res.report.skills.forEach((_, i) => L.sel.add(i)); render(); return; }
  if (t.id === 'lskins') { for (const i of [...L.sel]) await linkAction({ type: 'skill', skill: L.res.report.skills[i] }); L.sel.clear(); render(); return; }
  if (t.id === 'lprof') { const r = await linkAction({ type: 'profile', profile: L.res.report.profile }); if (r.ok) await loadProfiles(); return; }
  if (ds.iplug) { await linkAction({ type: 'plugin', name: ds.iplug, market: L.res.report.marketplace.name }, 'p:' + ds.iplug); return; }
  if (ds.accept) { const [name, sha] = ds.accept.split('|'); await linkAction({ type: 'plugin', name, market: L.res.report.marketplace.name, acceptSha: sha }, 'p:' + name); return; }
  if (ds.iagent) { await linkAction({ type: 'agent', agent: L.res.report.agents[+ds.iagent] }); return; }
  if (ds.imcp) {
    const k = ds.imcp, name = $('[data-mcpname="' + k + '"]').value.trim();
    let config; try { config = JSON.parse($('[data-mcpcfg="' + k + '"]').value); } catch { L.log.unshift({ ok: false, cmd: 'mcp', out: 'JSON inválido na configuração do MCP.' }); render(); return; }
    if (!name) { L.log.unshift({ ok: false, cmd: 'mcp', out: 'Dê um nome ao MCP.' }); render(); return; }
    await linkAction({ type: 'mcp', name, config }); return;
  }
  if (ds.rm) {
    if (L.confirm !== ds.rm) { L.confirm = ds.rm; render(); return; }
    const r = await window.ledger.installs.remove(ds.rm); L.confirm = '';
    L.log.unshift({ ok: r.ok, cmd: 'remover', out: r.out }); await refreshAfterInstall(); render(); return;
  }
  // perfis: exportar / importar / instalar requeridos
  if (t.id === 'pexp' && editing()) { await saveProfiles(); const r = await window.ledger.profiles.exportFile(editing()); if (r.ok) { S.pmsg = 'Exportado: ' + r.path; render(); } return; }
  if (t.id === 'pimp') { const r = await window.ledger.profiles.importFile(); if (r.ok) { await loadProfiles(); S.editId = r.id; S.pmsg = 'Perfil importado. Revise e aplique.'; } else if (r.error) S.pmsg = 'Erro: ' + r.error; render(); return; }
  if (ds.req) { const [source, id] = ds.req.split('|'); S.pmsg = 'Instalando ' + id + '…'; render(); const r = await window.ledger.installFrom(source, id.split('@')[0]); S.pmsg = (r.ok ? 'Instalado: ' : 'Falhou: ') + id + (r.ok ? '' : ' — ' + r.out.slice(0, 300)); await refreshAfterInstall(); render(); return; }
  const row = e.target.closest('tr[data-click]');
  if (row && row.dataset.click.startsWith('session:')) { S.session = row.dataset.click.slice(8); S.tab = 'audit'; render(); return; }
  const id = e.target.id;
  if (id === 'clrs') { S.session = ''; render(); }
  else if (id === 'csv') exportCsv(filtered());
  else if (id === 'addp') { S.D.pricing.push({ match: '', in: 0, out: 0 }); render(); }
  else if (id === 'resetp') { S.D.pricing = S.D.defaults.map((x) => ({ ...x })); render(); }
  else if (id === 'savep') { S.D.pricing = await window.ledger.setPricing(S.D.pricing); priceAll(); render(); }
  else if (e.target.dataset.del != null) { S.D.pricing.splice(+e.target.dataset.del, 1); render(); }
  // perfis
  const ed = e.target.closest('[data-edit]'); if (ed) { S.editId = ed.dataset.edit; S.plan = null; S.pmsg = ''; render(); return; }
  const p = editing();
  if (id === 'pnew') { const n = profileFromCurrent('Perfil ' + (S.P.profiles.length + 1)); S.P.profiles.push(n); S.editId = n.id; S.plan = null; await saveProfiles(); render(); }
  else if (id === 'pdup' && p) { const n = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + ' (cópia)' }; S.P.profiles.push(n); S.editId = n.id; await saveProfiles(); render(); }
  else if (id === 'pdel' && p) { if (p.id === S.P.active) { S.pmsg = 'Desvincule o perfil ativo antes de excluir.'; render(); return; } S.P.profiles = S.P.profiles.filter((x) => x !== p); S.editId = S.P.profiles[0] && S.P.profiles[0].id; await saveProfiles(); render(); }
  else if (id === 'psave') { await saveProfiles(); S.pmsg = 'Salvo (ainda não aplicado).'; render(); }
  else if (id === 'pplan' && p) { await saveProfiles(); S.plan = await window.ledger.profiles.plan(p); S.pmsg = ''; render(); }
  else if (id === 'pcancel') { S.plan = null; render(); }
  else if (id === 'papply' && p) { try { const r = await window.ledger.profiles.apply(p.id); S.plan = null; await loadProfiles(); S.pmsg = 'Aplicado. Abra uma sessão nova do Claude Code. Backup: ' + r.backup; } catch (err) { S.pmsg = 'Erro: ' + err.message; } render(); }
  else if (id === 'pdetach') { const r = await window.ledger.profiles.detach(); await loadProfiles(); S.pmsg = 'Desvinculado. Backup: ' + r.backup; render(); }
});
$('#view').addEventListener('change', (e) => {
  if (e.target.id === 'donutsel') { S.donut = e.target.value; render(); return; }
  if (e.target.dataset.pgsize) { const p = S.pg[e.target.dataset.pgsize]; if (e.target.value === 'auto') p.auto = true; else { p.auto = false; p.size = +e.target.value; } p.i = 0; render(); return; }
  if (e.target.id === 'xrev') { S.X.reviewed = e.target.checked; if (S.pg['x-plugins']) S.pg['x-plugins'].i = 0; render(); return; }
  if (e.target.id === 'xsort') { S.X.sort = e.target.value; if (S.pg['x-plugins']) S.pg['x-plugins'].i = 0; render(); return; }
  if (e.target.id === 'lack') { S.L.ack = e.target.checked; render(); return; }
  if (e.target.dataset.lsk != null) { const i = +e.target.dataset.lsk; if (e.target.checked) S.L.sel.add(i); else S.L.sel.delete(i); render(); return; }
  const d = e.target.dataset, p = editing(); if (!p) return;
  const on = e.target.checked;
  if (d.pb) p[d.pb] = on;
  else if (d.pl) p.disabledPlugins = toggle(p.disabledPlugins, d.pl, !on);
  else if (d.mcp) p.blockedMcp = toggle(p.blockedMcp, d.mcp, !on);
  else if (d.sk) p.blockedSkills = toggle(p.blockedSkills, d.sk, !on);
  else if (d.ss) p.startSkills = toggle(p.startSkills, d.ss, on);
  else if (d.pf === 'model') p.model = e.target.value;
  else return;
  S.plan = null;
});
$('#view').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('th[data-t]')) { openColMenu(e.target); return; }
  if (e.target.id === 'linkin' && e.key === 'Enter') analyzeLink();
  if (e.target.id === 'xq' && e.key === 'Enter' && S.X.src === 'mcp') { S.X.q = e.target.value; loadExplore(); }
});
async function analyzeLink() {
  const L = S.L, v = $('#linkin').value.trim();
  if (!v || L.busy) return;
  Object.assign(L, { input: v, busy: 'analyze', res: null, error: '', assist: null, ack: false, sel: new Set() });
  render();
  const r = await window.ledger.link.analyze(v);
  L.busy = '';
  if (r.ok) L.res = r; else L.error = r.error;
  render();
}
$('#view').addEventListener('input', (e) => {
  if (e.target.id === 'linkin') { S.L.input = e.target.value; return; }
  if (e.target.id === 'xq') {
    S.X.q = e.target.value;
    for (const k of ['x-plugins', 'x-com']) if (S.pg[k]) S.pg[k].i = 0;
    if (S.X.src !== 'mcp') { const p = e.target.selectionStart; render(); const n = $('#xq'); n.focus(); n.setSelectionRange(p, p); }
    return;
  }
  const d = e.target.dataset;
  if (d.pf === 'name' || d.pf === 'instructions') { const p = editing(); if (p) { p[d.pf] = e.target.value; S.plan = null; } return; }
  if (d.p == null) return;
  S.D.pricing[+d.p][d.f] = d.f === 'match' ? e.target.value : parseFloat(e.target.value) || 0;
});

load();
