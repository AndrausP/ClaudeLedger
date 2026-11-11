'use strict';
// Migrações sequenciais. Índice + 1 = PRAGMA user_version após aplicar.
// Nunca editar uma migração já publicada: criar a próxima.
module.exports = [
  /* 001 — esquema inicial (especificação v1.0, seção 7) */ `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,               -- pasta em ~/.claude/projects (identidade estável)
    name TEXT NOT NULL,
    root_path TEXT                     -- cwd observado nos eventos
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,               -- sessionId do Claude Code
    project_id TEXT REFERENCES projects(id),
    title TEXT,                        -- ai-title do próprio Claude Code; nunca inventado
    start_at INTEGER, end_at INTEGER,  -- epoch ms (UTC)
    status TEXT NOT NULL DEFAULT 'desconhecido',
    source_completeness TEXT NOT NULL DEFAULT 'histórico',   -- completo | parcial | histórico
    updated_at INTEGER, diag_at INTEGER
  );
  CREATE INDEX ix_sessions_project ON sessions(project_id, start_at);

  CREATE TABLE agents (
    id TEXT PRIMARY KEY,               -- main:<session> | sub:<arquivo do subagente>
    session_id TEXT NOT NULL REFERENCES sessions(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL,                -- main | subagent
    parent_agent_id TEXT,
    tool_use_id TEXT                   -- chamada Agent/Task que criou o subagente
  );
  CREATE INDEX ix_agents_session ON agents(session_id);

  CREATE TABLE session_events (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    agent_id TEXT,
    type TEXT NOT NULL,                -- user_prompt | model_response | tool_call | compaction | turn | api_error
    at INTEGER NOT NULL, end_at INTEGER,
    status TEXT,                       -- ok | erro | negado | cancelado | desconhecido
    source TEXT NOT NULL,              -- transcript | otel | hook | status_line
    source_event_id TEXT NOT NULL,
    payload_sanitized TEXT,            -- JSON sem texto de prompt/resposta
    UNIQUE (source, source_event_id)
  );
  CREATE INDEX ix_events_session_at ON session_events(session_id, at);

  CREATE TABLE model_requests (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    agent_id TEXT,
    model TEXT NOT NULL,
    request_id TEXT NOT NULL,          -- message.id da API
    tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0, cache_w5m INTEGER NOT NULL DEFAULT 0, cache_w1h INTEGER NOT NULL DEFAULT 0,
    reported_cost REAL,                -- só quando a fonte reporta por requisição (OTel)
    recalculated_cost REAL,            -- NULL = cálculo incompleto (nunca 0 fabricado)
    pricing_version_id INTEGER,
    cost_status TEXT NOT NULL,         -- ok | sem_preco
    started_at INTEGER, ended_at INTEGER,
    source TEXT NOT NULL,
    UNIQUE (source, request_id)
  );
  CREATE INDEX ix_requests_session ON model_requests(session_id, model, started_at);

  CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,               -- tool_use_id
    session_id TEXT NOT NULL REFERENCES sessions(id),
    agent_id TEXT,
    tool_name TEXT NOT NULL,
    target_hash TEXT, target_label TEXT,   -- arquivo: hash do caminho + nome do arquivo
    input_hash TEXT,                       -- hash dos parâmetros (nunca os parâmetros)
    started_at INTEGER, ended_at INTEGER,
    duration_precision TEXT NOT NULL DEFAULT 'aproximada',
    status TEXT NOT NULL DEFAULT 'desconhecido',
    error_signature TEXT,
    is_test INTEGER NOT NULL DEFAULT 0     -- comando de teste reconhecido (fase 4)
  );
  CREATE INDEX ix_tools_session ON tool_calls(session_id, agent_id, started_at);

  CREATE TABLE session_cost_reports (
    session_id TEXT NOT NULL REFERENCES sessions(id),
    model TEXT NOT NULL,               -- '*' = total da sessão
    reported_cost REAL,
    tokens_json TEXT,
    has_unknown_cost INTEGER NOT NULL DEFAULT 0,
    captured_at INTEGER,
    source TEXT NOT NULL,
    PRIMARY KEY (session_id, model)
  );

  CREATE TABLE trace_spans (
    span_id TEXT PRIMARY KEY, trace_id TEXT, parent_span_id TEXT, session_id TEXT, agent_id TEXT
  );

  CREATE TABLE usage_snapshots (
    id INTEGER PRIMARY KEY, captured_at INTEGER NOT NULL, window TEXT NOT NULL,
    used_pct REAL, resets_at INTEGER, source TEXT NOT NULL
  );
  CREATE INDEX ix_usage ON usage_snapshots(captured_at, window);

  CREATE TABLE diagnostics (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    rule_id TEXT NOT NULL, rule_version INTEGER NOT NULL,
    severity TEXT NOT NULL,            -- info | atenção | crítico
    title TEXT NOT NULL, explanation TEXT NOT NULL, recommendation TEXT, confidence TEXT,
    evidence_ids TEXT NOT NULL,        -- JSON [session_events.id]
    evidence_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',   -- aberto | obsoleto
    feedback TEXT,                     -- util | falso_positivo | ignorado
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, rule_id, rule_version, evidence_fingerprint)
  );
  CREATE INDEX ix_diag_rule ON diagnostics(rule_id, severity);

  CREATE TABLE task_outcomes (
    id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), task_id TEXT,
    outcome TEXT NOT NULL, evaluation_method TEXT NOT NULL, evidence_ref TEXT, evaluated_at INTEGER NOT NULL
  );
  CREATE INDEX ix_outcomes_session ON task_outcomes(session_id);

  CREATE TABLE pricing_versions (
    id INTEGER PRIMARY KEY,
    effective_from INTEGER NOT NULL,   -- epoch ms
    prices_json TEXT NOT NULL,         -- [{match, in, out, cache_read?, cache_w5m?, cache_w1h?}] USD / 1M tokens
    currency TEXT NOT NULL DEFAULT 'USD',
    source_url TEXT,
    created_at INTEGER NOT NULL
  );
  -- histórico de tarifas é imutável
  CREATE TRIGGER pricing_versions_immutable BEFORE UPDATE ON pricing_versions
  BEGIN SELECT RAISE(ABORT, 'pricing_versions é imutável: crie uma nova versão'); END;

  CREATE TABLE ingestion_state (
    source_id TEXT PRIMARY KEY,        -- caminho do arquivo
    cursor INTEGER NOT NULL,           -- offset em bytes já consumido (sempre após um \\n)
    size INTEGER, mtime REAL, head_hash TEXT,
    last_seen_at INTEGER, error TEXT
  );

  CREATE TABLE settings_kv (key TEXT PRIMARY KEY, value TEXT);
  `,

  /* 002 — OTel, assuntos (etiquetas manuais), exclusão persistente */ `
  -- requisições vindas do OpenTelemetry: tabela própria para nunca somar em dobro com o transcrito;
  -- servem para preencher model_requests.reported_cost quando casam (sessão + modelo + tokens + horário)
  CREATE TABLE otel_requests (
    id INTEGER PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    session_id TEXT, model TEXT, at INTEGER,
    tokens_in INTEGER, tokens_out INTEGER, cache_read INTEGER, cache_write INTEGER,
    cost_usd REAL, duration_ms INTEGER,
    matched_request_id INTEGER
  );
  CREATE INDEX ix_otel_session ON otel_requests(session_id, model, at);

  CREATE TABLE otel_events (
    id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, session_id TEXT, name TEXT, at INTEGER, attrs_sanitized TEXT
  );

  CREATE TABLE session_tags (session_id TEXT NOT NULL, tag TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (session_id, tag));

  -- sessões excluídas pelo usuário: a ingestão as ignora daqui em diante
  CREATE TABLE excluded_sessions (session_id TEXT PRIMARY KEY, excluded_at INTEGER NOT NULL);
  `,

  /* 003 — cada chamada de ferramenta sabe qual resposta/modelo a originou (filtro por modelo, auditoria) */ `
  ALTER TABLE tool_calls ADD COLUMN model TEXT;
  ALTER TABLE tool_calls ADD COLUMN request_id TEXT;
  -- preenche o histórico: a resposta do mesmo agente que começou por último até a chamada (janela de 2 min).
  -- (ORDER BY só com coluna interna: referência à tabela externa no ORDER BY não compila em todas as versões do SQLite)
  UPDATE tool_calls SET
    request_id = (SELECT m.request_id FROM model_requests m WHERE m.session_id = tool_calls.session_id AND m.agent_id IS tool_calls.agent_id
                  AND m.started_at <= tool_calls.started_at AND m.started_at >= tool_calls.started_at - 120000 ORDER BY m.started_at DESC LIMIT 1),
    model = (SELECT m.model FROM model_requests m WHERE m.session_id = tool_calls.session_id AND m.agent_id IS tool_calls.agent_id
                  AND m.started_at <= tool_calls.started_at AND m.started_at >= tool_calls.started_at - 120000 ORDER BY m.started_at DESC LIMIT 1);
  CREATE INDEX ix_tools_model ON tool_calls(model, started_at);
  CREATE INDEX ix_tools_request ON tool_calls(request_id);
  CREATE INDEX ix_tools_name ON tool_calls(tool_name, status);
  CREATE INDEX ix_requests_agent ON model_requests(agent_id, started_at);
  `,
];
