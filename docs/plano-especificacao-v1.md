# Claude Ledger — Plano de implementação da Especificação v1.0

## Status (11/11/2026, v0.3.0) — implementado

Decisões de produto: identidade visual em preto `#000000` com acento verde-menta; a fase 4 avalia tarefas automaticamente pelos testes executados na sessão.

| Fase | Entregue | Arquivos |
|---|---|---|
| 1 Dados confiáveis | SQLite (`node:sqlite`), migrações 001/002, importador incremental por cursor em bytes, detecção de truncamento, dedup por fonte, `pricing_versions` imutável, reconciliação sessão×modelo com o `cost-state` do Claude Code, status das fontes | `src/db/*`, `src/ingest/*`, `src/domain/{normalize,pricing}.js`, `src/services/sessions.js` |
| 2 Timeline | Lista de sessões, cabeçalho (título real, completude, avaliação, assuntos), cards com "indisponível", timeline paginada com filtros (tipo, estado, agente, busca), inspetor lateral, exportação JSON/CSV, "Ir à evidência". Gantt desabilitado (sem traces confiáveis) | `renderer/v1.js` |
| 3 Diagnósticos | 5 regras versionadas (`repeated_read`, `repeated_error`, `high_compaction`, `latency_outlier`, `permission_denials`), persistência com fingerprint, feedback que sobrevive ao recálculo, parâmetros configuráveis, tela global + por sessão, alerta de críticos na Visão Geral | `src/domain/rules.js`, `src/services/diagnostics.js` |
| 4 Eficiência | `task_outcomes` automático pelo último comando de teste (aprovada/reprovada/não avaliada) + avaliação manual que prevalece; métricas com `n`, mediana/P90, cobertura, aviso de amostra pequena, indicadores separados, tendência semanal | `src/domain/efficiency.js`, `src/services/efficiency.js` |
| 5 Refinamento | Wrapper transparente da status line (snapshots 5h/7d), receptor OTLP/HTTP-JSON local opt-in com casamento sem dupla contagem, retenção, exclusão por sessão/projeto (persistente), registro de permissões, Assuntos por etiqueta manual, mensalidade/orçamento | `src/statusline/*`, `src/otel/receiver.js`, `src/services/{admin,costs}.js` |
| Extra | **Mudanças de código por sessão**: commits git na janela da sessão (merges pelo 1º pai) + arquivos editados via file-history do Claude Code (cobre projetos sem git), com visualizador de diff próprio (Myers) | `src/services/changes.js`, `src/domain/diff.js` |

**Testes:** `npm test` → 34 testes, 0 falhas (dedup, incremental, truncamento, atribuição, privacidade, fórmulas, versionamento, reconciliação, regras, evidência, feedback, avaliação, OTel, exclusão, wrapper byte a byte, diff, filtros consistentes entre telas, acurácia de ferramentas).
**Verificado no app real e no app empacotado:** todas as telas carregam com os dados locais; "Ir à evidência" abre a página certa e destaca o evento.

**Achado relevante:** o custo recalculado com a tabela local é ~2,1× o custo que o próprio Claude Code reporta (`cost-state`); os tokens batem (±2%). A tabela de preços padrão está errada para os modelos 5.x — a tela de Custos mostra o aviso. Uma regressão simples não conseguiu inferir preços confiáveis (erro máx. > 99%), então nenhum preço é sugerido automaticamente.

**Pendências conhecidas:**
- Validar com a versão instalada: nomes dos atributos OTel (`api_request`, `cost_usd`…) e campos de `rate_limits` na status line — o código é tolerante, mas sem captura real não está confirmado.
- Visão Geral, Modelos e Extensões ainda calculam a partir do leitor de transcritos original; usam a mesma tabela de preços atual, mas não as versões históricas. Agentes e Auditoria já leem do banco.
- "Tarefa" = sessão nesta versão.

---

Planejamento original: inventário do código existente, arquitetura, esquema, backlog e plano de testes.

Data: 11/11/2026 · Claude Code instalado: 2.1.322 · Electron 45.3.0 (Node 24.22.2)

---

## (a) Inventário do que já existe

| Área | Arquivo | Estado | Reaproveitar? |
|---|---|---|---|
| Leitura de transcritos | `src/parser.js` | Lê `~/.claude/projects/**/*.jsonl` (inclui `subagents/`), 1 registro por resposta, dedup por `message.id`, cache por arquivo (mtime+size) em `cache.json` | Sim — vira o importador incremental (fase 1) |
| Atribuição de subagente | `src/parser.js` | Por arquivo: `subagents/agent-*.jsonl` + `.meta.json` (`agentType`, `toolUseId`) → atribuição **comprovada**, não estimada | Sim |
| Custo | `renderer/app.js` (`costParts`) + `pricing.json` | Fórmula da spec já implementada (input, output, cache read 0,1×, write 5m 1,25×, write 1h 2×). Tabela **sem versão** e com preços estimados | Evoluir para `pricing_versions` |
| Inventário de extensões | `src/inventory.js` | Plugins, skills, agentes, MCP | Sim (sem mudança) |
| Perfis / instalação / explorar | `src/profiles.js`, `src/installer.js`, `src/catalog.js` | Prontos e testados | Sim (fora do escopo da spec) |
| UI | `renderer/*` | Tabela padrão com filtros por coluna, paginação fixa, popups, tipografia Inter + Source Code Pro | Sim — telas novas usam os mesmos componentes |
| Persistência | arquivos JSON em `%APPDATA%/claude-ledger` | Sem banco | **Substituir por SQLite** |
| Testes | scripts ad-hoc no scratchpad | Sem suíte no repositório | **Criar** `test/` com `node:test` |
| API | IPC Electron (`preload.js`) | Sem HTTP | Contratos da seção 8 viram canais IPC com os mesmos nomes e parâmetros |

### Fontes de dados disponíveis — verificadas nesta máquina

| Fonte | O que traz | Verificado |
|---|---|---|
| Transcript `assistant` | `usage` por requisição (tokens, cache 5m/1h), `model`, `requestId`, `tool_use` (nome, input, id) | ✅ 16.461 linhas |
| Transcript `user` → `tool_result` | resultado por `tool_use_id`, `is_error`, `toolUseResult` (stdout/stderr/interrupted) | ✅ 9.315 resultados, 325 erros, 18 negações |
| Transcript `cost-state` | **custo reportado pelo cliente**: `totalCostUSD`, `modelUsage.<modelo>.costUSD` + tokens, `totalAPIDuration`, `totalToolDuration`, linhas +/-, `hasUnknownModelCost` | ✅ 111 snapshots |
| Transcript `system/compact_boundary` | compactação: `trigger`, `preTokens`, `postTokens`, `durationMs` | ✅ 23 |
| Transcript `system/turn_duration` | duração do turno, nº de mensagens | ✅ 596 |
| Transcript `ai-title` | título da sessão (não inventado) | ✅ 4.740 |
| `node:sqlite` dentro do Electron | banco embutido, **sem módulo nativo** | ✅ testado |
| Status line | já existe uma status line personalizada na máquina de desenvolvimento | ✅ existe — exige wrapper |
| OpenTelemetry | variáveis da spec | ⚠️ **não verificado** — validar na fase 1 contra a doc oficial e a versão 2.1.322 |
| `rate_limits.*` no JSON da status line | limites do plano | ⚠️ **não verificado** — só confirmável capturando um JSON real |

**Incompatibilidades e fallbacks**

1. **Collector OTel** — a spec presume um Collector externo. Proposta: receptor **OTLP/HTTP-JSON embutido no app** (`127.0.0.1:4318`, só local, opt-in). Limite: só recebe enquanto o app está aberto. Fallback: transcritos cobrem o histórico; sessões sem OTel ficam marcadas `completude = parcial`.
2. **Status line já personalizada** — wrapper transparente: lê o stdin, grava o snapshot (só `rate_limits` + `session_id`), repassa o mesmo stdin ao comando original e devolve a saída dele sem alterar nada. Desinstalação restaura o comando original. Instalação só com confirmação e backup.
3. **Custo por requisição reportado** — não existe nos transcritos. Existe **por sessão e por modelo** (`cost-state`). A reconciliação por requisição só existe com OTel. Sem OTel: reconciliação por sessão×modelo (`insufficient_data` por requisição).
4. **Hora de início de ferramenta** — `tool_use` (assistant) e `tool_result` (user) têm timestamps de gravação, não de execução. A duração é aproximada e marcada `fonte=transcript, precisão=aproximada`. O Gantt fica desabilitado sem OTel, como a spec manda.

---

## (b) Arquitetura proposta (reaproveitando o projeto)

```
 ~/.claude/projects/*.jsonl ─┐
 OTLP/HTTP 127.0.0.1:4318 ───┤ (opt-in)      ┌──────────── processo principal (Electron) ────────────┐
 wrapper da status line ─────┤──────────────▶│ src/ingest/   importadores com cursor + dedup           │
 hooks (opt-in) ─────────────┘               │ src/db/       node:sqlite · migrações (user_version)   │
                                             │ src/domain/   normalização de eventos, custos, regras  │
                                             │ src/services/ timeline · diagnósticos · custos · eficiência│
                                             │ ipc.js        contratos da seção 8 (mesmos nomes)        │
                                             └──────────────────────────┬─────────────────────────────┘
                                                                        │ IPC (preload)
                                             renderer/  telas novas usando a tabela/paginação/popup atuais
```

- **Camadas** (Domain / Application / Infrastructure / Presentation, adaptado a JS): `domain` (regras puras, sem I/O, 100% testável) → `services` (orquestra) → `db`/`ingest` (infra) → `ipc` (apresentação).
- **Sem novas dependências de runtime.** `node:sqlite`, `node:http` e `node:test` são nativos.
- **Privacidade por padrão:** nunca grava texto de prompt nem de resposta. De ferramentas grava nome, status, duração, assinatura de erro normalizada e, para `Read`/`Edit`/`Write`, **hash do caminho** + nome do arquivo (necessário para a regra `repeated_read`). O caminho completo fica só em memória, exibido sob demanda.
- **Idempotência:** chave única por fonte — `model_requests(source, request_id)`, `session_events(source, source_event_id = uuid)`.
- **Cursor incremental:** `ingestion_state(source_id=caminho, cursor=offset em bytes, size, mtime, head_hash)`. Arquivo menor que o cursor ou com `head_hash` diferente = truncado/rotacionado → reimporta o arquivo (a dedup garante que nada conta duas vezes).

### Navegação (proposta: mantém o que existe, acrescenta o da spec)

```
Visão geral · Sessões (→ Timeline · Diagnóstico) · Diagnósticos · Eficiência · Agentes · Modelos
Custos e assinatura · Auditoria · Extensões · Explorar · Adicionar · Configurações (Perfis, Preços, Coleta, Privacidade)
```
"Assuntos" fica para a fase 5 (exige classificar conteúdo → consentimento explícito).

---

## (c) Esquema e migrações

Migração `001_init.sql` (aplicada via `PRAGMA user_version`):

| Tabela | Colunas | Índices / unicidade |
|---|---|---|
| `projects` | id, name, root_path | unique(root_path) |
| `sessions` | id, project_id, title, start_at, end_at, status, source_completeness (`completo`/`parcial`/`histórico`) | (project_id, start_at) |
| `agents` | id, session_id, name, kind (`main`/`subagent`), parent_agent_id, tool_use_id | (session_id) |
| `session_events` | id, session_id, agent_id, type, at, end_at, status, source, source_event_id, payload_sanitized (JSON) | unique(source, source_event_id); (session_id, at) |
| `model_requests` | id, session_id, agent_id, model, request_id, tokens_in, tokens_out, cache_read, cache_w5m, cache_w1h, reported_cost, recalculated_cost, pricing_version_id, cost_status, started_at, ended_at, source | unique(source, request_id); (session_id, model, started_at) |
| `tool_calls` | id, session_id, agent_id, tool_use_id, tool_name, target_hash, target_label, started_at, ended_at, duration_precision, status (`ok`/`erro`/`negado`/`cancelado`/`desconhecido`), error_signature | unique(tool_use_id); (session_id, agent_id) |
| `session_cost_reports` | session_id, model, reported_cost, captured_at, has_unknown_cost, source | unique(session_id, model) — último snapshot |
| `trace_spans` | trace_id, span_id, parent_span_id, session_id, agent_id | unique(span_id) — só com OTel |
| `usage_snapshots` | id, captured_at, window (`5h`/`7d`), used_pct, resets_at, source | (captured_at, window) |
| `diagnostics` | id, session_id, rule_id, rule_version, severity, title, explanation, recommendation, confidence, evidence_ids (JSON), evidence_fingerprint, status, feedback | unique(session_id, rule_id, rule_version, evidence_fingerprint); (rule_id, severity) |
| `task_outcomes` | id, session_id, task_id, outcome (`approved`/`rejected`/`partial`/`unreviewed`), evaluation_method, evidence_ref, evaluated_at | (session_id) |
| `pricing_versions` | id, model_pattern, effective_from, prices_json, currency, source_url | **imutável** (trigger bloqueia UPDATE) |
| `ingestion_state` | source_id, cursor, size, mtime, head_hash, last_seen_at, error | pk(source_id) |
| `settings_kv` | key, value | — retenção, permissões concedidas, parâmetros das regras |

Os arquivos JSON atuais (`pricing.json` e a análise do `cache.json`) são migrados uma vez; os antigos ficam como backup.

---

## (d) Backlog em ordem de dependência

**Fase 1 — dados confiáveis**
1. `src/db`: conexão `node:sqlite`, migrações, repositórios.
2. Importador incremental de transcritos com cursor em bytes + detecção de truncamento + dedup.
3. Normalização: sessões (com `ai-title`), agentes (hierarquia via `toolUseId`), `model_requests`, `tool_calls` (pareia `tool_use` ↔ `tool_result`), `compaction`, `turn_duration`, `cost-state`.
4. `pricing_versions` + recálculo por versão vigente na data da requisição; preço ausente → `cost_status = incompleto` (nunca zero).
5. Reconciliação sessão×modelo: reportado (`cost-state`) × recalculado → `validated` / `divergent` / `insufficient_data` (tolerância configurável, padrão 2%).
6. **Bônus de alto valor:** sugerir correção da tabela de preços a partir do `cost-state` (resolve "preços estimados").
7. Status de coleta por fonte (`ingestion/status`).
8. Migrar as telas atuais para ler do banco (mesmos números → teste de regressão).

**Fase 2 — timeline**
9. Lista de sessões (já existe; liga a nova tela).
10. Timeline: cabeçalho, cards (com "indisponível"), eventos cronológicos, painel lateral, filtros, busca, exportar JSON/CSV.
11. Navegação por evidência (`#/sessions/:id/timeline?event=`).

**Fase 3 — diagnósticos**
12. Motor de regras versionadas + persistência + feedback.
13. Regras: `repeated_read`, `repeated_error`, `high_compaction`, `latency_outlier`, `permission_denials` (parâmetros em Configurações, baseline P50/P90 com amostra mínima).
14. Tela de diagnósticos (por sessão e global), "Ir à evidência".

**Fase 4 — eficiência**
15. `task_outcomes`: marcação manual por sessão + regra opcional (comando de teste detectado com exit code) — sem evidência fica `unreviewed`.
16. Tela de eficiência com `n`, mediana/P90, aviso de amostra insuficiente, rankings separados.

**Fase 5 — refinamento**
17. Wrapper da status line + snapshots 5h/7d.
18. Receptor OTLP embutido (opt-in) + hooks (opt-in).
19. Retenção, exclusão por sessão/projeto, alertas, "Assuntos" com consentimento.

**Primeira fatia vertical (a spec pede):** 1 → 2 → 3 (parcial) → 10 → 12–13 (`repeated_read` + `repeated_error`) → 11.

---

## (e) Plano de testes (`node:test`, sem dependência nova)

| Critério da spec | Teste |
|---|---|
| 1. Sem dupla contagem | importar o mesmo arquivo 2× e um arquivo com linhas repetidas → totais iguais |
| 1b. Incremental | anexar linhas ao arquivo → importa só o delta; truncar → reimporta sem duplicar |
| 2. Timeline auditável | todo evento tem `source` + `at`; evidência de diagnóstico resolve para o evento certo |
| 3. Dados parciais | sessão sem `cost-state` → `insufficient_data`; sem `rate_limits` → "indisponível" |
| 4. Atribuição | subagente só recebe requisições do próprio arquivo; requisição sem vínculo → `unattributed` |
| 5. Cálculo versionado | casos com as 5 classes de token; mudar a tabela não altera custo histórico |
| 6. Cobrança distinta | tela de custos nunca rotula o equivalente de API como fatura (teste de texto) |
| 7. Resultado sem suposição | sessão sem avaliação conta como `unreviewed`, fora do denominador |
| 8. Regras explicáveis | cada achado tem `rule_id`, versão, evidências; falso positivo persiste e não apaga evidência |
| 9. Integração segura | wrapper preserva stdout da status line original byte a byte |
| 10. Privacidade | nenhuma coluna contém texto de prompt/resposta (varredura no banco de teste) |
| 11. Filtros consistentes | mesmo filtro → soma de cards = soma da tabela = soma do gráfico |
| 12. Performance | 100 mil eventos sintéticos: timeline paginada < 100 ms por página |

Fixtures: transcritos sintéticos gerados pelos próprios testes (nenhum dado real).

---

## (f) Decisões tomadas

1. **Identidade visual:** a especificação sugeria fundo `#0C0C0C` e nenhum degradê; o produto manteve preto `#000000` com botões levemente destacados, por consistência com as telas já existentes.
2. **Avaliação de tarefas (fase 4):** além da marcação manual, a sessão é avaliada automaticamente pelo último comando de teste reconhecido (passou → aprovada; falhou → reprovada; sem teste → não avaliada).
