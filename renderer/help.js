'use strict';
/* global S */
// Ajuda contextual: botão "?" ao lado do título abre um modal explicando como ler a tela atual.
// Conteúdo: [título da seção, [itens]] — itens em texto simples, renderizados com textContent (sem HTML).

const HELP = {
  geral: {
    intro: 'Resumo do uso do Claude Code no período e nos filtros escolhidos no topo.',
    sections: [
      ['Cards do topo', [
        'Custo estimado: soma do custo equivalente de API (tokens × tabela de Preços). Não é a sua fatura.',
        'Tokens: entrada + saída + cache. Cache hit: quanto da entrada veio do cache (mais alto = mais barato).',
        'Respostas e Sessões: volume de respostas do modelo e de conversas.',
        'A etiqueta ▲/▼ compara com o período anterior de mesmo tamanho. Aparece “—” quando seu histórico não cobre esse período.',
        'A mini-linha de cada card é a evolução diária; passe o mouse para ver o valor de cada dia.',
        'Limites da sessão: quanto da janela de 5 horas e de 7 dias da sua assinatura já foi usado, com o horário de reinício. Só aparece com o coletor da status line ativo (Configurações); nada é estimado.',
      ]],
      ['Filtros', [
        'A barra abaixo do título (período, inclusive personalizado; projeto; excluir projetos; agente; modelo; busca) vale para todas as telas e relatórios. Os filtros ativos aparecem como etiquetas removíveis e ficam no link da página.',
      ]],
      ['Gráficos', [
        'Custo ao longo do tempo: alterne Custo / Tokens / Sessões. Passe o mouse num ponto para ver o detalhe do dia (custo, tokens, modelo principal, agente mais caro).',
        'Uso por modelo: participação de cada modelo em tokens ou em custo (seletor no canto).',
      ]],
      ['Painéis de baixo', [
        'Ranking de agentes: quem gastou mais. “main” é a conversa principal; os demais são subagentes.',
        'Extensões: MCP, skills e subagentes que estavam nos turnos mais caros.',
        'Eficiência: indicadores rápidos; o anel mostra o cache hit.',
      ]],
      ['Cuidados', [
        'Mais tokens ou mais sessões não significam mais resultado. Para isso, use a tela Eficiência.',
        'Uma faixa vermelha no topo indica achados críticos nos Diagnósticos; clique nela para abrir.',
      ]],
    ],
  },
  sessoes: {
    intro: 'Cada conversa com o Claude Code. Clique numa linha para abrir a sessão.',
    sections: [
      ['Lista', [
        'Sessão: título gerado pelo próprio Claude Code. Sem título, aparece o ID.',
        'Custo equiv.: estimativa por tabela de preços. “parcial” = algum modelo sem preço configurado.',
        'Achados: diagnósticos abertos, com a gravidade mais alta da sessão.',
        'Clique no nome de qualquer coluna para ordenar ou filtrar.',
      ]],
      ['Dentro da sessão', [
        'Cabeçalho: projeto, horário, duração, modelos e completude dos dados (“histórico” = só transcrito local).',
        'Avaliação: aprovada/reprovada pelo último teste executado; sem teste fica “não avaliada”. Você pode trocar manualmente no seletor.',
        'Assuntos: digite etiquetas separadas por vírgula; elas alimentam a tela Assuntos.',
        'Cards: custo, tokens por tipo, ferramentas (erros, negadas, testes), erros de API, subagentes, compactações e o estado da reconciliação.',
      ]],
      ['Aba Timeline', [
        'Lista cronológica: horário, tipo, agente, descrição, duração, custo e estado.',
        'Use as pílulas de tipo, os seletores de estado/agente e a busca para filtrar.',
        'Clique num evento para abrir o inspetor: fonte, IDs, horários e diagnósticos ligados.',
        'Durações de ferramenta são aproximadas: incluem o tempo que você levou para aprovar.',
        'Faixa amarela à esquerda = evento aberto a partir de um diagnóstico (“Ir à evidência”).',
      ]],
      ['Aba Diagnóstico', [
        'Achados desta sessão. Use “Ver evidências” para pular ao evento exato na timeline.',
        'Marque Útil / Falso positivo / Ignorar: o feedback fica guardado e calibra as regras.',
      ]],
      ['Aba Mudanças', [
        'Commits: commits do repositório feitos durante a sessão (+10 min). Clique para ver o diff.',
        'Arquivos editados: cópia que o Claude Code guardou antes da 1ª edição × arquivo como está hoje no disco. Mudanças feitas depois da sessão também aparecem.',
      ]],
      ['Aba Custos', [
        'Reportado: custo que o próprio Claude Code gravou. Recalculado: tokens × tabela de Preços.',
        'Validado = diferença dentro da tolerância; Divergente = fora; Dados insuficientes = falta um dos lados.',
      ]],
    ],
  },
  diagnosticos: {
    intro: 'Padrões que podem indicar desperdício, detectados por regras fixas e auditáveis. Tudo no painel é clicável e filtra a tabela de achados.',
    sections: [
      ['Dashboard', [
        'Faixa de gravidade: crítico (agir), atenção (vale olhar), info (contexto). A largura acompanha a quantidade; clique para filtrar.',
        'Sessões afetadas e falsos positivos: quantas sessões têm achados e quanto do seu feedback disse “não fazia sentido”.',
        'Regra × dia: cada célula é uma regra num dia. A cor é a gravidade mais alta; quanto mais forte, mais achados. Passe o mouse para ver o detalhe e clique para isolar aquele dia e regra.',
        'Cartões das regras: total, tendência no período, sessões e taxa de falso positivo de cada regra.',
        'Por projeto, por agente e feedback: barras clicáveis que somam à seleção.',
        'A seleção ativa aparece como etiquetas acima da tabela; “Limpar seleção” volta ao todo.',
      ]],
      ['Tabela', [
        'Mostra os achados da seleção. Clique numa linha para abrir a sessão, com a explicação, a recomendação e as evidências.',
        'Achados marcados como falso positivo ou ignorado saem da contagem; filtre por Feedback para revê-los.',
      ]],
      ['Regras', [
        'repeated_read: mesmo arquivo lido várias vezes com os mesmos parâmetros, sem edição entre as leituras.',
        'repeated_error: a mesma ferramenta falhou seguidamente com o mesmo erro. Crítico quando os parâmetros também eram idênticos.',
        'high_compaction: compactações acima do P90 das suas próprias sessões.',
        'latency_outlier: ferramenta muito mais lenta que o normal para ela (exige amostra mínima).',
        'permission_denials: muitas operações negadas. Pode ser bloqueio intencional, não defeito.',
      ]],
      ['Cuidados', [
        'Recomendações são hipóteses, não conclusões.',
        'Marque “Falso positivo” quando não fizer sentido: o achado some da contagem e a evidência é mantida.',
        'Os limites de cada regra podem ser ajustados em Configurações.',
      ]],
    ],
  },
  eficiencia: {
    intro: 'Desempenho por resultado, não por consumo. “Gastou pouco” não significa “fez bem”.',
    sections: [
      ['Como a tarefa é avaliada', [
        'Tarefa = sessão.',
        'Aprovada: o último comando de teste da sessão passou. Reprovada: falhou.',
        'Não avaliada: nenhum teste com resultado. Nesse caso a sessão fica fora da taxa de sucesso.',
        'A avaliação manual na tela da sessão sempre prevalece.',
      ]],
      ['Cards', [
        'Taxa de sucesso = aprovadas ÷ avaliadas. Cobertura = avaliadas ÷ total.',
        'Custo por aprovada = custo do grupo inteiro ÷ aprovadas (inclui o custo das que falharam).',
        'Falha de ferramentas = erros ÷ resultados conhecidos.',
        'Duração mediana e P90: tempo típico e tempo dos 10% mais longos.',
      ]],
      ['Gráfico e tabela', [
        'Tendência semanal do custo por tarefa aprovada; passe o mouse para ver aprovadas e avaliadas.',
        'Distribuição: quantas sessões foram aprovadas, reprovadas, parciais ou não avaliadas, e por qual método.',
        'Tabela por grupo (projeto, modelo ou uso de subagentes): os indicadores ficam separados, sem nota única.',
      ]],
      ['Cuidados', [
        'Com menos de 5 tarefas avaliadas, as taxas não são confiáveis. A tela avisa (“n baixo”).',
        'Compare grupos com tarefas parecidas; projetos diferentes têm dificuldades diferentes.',
      ]],
    ],
  },
  agentes: {
    intro: 'Quem gastou os tokens — a conversa principal (main) e cada subagente — e como cada um se saiu. Clique num agente para o detalhe.',
    sections: [
      ['Lista', [
        'Execuções: quantas vezes o subagente foi chamado. Custo/execução: média por chamada.',
        'Acurácia: ferramentas que funcionaram ÷ (funcionaram + falharam). Negadas e canceladas não contam como falha.',
        'Sucesso das tarefas: das sessões em que o agente atuou e que foram avaliadas por testes, quantas passaram (n = quantas foram avaliadas).',
        'Duração (mediana): tempo típico de uma execução.',
      ]],
      ['Detalhe do agente', [
        'Resumo: custo por dia (passe o mouse), tipos de ferramenta, modelos e ferramentas mais chamadas.',
        'O que chamou: cada ferramenta com chamadas, erros, acurácia, duração e os alvos mais comuns (arquivos, executáveis, servidores). Clique para ver todas as chamadas na Auditoria.',
        'Erros: falhas agrupadas por mensagem normalizada; clique para abrir um exemplo na timeline.',
        'Sessões e Execuções: onde o agente atuou; “ver chamada” abre o ponto em que o subagente foi criado.',
        'Diagnósticos: achados cuja evidência envolve este agente.',
      ]],
      ['Cuidados', [
        'Subagentes só recebem o custo do próprio transcrito: não há estimativa nem rateio.',
        'Acurácia alta com poucas chamadas diz pouco; veja o número de chamadas ao lado.',
      ]],
    ],
  },
  modelos: {
    intro: 'Uso e custo por modelo.',
    sections: [
      ['Como ler', [
        'Entrada, saída, cache leitura e cache escrita em tokens.',
        'Composição do custo: barra colorida com a parte de cada tipo de token. Passe o mouse para ver os valores.',
        'Uma etiqueta “sem preço” indica modelo sem linha na tabela de Preços (custo fica de fora).',
      ]],
      ['Dica', [
        'Muito cache leitura costuma ser bom (barato). Muito cache escrita sem leitura posterior é desperdício.',
      ]],
    ],
  },
  assuntos: {
    intro: 'Custo agrupado pelas etiquetas que você coloca nas sessões.',
    sections: [
      ['Como usar', [
        'Abra uma sessão e digite assuntos separados por vírgula (ex.: bug, refatoração, front).',
        'Aqui aparecem as sessões, requisições e custo por assunto.',
      ]],
      ['Por que é manual', [
        'Classificar automaticamente exigiria ler o texto dos seus prompts. Por privacidade, isso não é feito sem autorização explícita.',
      ]],
    ],
  },
  custos: {
    intro: 'Três números diferentes, que nunca são somados: custo equivalente de API, mensalidade do plano e limite de uso.',
    sections: [
      ['Cards', [
        'Equivalente de API: quanto o uso custaria pela tabela de preços da API. Não é a sua cobrança.',
        'Mensalidade: valor que você informa em Configurações.',
        'Equivalente no mês: fica vermelho somente se passar do orçamento que você configurou.',
        'Reconciliação: sessões validadas / divergentes / sem dados.',
        'Recalculado ÷ reportado: 1,00× = tabela de preços correta. Muito acima ou abaixo = ajuste em Preços.',
      ]],
      ['Limites da assinatura', [
        'Janelas de 5 horas e de 7 dias, com percentual usado e horário de reinício.',
        'Só aparecem leituras reais da status line (ative o coletor em Configurações). Nada é estimado ou interpolado.',
        'Fresco = lido nos últimos 15 minutos. Percentual de limite não vira dólar.',
      ]],
      ['Abaixo', [
        'Série diária (custo, tokens, sessões), custo por modelo e por agente.',
        'Reconciliação por sessão: clique numa linha para abrir os custos da sessão.',
        'Histórico de tarifas: cada mudança na tabela vira uma versão nova e o passado não é recalculado.',
      ]],
    ],
  },
  audit: {
    intro: 'Conferência completa: tudo que foi chamado, por quem, com que resultado. Cada linha leva ao evento exato na timeline.',
    sections: [
      ['Submódulos', [
        'Visão geral: respostas, custo, chamadas, acurácia, negadas/canceladas, sucesso das tarefas, gráfico diário (respostas, ferramentas, falhas, acurácia) e a tabela de ferramentas.',
        'Por agente: todos os agentes com os mesmos indicadores; clique para o detalhe completo.',
        'Respostas: cada resposta do modelo com tokens, custo e as ferramentas que ela chamou.',
        'Ferramentas: cada chamada com agente, modelo, alvo, estado, duração e erro.',
        'Erros: falhas agrupadas pela mensagem normalizada, com quantas foram repetidas com o mesmo parâmetro.',
      ]],
      ['Como usar', [
        'A barra de filtros do topo (período, projeto, agente, modelo, busca) vale para todos os submódulos.',
        'O nome de cada coluna abre ordenação e filtros (ex.: Estado = erro).',
        'Exportar CSV exporta exatamente as linhas filtradas do submódulo aberto.',
      ]],
      ['Conta do custo', [
        'Entrada × preço + saída × preço + cache leitura × 0,1 + cache escrita 5 min × 1,25 + cache escrita 1 h × 2 (multiplicadores sobre o preço de entrada).',
      ]],
    ],
  },
  ext: {
    intro: 'O que está instalado × o que é usado de verdade.',
    sections: [
      ['Como ler', [
        'Abas: Plugins, Skills, MCP, Subagentes e Ferramentas nativas, com a quantidade de cada.',
        'Status: em uso; nunca usado (candidato a remover); desativado; não inventariado (built-in ou removido).',
        'Custo dos turnos: custo das respostas em que a extensão foi chamada, dividido entre tudo que foi chamado no mesmo turno.',
      ]],
      ['Cuidados', [
        'Plugins que agem só por hook (ex.: caveman) não deixam rastro de chamada e aparecem como “nunca usado”.',
      ]],
    ],
  },
  explore: {
    intro: 'Descobrir e instalar extensões num lugar só: busque, analise em quarentena e instale pelo CLI oficial do Claude Code.',
    sections: [
      ['Abas', [
        'Diretório oficial: plugins revisados pela Anthropic, com instalações e custo fixo em tokens por sessão.',
        'GitHub: busca direta no GitHub. “Marketplaces instaláveis” procura arquivos .claude-plugin/marketplace.json (precisa do gh CLI com login); Plugins, Skills e MCP buscam pelo tópico do repositório.',
        'MCP servers: registry oficial. Busque com Enter, clique em “Configurar” e revise o JSON antes de adicionar.',
        'Comunidade: índice que você configura (repositório GitHub). Mostra se a extensão tem hooks.',
        'Por link: cole qualquer link de repositório; é aqui que toda análise aparece, venha de onde vier.',
      ]],
      ['Analisar e instalar', [
        'O repositório é baixado em quarentena e nada dele é executado.',
        'Revise “O que isso executa na sua máquina”: hooks, comandos de MCP e scripts. Hooks exigem confirmação.',
        'Se já estiver instalado, aparece a comparação de custo entre a versão atual e a nova, e o botão Atualizar.',
        '“Instalados pelo Ledger” permite remover com um clique.',
      ]],
      ['Cuidados', [
        'Custo fixo = tokens adicionados em toda sessão, mesmo sem usar. Prefira os baixos.',
        'MCP local (npx/uvx/docker) executa código na sua máquina.',
      ]],
    ],
  },
  add: {
    intro: 'Instalar uma extensão a partir do link de um repositório.',
    sections: [
      ['Passo a passo', [
        'Cole o link (GitHub, GitLab, Bitbucket ou git https) e clique em Analisar.',
        'O repositório é baixado em quarentena; nada dele é executado.',
        'Revise “O que isso executa na sua máquina”: hooks, comandos de MCP e scripts.',
        'Instale o que quiser. Tudo passa pelo CLI oficial do Claude Code.',
      ]],
      ['Sinais', [
        'Alto: hooks rodam sozinhos em toda sessão. É preciso confirmar antes de instalar.',
        'Já instalado: mostra o custo da versão atual × nova e o botão Atualizar.',
        'Mudou desde sua análise: hooks ou MCP que entraram ou saíram desde a última vez.',
        '“Instalados pelo Ledger” permite remover com um clique.',
      ]],
    ],
  },
  perfis: {
    intro: 'Configurações que toda sessão nova do Claude Code segue.',
    sections: [
      ['Como usar', [
        'Escolha modelo, plugins, MCP e skills liberados, e as instruções fixas (Caveman, Nirvana, texto livre).',
        '“Aplicar ao Claude Code…” mostra exatamente o que muda antes de gravar e faz backup.',
        'Exportar arquivo: compartilhe o perfil. Exportar para projeto: o time inteiro herda ao clonar o repositório.',
      ]],
      ['Cuidados', [
        'Vale para sessões novas; as já abertas não mudam.',
        'Desvincular remove o que o app escreveu e mantém o resto do seu settings.json.',
      ]],
    ],
  },
  precos: {
    intro: 'Tabela usada para estimar o custo equivalente de API.',
    sections: [
      ['Como ler', [
        'Trecho do modelo: a primeira linha cujo texto aparece no ID do modelo é a que vale.',
        'Entrada e saída em USD por 1 milhão de tokens. O cache usa multiplicadores do preço de entrada.',
        '“Modelos casados” mostra quais modelos dos seus dados usam cada linha.',
      ]],
      ['Importante', [
        'Os valores iniciais são estimativas. Compare com “Recalculado ÷ reportado” em Custos e assinatura.',
        'Salvar cria uma versão nova da tabela; o histórico não é recalculado.',
      ]],
    ],
  },
  config: {
    intro: 'Fontes de dados, coletores opcionais, plano, privacidade e parâmetros das regras.',
    sections: [
      ['Fontes de dados', [
        'Transcritos locais: sempre ativos, lidos de forma incremental a cada minuto.',
        'Status line: coletor opcional dos limites do plano. Preserva a sua status line atual.',
        'OpenTelemetry local: opcional; recebe métricas do Claude Code em 127.0.0.1 enquanto o app está aberto.',
      ]],
      ['Plano, privacidade e regras', [
        'Mensalidade, moeda e orçamento: usados na tela Custos. O vermelho só aparece com orçamento excedido.',
        'Retenção: apaga do banco as sessões antigas. Os transcritos do Claude Code não são tocados.',
        'Excluir projeto: remove os dados do app e impede reimportação. Pode ser desfeito em “Reimportar excluídas”.',
        'Regras: ajuste os limites de cada diagnóstico; salvar recalcula todos.',
        'Ações que mexem no Claude Code pedem confirmação (clique duas vezes) e ficam no registro de permissões.',
      ]],
    ],
  },
};

// ---------- botão + modal ----------
const helpBtn = document.createElement('button');
helpBtn.id = 'helpbtn';
helpBtn.className = 'helpbtn';
helpBtn.type = 'button';
helpBtn.textContent = '?';
helpBtn.title = 'Como ler esta tela';
helpBtn.setAttribute('aria-label', 'Como ler esta tela');
helpBtn.setAttribute('aria-haspopup', 'dialog');
document.getElementById('ptitle').after(helpBtn);

const overlay = document.createElement('div');
overlay.id = 'helpmodal';
overlay.className = 'hmodal';
overlay.hidden = true;
overlay.innerHTML = '<div class="hbox" role="dialog" aria-modal="true" aria-labelledby="htitle"><div class="hhead"><div><div class="hkicker">Como ler</div><h2 id="htitle"></h2></div><button class="hclose" type="button" aria-label="Fechar">×</button></div><div class="hbody"></div><div class="hfoot"><span>Esc para fechar</span></div></div>';
document.body.appendChild(overlay);

let lastFocus = null;
function openHelp() {
  const tab = (typeof S !== 'undefined' && S.tab) || 'geral';
  const h = HELP[tab] || { intro: 'Sem ajuda para esta tela.', sections: [] };
  const titleEl = document.getElementById('ptitle');
  overlay.querySelector('#htitle').textContent = titleEl ? titleEl.textContent : '';
  const body = overlay.querySelector('.hbody');
  body.replaceChildren();
  const intro = document.createElement('p');
  intro.className = 'hintro';
  intro.textContent = h.intro;
  body.appendChild(intro);
  // na sessão aberta, a seção da aba atual vem primeiro
  let sections = h.sections;
  if (tab === 'sessoes' && S.V && S.V.sid) {
    const map = { timeline: 'Aba Timeline', diag: 'Aba Diagnóstico', changes: 'Aba Mudanças', costs: 'Aba Custos' };
    const cur = map[S.V.stab];
    sections = [...sections.filter((s) => s[0] === cur), ...sections.filter((s) => s[0] !== cur)];
  }
  for (const [title, items] of sections) {
    const sec = document.createElement('section');
    const h3 = document.createElement('h3');
    h3.textContent = title;
    const ul = document.createElement('ul');
    for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); }
    sec.append(h3, ul);
    body.appendChild(sec);
  }
  lastFocus = document.activeElement;
  overlay.hidden = false;
  body.scrollTop = 0;
  overlay.querySelector('.hclose').focus();
}
function closeHelp() {
  overlay.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
helpBtn.addEventListener('click', openHelp);
overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('.hclose')) closeHelp(); });
document.addEventListener('keydown', (e) => {
  if (overlay.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeHelp(); }
  if (e.key === 'Tab') { e.preventDefault(); overlay.querySelector('.hclose').focus(); } // único controle: foco preso no modal
});
