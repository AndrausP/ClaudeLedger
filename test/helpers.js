'use strict';
// Fábrica de transcritos sintéticos (nenhum dado real do usuário nos testes).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { open } = require('../src/db');

const SECRET = 'SEGREDO-NAO-PODE-IR-PRO-BANCO';
const T0 = Date.parse('2026-11-01T10:00:00Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-')); }
function db() { const d = tmpdir(); return { db: open(path.join(d, 't.db')), dir: d }; }

let n = 0;
const uid = () => 'u' + (++n).toString(36).padStart(6, '0');

const line = {
  title: (session, title) => ({ type: 'ai-title', aiTitle: title, sessionId: session }),
  prompt: (s, text = 'faça X ' + SECRET) => ({ type: 'user', uuid: uid(), timestamp: iso(s), message: { role: 'user', content: text } }),
  // uma resposta do modelo; tools = [{ id, name, input }]
  assistant: (s, msgId, { model = 'claude-sonnet-test', inTok = 10, out = 100, cr = 1000, w5 = 0, w1 = 200, tools = [] } = {}) => ({
    type: 'assistant', uuid: uid(), timestamp: iso(s),
    message: { id: msgId, model, role: 'assistant', content: [{ type: 'text', text: 'resposta ' + SECRET }, ...tools.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.input || {} }))],
      usage: { input_tokens: inTok, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: w5 + w1, cache_creation: { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1 } } },
  }),
  result: (s, toolId, { error = false, text = 'ok ' + SECRET, interrupted = false } = {}) => ({
    type: 'user', uuid: uid(), timestamp: iso(s), toolUseResult: { interrupted },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, is_error: error, content: text }] },
  }),
  compact: (s) => ({ type: 'system', subtype: 'compact_boundary', uuid: uid(), timestamp: iso(s), compactMetadata: { trigger: 'auto', preTokens: 150000, postTokens: 20000, durationMs: 9000 } }),
  cost: (session, total, models) => ({ type: 'cost-state', sessionId: session, totalCostUSD: total, modelUsage: models, hasUnknownModelCost: false }),
  noise: () => ({ type: 'api-request-blob', blob: 'x'.repeat(5000) + SECRET }),
};

// cria ~/.claude/projects/<proj>/<session>.jsonl
function writeSession(root, proj, session, lines, { raw } = {}) {
  const dir = path.join(root, proj);
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, session + '.jsonl');
  fs.writeFileSync(f, raw != null ? raw : lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return f;
}
function writeSubagent(root, proj, session, agentFile, agentType, toolUseId, lines) {
  const dir = path.join(root, proj, session, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, agentFile + '.meta.json'), JSON.stringify({ agentType, toolUseId }));
  const f = path.join(dir, agentFile + '.jsonl');
  fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return f;
}

const PRICING = [{ match: 'sonnet-test', in: 3, out: 15 }, { match: 'opus-test', in: 5, out: 25 }];

module.exports = { db, tmpdir, line, writeSession, writeSubagent, SECRET, PRICING, iso, T0 };
