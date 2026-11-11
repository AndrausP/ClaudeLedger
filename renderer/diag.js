'use strict';
/* global S, esc, ico, tag, tip, table, render, fDate, fPctBR, sparkline, dayKey, FX, need, LOADING, errBox, isErr, rkey */
// Dashboard de Diagnósticos: matriz regra × dia (elemento principal), faixa de gravidade, recortes por regra,
// projeto, agente e feedback. Tudo clicável: cada clique vira uma seleção que filtra a tabela de achados.

const RULE_NAME = {
  repeated_read: 'Leitura repetida', repeated_error: 'Erro repetido', high_compaction: 'Muitas compactações',
  latency_outlier: 'Ferramenta lenta', permission_denials: 'Operações negadas',
};
const RULE_HINT = {
  repeated_read: 'mesmo arquivo lido de novo sem mudança',
  repeated_error: 'mesma falha seguida, sem acerto entre elas',
  high_compaction: 'compactou acima do seu P90',
  latency_outlier: 'muito mais lenta que o normal dela',
  permission_denials: 'várias operações recusadas',
};
const SEVS = [['crítico', 'bad', 'var(--bad)'], ['atenção', 'warn', 'var(--warn)'], ['info', 'info', 'var(--c3)']];
const SEVW = { 'crítico': 3, 'atenção': 2, info: 1 };
const FB = [['util', 'Útil'], ['falso_positivo', 'Falso positivo'], ['ignorado', 'Ignorado'], ['', 'Sem resposta']];
S.DG = S.DG || { sel: {} };

const live = (f) => !['falso_positivo', 'ignorado'].includes(f.feedback);
const dayOf = (f) => dayKey(f.ev_at || f.session_start || f.created_at);

function selMatch(f, sel, skip) {
  const skips = [].concat(skip || []);
  for (const [k, v] of Object.entries(sel)) {
    if (skips.includes(k) || v == null || v === '') continue;
    if (k === 'rule' && f.rule_id !== v) return false;
    if (k === 'severity' && f.severity !== v) return false;
    if (k === 'day' && dayOf(f) !== v) return false;
    if (k === 'project' && (f.project || f.project_id) !== v) return false;
    if (k === 'agent' && !String(f.agents || '').split(',').includes(v)) return false;
    if (k === 'feedback' && (f.feedback || '') !== v) return false;
  }
  return true;
}
const selAttr = (k, v) => ' data-dg="' + esc(k) + '|' + esc(v) + '"' + (S.DG.sel[k] === v ? ' aria-pressed="true"' : '');

function viewDiagnosticos() {
  const list = need('diag|all|' + rkey(), 'diagnostics:list', { filter: FX() });
  if (list === undefined) return LOADING;
  if (isErr(list)) return errBox(list);
  const sel = S.DG.sel;
  const all = list;
  const active = all.filter(live);
  // cada recorte usa a seleção, exceto a sua própria dimensão (para continuar mostrando as alternativas)
  const scoped = (skip) => active.filter((f) => selMatch(f, sel, skip));

  // ---------- faixa de gravidade ----------
  const sevBase = scoped('severity');
  const sevCount = Object.fromEntries(SEVS.map(([s]) => [s, sevBase.filter((f) => f.severity === s).length]));
  const totalSev = sevBase.length || 1;
  const sessions = new Set(scoped().map((f) => f.session_id)).size;
  const fbAll = all.filter((f) => selMatch(f, sel, 'feedback'));
  const answered = fbAll.filter((f) => f.feedback).length;
  const fpRate = answered ? fbAll.filter((f) => f.feedback === 'falso_positivo').length / answered : null;
  const strip = '<div class="dgstrip">'
    + SEVS.map(([s, cls, col]) => '<button class="dgsev ' + cls + '"' + selAttr('severity', s) + ' style="flex:' + Math.max(sevCount[s], totalSev * 0.08) + '"><b>' + sevCount[s] + '</b><span>' + s + '</span><i style="background:' + col + '"></i></button>').join('')
    + '<div class="dgside"><div><b>' + sessions + '</b><span>sessões afetadas</span></div><div><b>' + (fpRate == null ? '—' : fPctBR(fpRate, 0)) + '</b><span>falsos positivos' + (answered ? ' (' + answered + ' respondidos)' : '') + '</span></div></div></div>';

  // ---------- matriz regra × dia ----------
  // a matriz ignora a própria seleção (regra/dia) para continuar mostrando o contexto
  const hmBase = scoped(['day', 'rule']);
  const f = FX();
  const lastDay = f.to || Date.now();
  let firstDay = f.from || Math.min(lastDay - 29 * 864e5, ...hmBase.map((x) => x.ev_at || x.session_start || lastDay));
  if ((lastDay - firstDay) / 864e5 > 62) firstDay = lastDay - 61 * 864e5; // no máximo ~2 meses visíveis
  const days = [];
  for (let t = new Date(dayKey(firstDay) + 'T12:00:00').getTime(); dayKey(t) <= dayKey(lastDay); t += 864e5) days.push(dayKey(t));
  const rules = [...new Set([...Object.keys(RULE_NAME), ...hmBase.map((x) => x.rule_id)])];
  const cell = {};
  for (const x of hmBase) {
    const k = x.rule_id + '|' + dayOf(x);
    const c = cell[k] || (cell[k] = { n: 0, w: 0, sessions: new Set() });
    c.n++; c.w = Math.max(c.w, SEVW[x.severity]); c.sessions.add(x.session_id);
  }
  const maxN = Math.max(1, ...Object.values(cell).map((c) => c.n));
  const colOf = (w) => (w === 3 ? '242,104,95' : w === 2 ? '245,195,91' : '91,192,235');
  const step = Math.max(1, Math.ceil(days.length / 8));
  const heat = '<div class="dgheat" style="grid-template-columns: 170px repeat(' + days.length + ', minmax(10px, 1fr))">'
    + '<div class="dghc"></div>' + days.map((d, i) => '<div class="dghd' + (sel.day === d ? ' on' : '') + '"' + selAttr('day', d) + ' title="' + d + '">' + (i % step === 0 ? d.slice(8) + '/' + d.slice(5, 7) : '') + '</div>').join('')
    + rules.map((r) => '<button class="dghr' + (sel.rule === r ? ' on' : '') + '"' + selAttr('rule', r) + '><b>' + esc(RULE_NAME[r] || r) + '</b><span>' + esc(r) + '</span></button>'
      + days.map((d) => {
        const c = cell[r + '|' + d];
        if (!c) return '<div class="dgc empty' + (sel.day === d ? ' col' : '') + '"></div>';
        const a = 0.25 + 0.75 * (c.n / maxN);
        return '<button class="dgc' + (sel.rule === r && sel.day === d ? ' on' : '') + '" data-dgcell="' + esc(r) + '|' + d + '" style="background:rgba(' + colOf(c.w) + ',' + a.toFixed(2) + ')"'
          + tip((RULE_NAME[r] || r) + ' · ' + d.split('-').reverse().join('/'), [['Achados', String(c.n), 'rgb(' + colOf(c.w) + ')'], ['Sessões', String(c.sessions.size)], ['Maior gravidade', ['', 'info', 'atenção', 'crítico'][c.w]]]) + '>' + (c.n > 1 ? c.n : '') + '</button>';
      }).join('')).join('')
    + '</div>';

  // ---------- regras ----------
  const rBase = scoped('rule');
  const ruleRows = rules.map((r) => {
    const fs = rBase.filter((x) => x.rule_id === r);
    const allR = all.filter((x) => x.rule_id === r && selMatch(x, sel, 'rule'));
    const ans = allR.filter((x) => x.feedback).length, fp = allR.filter((x) => x.feedback === 'falso_positivo').length;
    const pts = days.map((d) => ({ k: d, v: (cell[r + '|' + d] || { n: 0 }).n }));
    const worst = Math.max(0, ...fs.map((x) => SEVW[x.severity]));
    return '<button class="dgrule' + (sel.rule === r ? ' on' : '') + '"' + selAttr('rule', r) + '><div class="dgrh"><b>' + esc(RULE_NAME[r] || r) + '</b>' + (worst ? tag(['', 'info', 'warn', 'bad'][worst], ['', 'info', 'atenção', 'crítico'][worst]) : '') + '<em>' + fs.length + '</em></div>'
      + '<div class="dgrs">' + esc(RULE_HINT[r] || '') + '</div>'
      + '<div class="dgrspark">' + sparkline(pts, 'var(--accent)', (v) => v + ' achado(s)') + '</div>'
      + '<div class="dgrs">' + new Set(fs.map((x) => x.session_id)).size + ' sessão(ões) · ' + (ans ? fPctBR(fp / ans, 0) + ' falso positivo' : 'sem feedback') + '</div></button>';
  }).join('');

  // ---------- recortes por projeto / agente / feedback ----------
  const bars = (title, key, pairs, labelOf) => {
    const max = Math.max(1, ...pairs.map((p) => p[1]));
    return '<div class="card"><div class="card-h"><b>' + title + '</b></div>' + (pairs.length ? pairs.slice(0, 8).map(([k, n]) => '<button class="dgbar' + (sel[key] === k ? ' on' : '') + '"' + selAttr(key, k) + '><span>' + esc(labelOf ? labelOf(k) : k) + '</span><i><s style="width:' + (n / max) * 100 + '%"></s></i><em>' + n + '</em></button>').join('') : '<div class="note">Nada no recorte atual.</div>') + '</div>';
  };
  const countBy = (arr, fn) => { const m = new Map(); for (const x of arr) for (const k of [].concat(fn(x)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const projPairs = countBy(scoped('project'), (x) => x.project || x.project_id);
  const agPairs = countBy(scoped('agent'), (x) => String(x.agents || '').split(','));
  const fbPairs = FB.map(([k]) => [k, all.filter((x) => selMatch(x, sel, 'feedback') && (x.feedback || '') === k).length]).filter((p) => p[1]);
  const fbLabel = (k) => (FB.find((f2) => f2[0] === k) || [k, k])[1];

  // ---------- seleção + tabela ----------
  const selChips = Object.entries(sel).filter(([, v]) => v != null);
  const LBL = { rule: 'Regra', severity: 'Gravidade', day: 'Dia', project: 'Projeto', agent: 'Agente', feedback: 'Feedback' };
  const showVal = (k, v) => (k === 'rule' ? RULE_NAME[v] || v : k === 'day' ? v.split('-').reverse().join('/') : k === 'feedback' ? fbLabel(v) : v);
  const selBar = '<div class="dgsel">' + (selChips.length
    ? ico('filter') + selChips.map(([k, v]) => '<span class="chip"><b>' + LBL[k] + '</b> ' + esc(showVal(k, v)) + '<button data-dgdel="' + k + '" aria-label="Remover">' + ico('x') + '</button></span>').join('') + '<button class="linkbtn" data-dgdel="*">Limpar seleção</button>'
    : '<span class="note">Clique em qualquer célula, regra, barra ou gravidade para detalhar. Os achados abaixo seguem a seleção.</span>')
    + '<button class="btn sm" data-v-recompute="*">' + ico('pulse') + 'Recalcular</button></div>';
  const rows = all.filter((x) => selMatch(x, sel) && (sel.feedback != null || live(x))).map((x) => ({
    ...x, sev: SEVW[x.severity], rname: RULE_NAME[x.rule_id] || x.rule_id, sess: x.session_title || 'Sessão ' + x.session_id.slice(0, 8), fbk: fbLabel(x.feedback || ''), at: x.ev_at || x.session_start, _click: 'v-diag:' + x.session_id,
  }));
  const cols = [
    { k: 'sev', label: 'Gravidade', fv: (r) => r.severity, f: (r) => tag({ 'crítico': 'bad', 'atenção': 'warn', info: 'info' }[r.severity], r.severity) },
    { k: 'rname', label: 'Regra', l: 1 },
    { k: 'title', label: 'Achado', l: 1, cls: 'name', type: 'text' },
    { k: 'agents', label: 'Agentes', l: 1, type: 'text', fv: (r) => r.agents || '', f: (r) => esc(String(r.agents || '—').split(',').join(', ')) },
    { k: 'sess', label: 'Sessão', l: 1, cls: 'name', type: 'text' },
    { k: 'project', label: 'Projeto', l: 1 },
    { k: 'at', label: 'Quando', type: 'date', f: (r) => fDate(r.at) },
    { k: 'fbk', label: 'Feedback', l: 1 },
  ];

  return '<p class="sub">Padrões que podem indicar desperdício, detectados por regras fixas. Recomendações são hipóteses: marque falso positivo quando não fizer sentido.</p>'
    + strip
    + '<div class="dgmain"><div class="card dgheatcard"><div class="card-h"><b>Regra × dia</b><span class="note">cor = gravidade mais alta · intensidade = quantidade</span></div>' + heat + '</div>'
    + '<div class="dgrules">' + ruleRows + '</div></div>'
    + '<div class="grid3">' + bars('Por projeto', 'project', projPairs) + bars('Por agente', 'agent', agPairs) + bars('Feedback', 'feedback', fbPairs, fbLabel) + '</div>'
    + selBar
    + table('dg-list', cols, rows, 'sev', { empty: 'Nenhum achado nesta seleção.' });
}

document.getElementById('view').addEventListener('click', (e) => {
  const c = e.target.closest('[data-dgcell]');
  if (c) {
    const [r, d] = c.dataset.dgcell.split('|');
    const same = S.DG.sel.rule === r && S.DG.sel.day === d;
    S.DG.sel = { ...S.DG.sel, rule: same ? null : r, day: same ? null : d };
    if (S.pg['dg-list']) S.pg['dg-list'].i = 0;
    render(); return;
  }
  const b = e.target.closest('[data-dg]');
  if (b) {
    const i = b.dataset.dg.indexOf('|'), k = b.dataset.dg.slice(0, i), v = b.dataset.dg.slice(i + 1);
    S.DG.sel = { ...S.DG.sel, [k]: S.DG.sel[k] === v ? null : v };
    if (S.pg['dg-list']) S.pg['dg-list'].i = 0;
    render(); return;
  }
  const del = e.target.closest('[data-dgdel]');
  if (del) {
    if (del.dataset.dgdel === '*') S.DG.sel = {}; else S.DG.sel = { ...S.DG.sel, [del.dataset.dgdel]: null };
    render();
  }
});
