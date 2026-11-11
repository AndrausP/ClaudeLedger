'use strict';
/* global S, esc, ico, tag, render */
// Card "Próxima sessão do Claude Code" na aba Perfis: confirma que uma sessão NOVA abre com o perfil.
S.PC = S.PC || { res: null, busy: '', cwd: '' };

const PC_ICON = { ok: ['check', 'var(--ok)'], warn: ['alert', 'var(--warn)'], fail: ['alert', 'var(--bad)'], info: ['clock', 'var(--mute)'] };

async function runProfileCheck(deep) {
  S.PC.busy = deep ? 'deep' : 'files';
  render();
  try { S.PC.res = await window.ledger.profiles.check({ deep, cwd: S.PC.cwd || null }); } catch (e) { S.PC.res = { __error: e.message }; }
  S.PC.busy = '';
  render();
}

// sessões reais que passaram pelo hook do perfil (registro local, sem texto de conversa)
function pcHistory(h) {
  if (!h || !h.items || !h.items.length) return '';
  const home = (s) => String(s || '').replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~');
  return '<details class="pchist"><summary>Últimas sessões abertas (' + h.count + ' no total)</summary><table><thead><tr><th class="l">Quando</th><th class="l">Pasta</th><th class="l">Perfil</th><th class="l">Resultado</th></tr></thead><tbody>'
    + h.items.map((x) => '<tr><td class="l">' + esc(new Date(x.at).toLocaleString('pt-BR')) + '</td><td class="l">' + esc(home(x.cwd) || '—') + '</td><td class="l">' + esc(x.profile || '') + '</td><td class="l">'
      + (x.fixed && x.fixed.length ? tag('warn', 'corrigiu ' + x.fixed.join(', ')) : tag('ok', 'já estava pronto')) + '</td></tr>').join('')
    + '</tbody></table></details>';
}

function pcCard() {
  const r = S.PC.res;
  if (!r && !S.PC.busy) setTimeout(() => runProfileCheck(false), 0); // verificação gratuita automática ao abrir a aba
  const projects = ((S.FO && S.FO.projects) || []).filter((p) => p.root_path);
  let verdict = '<span class="note">verificando…</span>', list = '';
  if (r && r.__error) verdict = tag('bad', 'erro') + ' <span class="note">' + esc(r.__error) + '</span>';
  else if (r) {
    const fails = r.items.filter((x) => x.status === 'fail').length, warns = r.items.filter((x) => x.status === 'warn').length;
    verdict = fails ? tag('bad', 'a sessão NÃO abre com o perfil') + ' <span class="note">' + fails + ' problema(s)</span>'
      : warns ? tag('warn', 'abre com o perfil, com ressalvas') : tag('ok', r.deep ? 'confirmado numa sessão real' : 'arquivos prontos — confirme com o teste real');
    list = r.items.map((x) => { const [ic, col] = PC_ICON[x.status] || PC_ICON.info; return '<div class="pcrow"><i style="color:' + col + '">' + ico(ic) + '</i><div><b>' + esc(x.label) + '</b><span>' + esc(x.detail) + '</span></div></div>'; }).join('')
      + (r.liveError ? '<div class="pcrow"><i style="color:var(--bad)">' + ico('alert') + '</i><div><b>Teste de sessão real</b><span>' + esc(r.liveError) + '</span></div></div>' : '')
      + pcHistory(r.history)
      + '<div class="note">Verificado ' + new Date(r.at).toLocaleTimeString('pt-BR') + (r.deep ? ' com uma sessão real' : ' pelos arquivos') + (S.PC.cwd ? ' no projeto selecionado' : ' fora de projeto (pasta do usuário)') + '.</div>';
  }
  return '<div class="card pccard"><div class="card-h"><b>' + ico('shield', 'inl2') + ' Próxima sessão do Claude Code</b>' + verdict + '</div>'
    + '<div class="toolbar"><label class="fctl">' + ico('folder') + '<select data-pc-cwd aria-label="Projeto onde a sessão vai abrir"><option value="">Fora de projeto (pasta do usuário)</option>'
    + projects.map((p) => '<option value="' + esc(p.root_path) + '"' + (S.PC.cwd === p.root_path ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>'
    + '<button class="btn" data-pc-run="files"' + (S.PC.busy ? ' disabled' : '') + '>' + (S.PC.busy === 'files' ? 'Verificando…' : 'Verificar arquivos') + '</button>'
    + '<button class="btn primary" data-pc-run="deep"' + (S.PC.busy ? ' disabled' : '') + ' title="Abre uma sessão real (claude -p) e lê o que ela carregou. Usa o seu plano (~US$ 0,20).">' + (S.PC.busy === 'deep' ? 'Abrindo sessão de teste…' : 'Testar sessão real') + '</button>'
    + '<span class="note">O projeto importa: configuração dentro dele tem prioridade sobre o perfil.</span></div>'
    + list + '</div>';
}

document.getElementById('view').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pc-run]');
  if (b && !b.disabled) runProfileCheck(b.dataset.pcRun === 'deep');
});
document.getElementById('view').addEventListener('change', (e) => {
  if (e.target.dataset.pcCwd == null) return;
  S.PC.cwd = e.target.value; S.PC.res = null; render();
});
