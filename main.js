'use strict';
const { app, BrowserWindow, ipcMain, nativeTheme, dialog } = require('electron');
const crypto = require('crypto');
const I = require('./src/installer');
const C = require('./src/catalog');
const path = require('path');
const fs = require('fs');
const { loadAll } = require('./src/parser');
const { getInventory } = require('./src/inventory');
const { createStore } = require('./src/profiles');

// USD por 1M tokens. Estimativas editáveis na aba Preços — confira na tabela oficial da Anthropic.
// `match` = trecho do id do modelo; vale a primeira linha que casar.
const DEFAULT_PRICING = [
  { match: 'fable',      in: 10,   out: 50 },
  { match: 'opus-5',     in: 5,    out: 25 },
  { match: 'opus-4-5',   in: 5,    out: 25 },
  { match: 'opus',       in: 15,   out: 75 },
  { match: 'sonnet',     in: 3,    out: 15 },
  { match: 'haiku-3-5',  in: 0.8,  out: 4 },
  { match: 'haiku',      in: 1,    out: 5 },
];

// Pasta de dados FIXA: o nome não pode depender de productName/package name, senão uma atualização
// "perde" perfis, preços e histórico. Migra (copia) o que existir na pasta antiga e faltar na nova.
(function pinUserData() {
  const appData = app.getPath('appData');
  const target = path.join(appData, 'Claude Ledger');
  app.setPath('userData', target);
  const legacy = path.join(appData, 'claude-ledger');
  if (!fs.existsSync(legacy)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['pricing.json', 'profiles.json', 'installs.json', 'config.json', 'analyses.json', 'backups', 'statusline']) {
    const from = path.join(legacy, name), to = path.join(target, name);
    if (fs.existsSync(from) && !fs.existsSync(to)) { try { fs.cpSync(from, to, { recursive: true }); } catch { /* segue sem esse arquivo */ } }
  }
})();

const pricingFile = () => path.join(app.getPath('userData'), 'pricing.json');
const cacheFile = () => path.join(app.getPath('userData'), 'cache.json');

function readPricing() {
  try { return JSON.parse(fs.readFileSync(pricingFile(), 'utf8')); } catch { return DEFAULT_PRICING; }
}

let win;
function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1100, minHeight: 640,
    title: 'Claude Ledger', backgroundColor: '#000000', autoHideMenuBar: true,
    icon: path.join(__dirname, 'renderer', 'logo.png'), // ícone da janela/barra de tarefas (o .exe usa build/icon.png)
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.LEDGER_SHOT) shoot(process.env.LEDGER_SHOT); // verificação: salva PNG de cada aba e sai
}

async function shoot(dir) {
  const wc = win.webContents;
  const errs = [];
  const log = (m) => errs.push(m);
  const snap = async (name) => {
    try { fs.writeFileSync(path.join(dir, name + '.png'), (await wc.capturePage(undefined, { stayHidden: true })).toPNG()); }
    catch (e) { log(`captura ${name}: ${e.message}`); }
  };
  const step = async (js, ms = 500) => { await wc.executeJavaScript(js); await new Promise((r) => setTimeout(r, ms)); };
  try {
    await new Promise((r) => wc.once('did-finish-load', r));
    wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') log(e.message); });
    win.show(); win.focus();
    await new Promise((r) => setTimeout(r, 9000));
    log('fonts -> ' + await wc.executeJavaScript(`document.fonts.ready.then(() => 'Inter=' + document.fonts.check('600 15px Inter') + ' Mono=' + document.fonts.check('12px "Source Code Pro"') + ' carregadas=' + [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(','))`));
    for (const t of ['geral', 'agentes', 'modelos', 'ext', 'sessoes', 'audit', 'precos']) {
      await step(`document.querySelector('[data-tab=${t}]').click()`, 900);
      log('tab ' + t + ' -> ' + await wc.executeJavaScript("document.getElementById('ptitle').textContent"));
      await snap(t);
    }
    // perfis: cria, mostra prévia (sem aplicar), captura e apaga
    await step(`document.querySelector('[data-tab=perfis]').click()`);
    await step(`document.getElementById('pnew').click()`);
    await step(`document.querySelector('[data-pb=caveman]').click(); document.querySelector('[data-pb=nirvana]').click(); document.getElementById('pplan').click()`, 1200);
    log('perfis -> ' + await wc.executeJavaScript("document.getElementById('ptitle').textContent + ' / plan=' + !!document.querySelector('.plan')"));
    await snap('perfis');
    await step(`document.getElementById('pcancel').click(); document.getElementById('pdel').click()`);
    // adicionar por link: só analisa, não instala
    await step(`S.X.src = 'link'; document.querySelector('[data-tab=explore]').click()`);
    await step(`document.getElementById('linkin').value = 'JuliusBrussee/caveman'; document.getElementById('lgo').click()`, 1000);
    for (let i = 0; i < 90; i++) { if (await wc.executeJavaScript(`!document.getElementById('lgo') || !document.getElementById('lgo').disabled`)) break; await new Promise((r) => setTimeout(r, 1000)); }
    await new Promise((r) => setTimeout(r, 600));
    log('add -> ' + await wc.executeJavaScript(`(document.querySelector('.card-h b')||{}).textContent + ' | risks=' + document.querySelectorAll('.hrow .tag').length + ' | install btns=' + document.querySelectorAll('[data-iplug]').length + ' disabled=' + [...document.querySelectorAll('[data-iplug]')].every(b=>b.disabled)`));
    await snap('add');
    await step(`document.getElementById('lack') && document.getElementById('lack').click()`, 600);
    log('after ack disabled=' + await wc.executeJavaScript(`[...document.querySelectorAll('[data-iplug]')].every(b=>b.disabled)`));
    // popup: simula mouse sobre um ponto do gráfico principal e um arco do donut
    await step(`document.querySelector('[data-tab=geral]').click()`, 900);
    const hover = (sel, idx) => `(() => { const els = document.querySelectorAll('${sel}'); const el = els[${idx}] || els[0]; const b = el.getBoundingClientRect(); const r = el.querySelector('rect') || el;
      r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }));
      r.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }));
      el.classList.add('force'); const t = document.getElementById('tip'); return t.classList.contains('on') + ' | ' + t.innerText.replace(/\\n/g, ' / '); })()`;
    log('hover chart -> ' + await wc.executeJavaScript(hover('.card .hz', 22)));
    await new Promise((r) => setTimeout(r, 300));
    await snap('hover');
    log('hover donut -> ' + await wc.executeJavaScript(hover('.seg-arc', 0)));
    log('hover kpi -> ' + await wc.executeJavaScript(hover('.kpi .hz', 25)));
    // explorar
    await step(`document.querySelector('[data-tab=explore]').click()`, 2500);
    log('explore plugins -> ' + await wc.executeJavaScript(`document.querySelectorAll('.xitem').length + ' itens | ' + (document.querySelector('.note')||{}).textContent`));
    await snap('explore');
    await step(`document.querySelector('[data-xsrc=mcp]').click()`, 6000);
    log('explore mcp -> ' + await wc.executeJavaScript(`document.querySelectorAll('.xitem').length + ' itens'`));
    await step(`document.querySelector('[data-xmopen]') && document.querySelector('[data-xmopen]').click()`, 600);
    await snap('explore-mcp');
    // paginação + abas segmentadas
    await step(`document.querySelector('[data-tab=ext]').click()`, 600);
    await step(`document.querySelector('[data-sub=skills]').click()`, 600);
    const pinfo = `(document.querySelector('.pinfo')||{}).innerText + ' | linhas=' + document.querySelectorAll('.tcard tbody tr').length + ' | ativa=' + (document.querySelector('.pager button.on')||{}).innerText`;
    log('ext skills p1 -> ' + await wc.executeJavaScript(pinfo));
    await snap('pager');
    const pagerY = `Math.round(document.querySelector('.tcard.fixed .pager').getBoundingClientRect().bottom)`;
    log('ext skills pager bottom=' + await wc.executeJavaScript(pagerY) + ' | scroll da página=' + await wc.executeJavaScript(`document.getElementById('view').scrollHeight - document.getElementById('view').clientHeight`));
    await step(`document.querySelector('[data-sub=mcp]').click()`, 600);
    log('ext mcp -> ' + await wc.executeJavaScript(pinfo) + ' | pager bottom=' + await wc.executeJavaScript(pagerY));
    await snap('pager-few');
    // filtro de lista na coluna Status (skills): tira "nunca usado"
    await step(`document.querySelector('[data-sub=skills]').click()`, 600);
    await step(`document.querySelector('th[data-k=status]').click()`, 400);
    log('menu status -> ' + await wc.executeJavaScript(`document.querySelector('#colmenu .cm-title').innerText.replace(/\\n/g,' ') + ' | opções=' + [...document.querySelectorAll('#colmenu .cm-opt span')].map(s=>s.innerText).join(',')`));
    await snap('menu');
    await step(`[...document.querySelectorAll('#colmenu .cm-opt')].forEach(o => { if (o.innerText.includes('nunca usado')) o.querySelector('input').checked = false; }); document.querySelector('[data-cmapply]').click()`, 600);
    log('filtro status -> ' + await wc.executeJavaScript(pinfo + ` + ' | chips=' + document.querySelectorAll('.chip').length + ' | th filtrado=' + !!document.querySelector('th.filtered') + ' | pager bottom=' + ${pagerY}`));
    await snap('filter');
    // auditoria: filtro de data + ordenar crescente por custo
    await step(`S.AU.sub = 'responses'; document.querySelector('[data-tab=audit]').click()`, 800);
    for (let i = 0; i < 50 && !(await wc.executeJavaScript(`!!document.querySelector('th[data-k=at]')`)); i++) await new Promise((r) => setTimeout(r, 300));
    await step(`document.querySelector('th[data-k=at]').click()`, 400);
    await step(`document.querySelector('.cm-from').value='2026-11-10'; document.querySelector('.cm-to').value='2026-11-10'; document.querySelector('[data-cmapply]').click()`, 600);
    log('audit data 10/11 -> ' + await wc.executeJavaScript(pinfo + ` + ' | ' + document.querySelector('.chip').innerText`));
    await step(`document.querySelector('th[data-k=cost]').click()`, 300);
    await step(`document.querySelector('[data-cms=desc]').click()`, 500);
    log('audit custo desc 1a linha -> ' + await wc.executeJavaScript(`[...document.querySelectorAll('.tcard tbody tr:first-child td')].map(t=>t.innerText).slice(0,9).join(' | ')`));
    await snap('pager-audit');
    await step(`document.querySelector('[data-fclr]').click()`, 400);
    // explorar paginado
    await step(`S.X.src = 'plugins'; document.querySelector('[data-tab=explore]').click()`, 1500);
    await step(`document.querySelector('[data-xsrc=plugins]').click()`, 1500);
    log('explore pager -> ' + await wc.executeJavaScript(`(document.querySelector('.pinfo')||{}).innerText + ' | itens na página=' + document.querySelectorAll('.pbody .xitem').length`));
    await snap('explore');
    // ===== especificação v1 =====
    const until = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await wc.executeJavaScript(js)) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
    const txt = (sel) => wc.executeJavaScript(`(document.querySelector('${sel}')||{innerText:'(nada)'}).innerText.replace(/\\s+/g,' ').slice(0,220)`);
    await step(`document.querySelector('[data-tab=sessoes]').click()`, 300);
    log('v1 sessões carregou=' + await until(`document.querySelectorAll('tr[data-click^="v-session"]').length > 0`) + ' | ' + await txt('.pinfo') + ' | tela: ' + await txt('#view'));
    await snap('v1-sessoes');
    await step(`[...document.querySelectorAll('tr[data-click^="v-session"]')][0].click()`, 300);
    log('v1 detalhe=' + await until(`!!document.querySelector('.tev')`) + ' | ' + await txt('.smeta') + ' | eventos=' + await wc.executeJavaScript(`document.querySelectorAll('.tev').length`));
    await step(`document.querySelector('.tev').click()`, 300);
    log('v1 inspetor=' + await until(`!!document.querySelector('.insp .irow')`) + ' | ' + await txt('.insp'));
    await snap('v1-timeline');
    await step(`document.querySelector('[data-v-stab=diag]').click()`, 800);
    log('v1 diag aba=' + await txt('.dsum'));
    await step(`document.querySelector('[data-v-stab=changes]').click()`, 300);
    await until(`!document.querySelector('.spin')`, 15000);
    log('v1 mudanças=' + await txt('.grid2'));
    await snap('v1-changes');
    await step(`document.querySelector('[data-v-stab=costs]').click()`, 600);
    log('v1 custos sessão=' + await txt('.grid2'));
    await step(`document.querySelector('[data-tab=diagnosticos]').click()`, 300);
    log('v1 diagnósticos=' + await until(`document.querySelectorAll('tr[data-click^="v-diag"]').length > 0`) + ' | ' + await txt('.dsum'));
    await snap('v1-diag');
    log('dg faixa=' + await txt('.dgstrip') + ' | células=' + await wc.executeJavaScript(`document.querySelectorAll('.dgc:not(.empty)').length`) + ' | regras=' + await wc.executeJavaScript(`document.querySelectorAll('.dgrule').length`));
    const before = await txt('#view .pinfo');
    await step(`[...document.querySelectorAll('.dgc:not(.empty)')].sort((a,b)=>(+b.textContent||1)-(+a.textContent||1))[0].click()`, 500);
    log('dg célula → seleção=' + await txt('.dgsel') + ' | tabela antes=' + before + ' depois=' + await txt('#view .pinfo'));
    await snap('dg-cell');
    await step(`document.querySelector('.dgsel [data-dgdel="*"]').click()`, 300);
    await step(`document.querySelector('.dgsev.bad').click()`, 400);
    log('dg crítico → ' + await txt('#view .pinfo') + ' | 1ª linha=' + await txt('.tcard tbody tr'));
    await step(`document.querySelector('.dgsel [data-dgdel="*"]').click()`, 300);
    await step(`document.querySelector('tr[data-click^="v-diag"]').click()`, 300);
    await until(`!!document.querySelector('.fact [data-v-goev]')`);
    await step(`document.querySelector('.fact [data-v-goev]').click()`, 1200);
    log('v1 ir à evidência: destacado=' + await until(`!!document.querySelector('.tev.hl')`, 8000) + ' | inspetor=' + await txt('.insp .ihead'));
    log('v1 debug evidência: ' + await wc.executeJavaScript(`JSON.stringify({ hl: S.V.hl, sid: S.V.sid, pg: S.pg['v-tl'], ids: [...document.querySelectorAll('.tev')].map(e => +e.dataset.vEv), info: (document.querySelector('.tlpanel .pinfo')||{}).innerText })`));
    await snap('v1-evidence');
    await step(`document.querySelector('[data-tab=eficiencia]').click()`, 300);
    log('v1 eficiência=' + await until(`!!document.querySelector('.mcards')`) + ' | ' + await txt('.mcards'));
    await snap('v1-eficiencia');
    await step(`document.querySelector('[data-tab=custos]').click()`, 300);
    log('v1 custos=' + await until(`!!document.querySelector('.mcards')`) + ' | ' + await txt('.mcards'));
    await snap('v1-custos');
    await step(`document.querySelector('[data-tab=assuntos]').click()`, 300);
    log('v1 assuntos=' + await until(`!!document.querySelector('.mcards')`) + ' | ' + await txt('.mcards'));
    await step(`document.querySelector('[data-tab=config]').click()`, 300);
    log('v1 config=' + await until(`!!document.querySelector('.srow')`) + ' | ' + await txt('.card'));
    await snap('v1-config');
    await step(`document.querySelector('[data-tab=geral]').click()`, 1000);
    log('v1 geral alerta=' + await txt('.banner') + ' | hash=' + await wc.executeJavaScript('location.hash'));
    // ajuda: todas as telas abrem o modal com conteúdo; Esc fecha
    const helpRes = await wc.executeJavaScript(`(async () => {
      const out = [];
      for (const b of [...document.querySelectorAll('#tabs [data-tab]')]) {
        b.click(); await new Promise(r => setTimeout(r, 250));
        document.getElementById('helpbtn').click(); await new Promise(r => setTimeout(r, 120));
        const m = document.getElementById('helpmodal');
        out.push(b.dataset.tab + ':' + (!m.hidden) + ':' + m.querySelectorAll('section').length + ':' + (m.querySelector('.hintro').textContent.length > 20));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await new Promise(r => setTimeout(r, 80));
        if (!m.hidden) out.push('NAO-FECHOU:' + b.dataset.tab);
      }
      return out.join(' ');
    })()`);
    log('ajuda -> ' + helpRes);
    // ===== v2: filtros, agentes, auditoria, limites, GitHub =====
    await step(`S.V.sid = null; document.querySelector('[data-tab=geral]').click()`, 800);
    log('v2 barra filtros=' + await wc.executeJavaScript(`document.querySelectorAll('#fmod .fctl').length + ' controles | agentes=' + document.querySelectorAll('#fmod [data-f=agent] option').length + ' modelos=' + document.querySelectorAll('#fmod [data-f=model] option').length`) + ' | limites=' + await txt('.limcard'));
    await snap('v2-geral');
    // aplica filtro de agente + período personalizado e confere chips/URL
    await step(`(() => { const s = document.querySelector('#fmod [data-f=agent]'); s.value = 'main'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`, 500);
    await step(`(() => { const s = document.querySelector('#fmod [data-f=period]'); s.value = 'c'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`, 500);
    log('v2 filtros ativos=' + await txt('#fmod .frow2') + ' | url=' + await wc.executeJavaScript('location.hash'));
    await step(`document.querySelector('[data-tab=agentes]').click()`, 300);
    log('v2 agentes(filtrado)=' + await until(`document.querySelectorAll('tr[data-click^="v2-agent"]').length > 0`) + ' | linhas=' + await wc.executeJavaScript(`document.querySelectorAll('tr[data-click^="v2-agent"]').length`));
    await step(`document.querySelector('#fmod [data-fclear="*"]').click()`, 400);
    await until(`document.querySelectorAll('tr[data-click^="v2-agent"]').length > 1`);
    log('v2 agentes(sem filtro)=' + await wc.executeJavaScript(`document.querySelectorAll('tr[data-click^="v2-agent"]').length`) + ' | ' + await txt('.mcards'));
    await snap('v2-agentes');
    await step(`[...document.querySelectorAll('tr[data-click^="v2-agent"]')].find(r => r.dataset.click === 'v2-agent:main').click()`, 300);
    log('v2 agente main=' + await until(`!!document.querySelector('[data-v2-asub]')`) + ' | ' + await txt('.mcards'));
    await snap('v2-agente-resumo');
    await step(`document.querySelector('[data-v2-asub=tools]').click()`, 600);
    log('v2 o que chamou=' + await txt('.tcard tbody tr'));
    await snap('v2-agente-tools');
    // auditoria: submódulos
    await step(`document.querySelector('[data-tab=audit]').click()`, 300);
    for (const sub of ['overview', 'agents', 'responses', 'tools', 'errors']) {
      await step(`document.querySelector('[data-v2-ausub=${sub}]').click()`, 300);
      const ok = await until(sub === 'overview' ? `!!document.querySelector('.mcards')` : `document.querySelectorAll('.tcard tbody tr:not(.emptyrow)').length > 0`, 15000);
      log('v2 auditoria ' + sub + '=' + ok + ' | ' + await txt(sub === 'overview' ? '.mcards' : '.pinfo'));
      if (sub === 'overview' || sub === 'tools') await snap('v2-audit-' + sub);
    }
    await step(`document.querySelector('.tcard tbody tr[data-click^="v2-ev"]').click()`, 1500);
    log('v2 ferramenta → evidência=' + await until(`!!document.querySelector('.tev.hl')`, 8000));
    // explorar: GitHub
    await step(`S.X.src = 'github'; document.querySelector('[data-tab=explore]').click()`, 300);
    log('v2 github=' + await until(`document.querySelectorAll('.pbody .xitem').length > 0`, 20000) + ' | ' + await txt('.ghinfo') + ' | 1º=' + await txt('.pbody .xitem .xname'));
    await snap('v2-github');
    await step(`document.querySelector('[data-v2-ghmode=skill]').click()`, 300);
    log('v2 github skills=' + await until(`!document.querySelector('.spin') && document.querySelectorAll('.pbody .xitem').length > 0`, 20000) + ' | 1º=' + await txt('.pbody .xitem .xname'));
    await step(`document.querySelector('[data-pg="x-gh|1"]') && document.querySelector('[data-pg="x-gh|1"]').click()`, 300);
    log('v2 github página 2=' + await until(`document.querySelector('.pager button.on') && document.querySelector('.pager button.on').innerText === '2'`, 20000));
    // excluir projetos: abre o seletor, marca o 1º projeto e confere a etiqueta + efeito em Sessões
    await step(`S.V.sid = null; document.querySelector('[data-tab=sessoes]').click()`, 400);
    await until(`document.querySelectorAll('tr[data-click^="v-session"]').length > 0`);
    const sessBefore = await txt('#view .pinfo');
    await step(`document.querySelector('[data-fexopen]').click()`, 300);
    await snap('exclude-panel');
    await step(`(() => { const c = document.querySelector('[data-fex]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`, 1200);
    await until(`!document.querySelector('.spin')`, 10000);
    log('excluir projeto: antes=' + sessBefore + ' depois=' + await txt('#view .pinfo') + ' | etiqueta=' + await txt('#fmod .frow2') + ' | url=' + await wc.executeJavaScript('location.hash'));
    await step(`document.querySelector('#fmod [data-fclear="*"]').click()`, 400);
    await step(`S.V.sid = null; document.querySelector('[data-tab=sessoes]').click()`, 400);
    await until(`document.querySelectorAll('tr[data-click^="v-session"]').length > 0`);
    await step(`document.querySelector('tr[data-click^="v-session"]').click()`, 300);
    await until(`!!document.querySelector('[data-v-stab=changes]')`);
    await step(`document.querySelector('[data-v-stab=changes]').click()`, 400);
    await step(`document.getElementById('helpbtn').click()`, 300);
    log('ajuda sessão/mudanças 1ª seção -> ' + await txt('#helpmodal section h3'));
    await snap('help');
    await step(`document.querySelector('#helpmodal .hclose').click()`, 200);
  } catch (e) { log('shoot: ' + e.message); }
  fs.writeFileSync(path.join(dir, 'errors.txt'), errs.join('\n'));
  app.quit();
}

ipcMain.handle('ledger:load', async (e) => {
  const { records, fileCount } = await loadAll(cacheFile(), (d, t) => e.sender.send('ledger:progress', { d, t }));
  return { records, fileCount, inventory: getInventory(), pricing: readPricing(), defaults: DEFAULT_PRICING };
});
// ---- config simples em userData ----
const cfgPath = (f) => path.join(app.getPath('userData'), f);
const readCfg = (f, d) => { try { return JSON.parse(fs.readFileSync(cfgPath(f), 'utf8')); } catch { return d; } };
const writeCfg = (f, v) => fs.writeFileSync(cfgPath(f), JSON.stringify(v, null, 2));
ipcMain.handle('config:get', () => readCfg('config.json', { registryUrl: '' }));
ipcMain.handle('config:set', (_e, c) => {
  const url = String((c && c.registryUrl) || '').trim();
  if (url && !/^https:\/\//.test(url)) return { ok: false, error: 'O registry precisa ser https.' };
  writeCfg('config.json', { ...readCfg('config.json', {}), registryUrl: url });
  return { ok: true };
});

// ---- explorar ----
ipcMain.handle('catalog:plugins', () => C.plugins());
ipcMain.handle('catalog:mcp', async (_e, q) => { try { return { ok: true, items: await C.mcpSearch(String(q || '').slice(0, 100)) }; } catch (err) { return { ok: false, error: err.message, items: [] }; } });
ipcMain.handle('catalog:community', async () => { try { return { ok: true, ...(await C.community(readCfg('config.json', {}).registryUrl)) }; } catch (err) { return { ok: false, error: err.message, items: [] }; } });
ipcMain.handle('mcp:add', async (_e, { name, config }) => {
  if (!/^[\w.-]{1,64}$/.test(String(name))) return { ok: false, out: 'Nome inválido (use letras, números, ponto, hífen).' };
  const r = await I.installMcp(name, config, 'user');
  if (r.ok) logInstall({ type: 'mcp', id: name, scope: 'user', source: 'registry MCP' });
  return r;
});
ipcMain.handle('plugin:update', (_e, id) => I.update(String(id)));
ipcMain.handle('profiles:exportProject', async (_e, p) => {
  const r = await dialog.showOpenDialog(win, { title: 'Pasta do projeto (raiz do repositório)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try { return store.exportToProject(p, r.filePaths[0], pluginKeys()); } catch (err) { return { ok: false, error: err.message }; }
});

// ---- adicionar por link ----
const sessions = new Map(); // token -> { n, dir, sha }
const installsFile = () => path.join(app.getPath('userData'), 'installs.json');
const readInstalls = () => { try { return JSON.parse(fs.readFileSync(installsFile(), 'utf8')); } catch { return []; } };
const logInstall = (e) => { const l = readInstalls(); l.unshift({ ...e, at: Date.now(), key: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }); fs.writeFileSync(installsFile(), JSON.stringify(l, null, 2)); };

ipcMain.handle('inventory:get', () => getInventory());
ipcMain.handle('link:analyze', async (_e, input) => {
  try {
    const n = I.normalize(input);
    const { dir, sha } = await I.clone(n, app.getPath('userData'));
    const report = await I.inspect(dir, n);
    const token = crypto.randomBytes(8).toString('hex');
    sessions.set(token, { n, dir, sha });
    // selo: compara com a última análise desta mesma fonte
    const hist = readCfg('analyses.json', {});
    const key = n.source + (n.sub ? '/' + n.sub : '');
    const snap = { sha, at: Date.now(), hooks: report.hooks.map((h) => h.event + ': ' + h.command).sort(), mcp: report.mcp.map((m) => m.name + ' ' + JSON.stringify(m.config)).sort(), scripts: report.risks.filter((r) => /script/.test(r.text)).map((r) => r.text) };
    const prev = hist[key];
    let changes = null;
    if (prev && prev.sha !== sha) {
      const diff = (a = [], b = []) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });
      changes = { fromSha: prev.sha, at: prev.at, hooks: diff(prev.hooks, snap.hooks), mcp: diff(prev.mcp, snap.mcp) };
    } else if (prev) changes = { same: true, at: prev.at };
    hist[key] = snap; writeCfg('analyses.json', hist);
    return { ok: true, token, n, sha, report, changes };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('link:install', async (_e, { token, action }) => {
  const s = sessions.get(token);
  if (!s) return { ok: false, out: 'Análise expirou — cole o link de novo.' };
  try {
    let r;
    const meta = { source: s.n.source, sha: s.sha };
    if (action.type === 'plugin') {
      r = await I.installPlugin(s.n.source, action.name, 'user', action.acceptSha);
      if (r.ok) logInstall({ type: 'plugin', id: `${action.name}@${action.market}`, name: action.name, ...meta });
    } else if (action.type === 'skill') {
      r = I.installSkill(s.dir, s.n, action.skill, action.overwrite);
      if (r.ok) logInstall({ type: 'skill', id: action.skill.name, path: r.path, ...meta });
    } else if (action.type === 'agent') {
      r = I.installAgent(s.dir, s.n, action.agent, action.overwrite);
      if (r.ok) logInstall({ type: 'agent', id: action.agent.name, path: r.path, ...meta });
    } else if (action.type === 'mcp') {
      r = await I.installMcp(action.name, action.config, 'user');
      if (r.ok) logInstall({ type: 'mcp', id: action.name, scope: 'user', ...meta });
    } else if (action.type === 'profile') {
      const st = store.load();
      const p = fromPortable(action.profile);
      st.profiles.push(p); store.save(st);
      r = { ok: true, out: `Perfil “${p.name}” importado. Veja na aba Perfis.`, id: p.id };
    } else r = { ok: false, out: 'Ação desconhecida.' };
    return r;
  } catch (err) { return { ok: false, out: err.message }; }
});
ipcMain.handle('link:assist', async (_e, token) => {
  const s = sessions.get(token);
  if (!s) return { ok: false, raw: 'Análise expirou.' };
  return I.assist(s.dir, s.n);
});
ipcMain.handle('installs:list', () => readInstalls());
ipcMain.handle('installs:remove', async (_e, key) => {
  const l = readInstalls(), item = l.find((x) => x.key === key);
  if (!item) return { ok: false, out: 'Não encontrado.' };
  const r = await I.uninstall(item);
  if (r.ok) fs.writeFileSync(installsFile(), JSON.stringify(l.filter((x) => x.key !== key), null, 2));
  return r;
});
ipcMain.handle('plugin:installFrom', async (_e, { source, name }) => {
  const r = await I.installPlugin(source, name, 'user');
  if (r.ok) logInstall({ type: 'plugin', id: name, name, source });
  return r;
});

// ---- perfis portáteis (compartilháveis) ----
function marketSources() {
  const km = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.claude', 'plugins', 'known_marketplaces.json'), 'utf8')); } catch { return {}; } })();
  const out = {};
  for (const [k, v] of Object.entries(km)) out[k] = v.source && (v.source.repo || v.source.url || v.source.path);
  return out;
}
function toPortable(p) {
  const src = marketSources(), inv = getInventory();
  const plugins = inv.plugins.filter((x) => !(p.disabledPlugins || []).includes(x.key)).map((x) => ({ id: x.key, source: src[x.key.split('@')[1]] || null }));
  const { id, requires, ...rest } = p;
  return { ledgerProfile: 1, ...rest, plugins };
}
function fromPortable(j) {
  if (!j || j.ledgerProfile !== 1 || typeof j.name !== 'string') throw new Error('Arquivo não é um perfil do Claude Ledger.');
  const arr = (x) => (Array.isArray(x) ? x.map(String) : []);
  return {
    id: 'p' + Date.now().toString(36), name: j.name.slice(0, 80), model: typeof j.model === 'string' ? j.model : '',
    caveman: !!j.caveman, nirvana: !!j.nirvana, instructions: typeof j.instructions === 'string' ? j.instructions.slice(0, 20000) : '',
    disabledPlugins: arr(j.disabledPlugins), blockedMcp: arr(j.blockedMcp), blockedSkills: arr(j.blockedSkills), startSkills: arr(j.startSkills),
    requires: (Array.isArray(j.plugins) ? j.plugins : []).filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, source: typeof x.source === 'string' ? x.source : null })),
  };
}
ipcMain.handle('profiles:export', async (_e, p) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: `${p.name.replace(/[^\w.-]+/g, '-')}.ledger-profile.json`, filters: [{ name: 'Perfil Claude Ledger', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, JSON.stringify(toPortable(p), null, 2));
  return { ok: true, path: r.filePath };
});
ipcMain.handle('profiles:import', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Perfil Claude Ledger', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try {
    const p = fromPortable(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')));
    const st = store.load(); st.profiles.push(p); store.save(st);
    return { ok: true, id: p.id };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---- perfis ----
let store;
const pluginKeys = () => getInventory().plugins.map((p) => p.key);
ipcMain.handle('profiles:get', () => ({ ...store.load(), current: store.current() }));
ipcMain.handle('profiles:save', (_e, st) => store.saveProfiles(st.profiles, pluginKeys()));
ipcMain.handle('profiles:plan', (_e, p) => store.plan(p, pluginKeys()));
ipcMain.handle('profiles:apply', (_e, id) => store.apply(id, pluginKeys()));
ipcMain.handle('profiles:detach', () => store.detach());
// "a próxima sessão vai abrir com o perfil?" — deep=true abre uma sessão real (usa o plano)
const SC = require('./src/services/sessioncheck');
ipcMain.handle('profiles:check', async (_e, opts = {}) => {
  try {
    const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : null;
    const files = SC.fileCheck(store, pluginKeys(), cwd);
    if (!opts.deep) return { ...files, deep: false, at: Date.now() };
    const logBefore = store.syncHistory(1).count;
    const live = await SC.probe(cwd || require('os').homedir());
    if (!live.ok) return { ...files, deep: true, liveError: live.error, at: Date.now() };
    const after = store.syncHistory(1);
    live.hookRan = after.count > logBefore ? after.items[0] : null;
    return { ...files, items: [...files.items, ...SC.compareLive(files.profile, live)], history: store.syncHistory(), deep: true, live: live.init, cost: live.cost, at: Date.now() };
  } catch (err) { return { __error: err.message }; }
});

ipcMain.handle('pricing:set', (_e, rows) => {
  const clean = (Array.isArray(rows) ? rows : []).filter(r => r && r.match).map(r => ({ match: String(r.match), in: Number(r.in) || 0, out: Number(r.out) || 0 }));
  fs.writeFileSync(pricingFile(), JSON.stringify(clean, null, 2));
  if (ledgerDb) ledgerDb.ingest(); // tabela nova = nova versão de preço (histórico preservado)
  return clean;
});

let ledgerDb; // banco + ingestão contínua (especificação v1)
app.whenReady().then(() => {
  store = createStore(app.getPath('userData'));
  ledgerDb = require('./src/ipc').register({ ipcMain, app, getWin: () => win, readPricing });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
