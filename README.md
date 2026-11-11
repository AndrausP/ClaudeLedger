# Claude Ledger

**Observabilidade, custo e governança para o Claude Code — num app desktop que roda 100% local.**

O Claude Ledger lê os transcritos que o Claude Code já grava na sua máquina e responde às perguntas que o
terminal não responde: quanto cada sessão custou, quais agentes e ferramentas consumiram mais, onde houve
desperdício (leituras repetidas, erros em sequência, compactações), se as tarefas deram certo e quanto do
limite da assinatura já foi usado. Também instala e configura extensões (plugins, skills, MCP) com análise de
risco antes de qualquer coisa rodar.

> Nenhum dado sai do computador. O app nunca armazena o texto dos seus prompts, respostas ou saídas de ferramentas.

---

## Sumário

- [O que ele faz](#o-que-ele-faz)
- [Como funciona](#como-funciona)
- [Instalação](#instalação)
- [Guia das telas](#guia-das-telas)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Arquitetura](#arquitetura)
- [Desenvolvimento](#desenvolvimento)
- [Registry da comunidade](#registry-da-comunidade)
- [Limitações conhecidas](#limitações-conhecidas)

---

## O que ele faz

| Área | Recursos |
|---|---|
| **Custos** | Custo equivalente de API por sessão, agente, modelo e dia · reconciliação entre o custo que o próprio Claude Code reporta e o recalculado · tabela de preços versionada (mudar preço não reescreve o histórico) · mensalidade e orçamento separados do custo estimado |
| **Limites da assinatura** | Janelas de 5 horas e 7 dias lidas da status line, com horário de reinício — só leituras reais, nada interpolado |
| **Sessões** | Timeline cronológica de cada sessão (prompts, respostas, ferramentas, compactações, erros de API) com filtros, inspetor de evento e exportação JSON/CSV · mudanças de código da sessão (commits git + arquivos editados, com diff) |
| **Diagnósticos** | Regras determinísticas e versionadas (leitura repetida, erro repetido, compactação alta, ferramenta lenta, operações negadas) · dashboard com matriz regra × dia e drill-down clicável · evidência que leva ao evento exato · feedback (útil / falso positivo / ignorar) |
| **Eficiência** | Avaliação automática das tarefas pelo último comando de teste · taxa de sucesso, cobertura, custo por tarefa aprovada, falha de ferramentas, duração mediana/P90 — com tamanho de amostra e aviso quando é pequena |
| **Agentes** | Ranking e detalhe de cada agente/subagente: o que chamou, alvos mais comuns, acurácia das ferramentas, erros, sessões, execuções e diagnósticos ligados |
| **Auditoria** | Visão geral, por agente, cada resposta, cada chamada de ferramenta e erros agrupados — tudo clicável até o evento |
| **Extensões** | Inventário instalado × uso real · catálogo oficial, registry de MCP, busca no GitHub e índice da comunidade · instalação por link com análise em quarentena · perfis de configuração aplicados ao Claude Code |
| **Orchestra Core** | Aba dedicada à extensão Orchestra: organograma dos departamentos, uso real de cada agente, aderência ao catálogo (modelo previsto × usado, turnos × orçamento, ferramentas fora da lista), tarefas e eventos do runtime (só leitura) e relatório exportável em Markdown, HTML e PDF |
| **Filtros** | Barra única (período, inclusive personalizado; projeto; excluir projetos; agente; modelo; busca) que vale para todas as telas e relatórios e fica na URL |

Cada tela tem um botão **?** ao lado do título que explica como lê-la.

## Como funciona

```
 ~/.claude/projects/**/*.jsonl ──┐   (sempre)
 status line (wrapper opcional) ─┤   limites do plano
 OpenTelemetry local (opcional) ─┤   custo por requisição
                                 ▼
                 ingestão incremental (worker thread)
          cursor em bytes · deduplicação · sem texto de prompt
                                 ▼
                       SQLite local (node:sqlite)
                                 ▼
   regras de diagnóstico · reconciliação de custos · avaliação de tarefas
                                 ▼
                    interface Electron (IPC, sem servidor)
```

- A coleta roda a cada minuto e lê **só o que foi acrescentado** aos arquivos (alguns milissegundos).
- Reimportar o mesmo arquivo nunca duplica tokens ou custo; arquivos truncados são detectados.
- Instalações e mudanças de configuração usam o **CLI oficial** (`claude plugin`, `claude mcp`) e sempre pedem confirmação.

## Instalação

### Instalador (Windows)

Gere com `npm run dist:win` e execute `dist/Claude Ledger Setup <versão>.exe`.
O instalador ainda não é assinado digitalmente; o Windows SmartScreen pode pedir confirmação.

### A partir do código

```bash
git clone https://github.com/AndrausP/ClaudeLedger.git
cd ClaudeLedger
npm install
npm start
```

### Requisitos

| Requisito | Para quê |
|---|---|
| Claude Code no `PATH` (ou variável `CLAUDE_BIN`) | instalar/validar extensões, assistente de análise |
| Git | análise de repositórios por link e aba Mudanças |
| `gh` CLI autenticado (opcional) | busca de código no GitHub (marketplaces instaláveis) e limites maiores |
| Node.js no `PATH` (opcional) | coletor da status line |

Testado no Windows 11. Os caminhos usados (`~/.claude`) são os mesmos no macOS e no Linux, mas essas plataformas ainda não foram validadas.

## Guia das telas

**Análise**

- **Visão Geral** — cards com variação contra o período anterior, custo diário (passe o mouse para o detalhe do dia), uso por modelo, ranking de agentes, limites da sessão e alerta de diagnósticos críticos.
- **Sessões** — lista e, ao abrir uma sessão: *Timeline*, *Diagnóstico*, *Mudanças* e *Custos*. Avaliação manual e etiquetas de assunto no cabeçalho.
- **Diagnósticos** — faixa de gravidade, matriz regra × dia, cartões por regra, recortes por projeto/agente/feedback; cada clique filtra a tabela de achados.
- **Eficiência** — resultado das tarefas × custo e tempo, por projeto, modelo ou uso de subagentes.
- **Agentes** — clique num agente para ver o que ele chamou, a acurácia (ferramentas que funcionaram ÷ funcionaram + falharam), erros, sessões e execuções.
- **Modelos**, **Assuntos**, **Custos e assinatura**, **Auditoria** (com submódulos).

**Extensões**

- **Extensões** — o que está instalado e o que realmente é usado; “nunca usado” é candidato a remover.
- **Orchestra** — gestão da extensão Orchestra Core: catálogo × uso × runtime, detalhe de cada agente e relatório.
- **Explorar e instalar** — diretório oficial, GitHub, registry de MCP, comunidade e instalação por link. Todo repositório é clonado em quarentena e analisado (hooks, comandos de MCP, scripts, custo fixo em tokens) antes de instalar.

**Configuração**

- **Perfis** — modelo, plugins, MCP, skills e instruções fixas aplicados a toda sessão nova (com prévia e backup); exportáveis para arquivo ou para o repositório do time.
- **Preços** — tabela usada nas estimativas.
- **Configurações** — fontes de dados, coletores opcionais, plano e orçamento, retenção, exclusão de dados e parâmetros das regras.

## Privacidade e segurança

- **Nunca armazenado:** texto de prompts, respostas, parâmetros e saídas de ferramentas. Ficam só metadados (horários, tokens, nome da ferramenta, nome do arquivo, executável), hashes e assinaturas de erro normalizadas.
- **Local:** banco em `%APPDATA%/Claude Ledger/ledger.db`. O receptor OpenTelemetry escuta só em `127.0.0.1`.
- **Exclusão e retenção:** apague dados por sessão ou projeto; a exclusão impede reimportação e não toca nos transcritos do Claude Code.
- **Instalação segura:** clone só via `https` (`ext::`, `file://` e ssh bloqueados), symlinks desligados, nada do repositório é executado na análise, hooks exigem confirmação explícita.
- **Configuração do Claude Code:** toda alteração em `settings.json`/`CLAUDE.md` mostra antes o que vai mudar, faz backup e pode ser desfeita. O wrapper da status line preserva a sua status line atual.
- **Custo estimado não é fatura:** o app sempre separa custo equivalente de API, mensalidade e limite do plano.

## Arquitetura

```
main.js              processo principal (janela, IPC)
preload.js           ponte segura renderer ↔ main (lista de canais permitidos)
src/
  db/                SQLite: conexão e migrações versionadas
  ingest/            importador incremental de transcritos (worker thread)
  domain/            regras puras: normalização, preços, diagnóstico, eficiência, diff
  services/          sessões, diagnósticos, eficiência, custos, agentes/auditoria, filtros, mudanças, admin
  statusline/        wrapper transparente da status line + leitura de snapshots
  otel/              receptor OTLP/HTTP-JSON local (opcional)
  installer.js       análise em quarentena e instalação via CLI oficial
  catalog.js         diretório oficial, registry de MCP, índice da comunidade
  github.js          busca no GitHub (gh autenticado ou API pública)
  profiles.js        perfis aplicados ao Claude Code
renderer/            interface (HTML/CSS/JS sem framework)
test/                testes (node:test) com transcritos sintéticos
registry/            registry da comunidade (index.json + validação por Pull Request)
docs/                plano e status da especificação
```

Sem dependências de runtime além do Electron: `node:sqlite`, `node:http` e `node:test` são nativos.

## Desenvolvimento

```bash
npm start            # app em modo desenvolvimento
npm test             # 38 testes: deduplicação, incremental, privacidade, fórmulas, regras, filtros…
npm run dist:win     # instalador (também dist:mac e dist:linux)
```

Os testes usam apenas transcritos sintéticos e verificam, entre outros, os critérios da especificação:
sem dupla contagem, dados parciais como “indisponível” (nunca zero inventado), cálculo de preço versionado,
avaliação manual prevalecendo sobre a automática, privacidade (nenhum texto de prompt no banco) e o
**mesmo filtro produzindo o mesmo total em Custos, Auditoria e Agentes**.

Detalhes do plano e do que está implementado: [`docs/plano-especificacao-v1.md`](docs/plano-especificacao-v1.md).

## Registry da comunidade

A pasta [`registry/`](registry) contém um índice aberto de extensões: qualquer pessoa envia uma entrada por
Pull Request, a validação clona o repositório no commit fixado, detecta o tipo e marca se há hooks, e o
`index.json` é servido por CDN (sem servidor). Para usá-lo publique a pasta como repositório próprio e cole a URL
do índice em *Explorar e instalar → Comunidade*.

## Limitações conhecidas

- A **tabela de preços padrão é estimativa**. A tela de Custos compara com o custo que o próprio Claude Code reporta e avisa quando divergem; ajuste em *Preços*.
- **OpenTelemetry:** os nomes dos atributos variam entre versões do Claude Code; o parser é tolerante, mas não foi validado contra uma captura real.
- **Visão Geral, Modelos e Extensões** ainda calculam a partir do leitor de transcritos original (mesma tabela de preços atual, sem histórico de tarifas); as demais telas usam o banco.
- “Tarefa” = sessão nesta versão. O Gantt da timeline exige traces OTel com início/fim confiáveis e fica desabilitado sem eles.
- Instalador sem assinatura de código; macOS e Linux não testados.

## Licença

Ainda não definida pelo autor — até lá, todos os direitos reservados.
