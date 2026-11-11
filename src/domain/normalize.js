'use strict';
// Normalização de linhas de transcript em eventos canônicos (spec 2 — "Eventos a suportar").
// Puro: recebe o objeto da linha, devolve registros. Nunca copia texto de prompt, resposta ou saída de ferramenta.
const crypto = require('crypto');

const h16 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const TEST_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bnpx\s+(jest|vitest|mocha|playwright\s+test)\b|\b(jest|vitest|mocha|pytest|phpunit|rspec)\b|\bpython\s+-m\s+(pytest|unittest)\b|\bdotnet\s+test\b|\bgo\s+test\b|\bcargo\s+test\b|\bmvn\b.*\btest\b|\bgradlew?\b.*\btest\b|\bnode\s+--test\b/i;
const DENIED = /doesn.t want to proceed|user (rejected|denied)|permission (was )?denied|was blocked|not allowed by|hook .*block/i;
const INTERRUPTED = /interrupted by user|\[request interrupted/i;

const ts = (o) => { const t = Date.parse(o.timestamp); return isNaN(t) ? null : t; };

// "Error: ENOENT at C:\x\y.js:12" → "error: enoent at <path>:#"
function errorSignature(text) {
  const line = String(text || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) || '';
  return line
    .replace(/[A-Za-z]:\\[^\s'"`:]+|\/[^\s'"`:]*\/[^\s'"`:]+/g, '<path>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/\d+/g, '#')
    .toLowerCase().slice(0, 140);
}

const resultText = (b) => (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n') : '');

// o que pode ser guardado de um tool_use, sem os parâmetros em si
function toolMeta(block) {
  const input = block.input || {};
  const name = block.name || '?';
  const meta = { tool_name: name, input_hash: h16(JSON.stringify(input)), target_hash: null, target_label: null, is_test: 0, label: null };
  const file = input.file_path || input.notebook_path;
  if (FILE_TOOLS.has(name) && file) {
    const norm = String(file).replace(/\\/g, '/').toLowerCase();
    meta.target_hash = h16(norm);
    meta.target_label = String(file).split(/[\\/]/).pop();
  }
  if ((name === 'Bash' || name === 'PowerShell') && input.command) {
    const cmd = String(input.command);
    meta.label = cmd.trim().split(/\s+/)[0].replace(/^.*[\\/]/, '').slice(0, 40); // só o executável
    meta.is_test = TEST_CMD.test(cmd) ? 1 : 0;
  }
  if (name === 'Agent' || name === 'Task') meta.label = String(input.subagent_type || 'general-purpose').slice(0, 60);
  if (name === 'Skill') meta.label = String(input.skill || '').slice(0, 60);
  if (name.startsWith('mcp__')) meta.label = name.split('__')[1] || null;
  return meta;
}

function resultStatus(block, toolUseResult) {
  if (!block.is_error) return 'ok';
  const t = resultText(block);
  if (DENIED.test(t)) return 'negado';
  if ((toolUseResult && toolUseResult.interrupted) || INTERRUPTED.test(t)) return 'cancelado';
  return 'erro';
}

// Devolve { kind, ... } ou null. kind: title | cost | request | api_error | prompt | results | compaction | turn
function normalizeLine(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.type === 'ai-title' && o.aiTitle) return { kind: 'title', title: String(o.aiTitle).slice(0, 200) };
  if (o.type === 'cost-state') {
    const models = Object.entries(o.modelUsage || {}).map(([model, u]) => ({ model, cost: typeof u.costUSD === 'number' ? u.costUSD : null, tokens: { in: u.inputTokens, out: u.outputTokens, cr: u.cacheReadInputTokens, w5m: u.cacheCreationEphemeral5mInputTokens, w1h: u.cacheCreationEphemeral1hInputTokens } }));
    return { kind: 'cost', total: typeof o.totalCostUSD === 'number' ? o.totalCostUSD : null, unknown: !!o.hasUnknownModelCost, models, apiMs: o.totalAPIDuration, toolMs: o.totalToolDuration };
  }
  const at = ts(o);
  if (o.type === 'assistant' && o.isApiErrorMessage) {
    return { kind: 'api_error', at, uuid: o.uuid, error: String(o.error || 'desconhecido').slice(0, 60), cause: o.streamCutCause ? String(o.streamCutCause).slice(0, 60) : null };
  }
  if (o.type === 'assistant' && o.message && o.message.usage) {
    const m = o.message;
    if (!m.model || String(m.model).startsWith('<')) return null; // <synthetic>
    const u = m.usage, cc = u.cache_creation || {};
    const w1h = cc.ephemeral_1h_input_tokens || 0;
    const w5m = cc.ephemeral_5m_input_tokens != null ? cc.ephemeral_5m_input_tokens : Math.max(0, (u.cache_creation_input_tokens || 0) - w1h);
    const tools = Array.isArray(m.content) ? m.content.filter((b) => b && b.type === 'tool_use' && b.id).map((b) => ({ id: b.id, ...toolMeta(b) })) : [];
    return {
      kind: 'request', at, uuid: o.uuid, request_id: m.id || o.uuid, model: m.model, stop: m.stop_reason || null,
      tokens_in: u.input_tokens || 0, tokens_out: u.output_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_w5m: w5m, cache_w1h: w1h,
      tools, cwd: o.cwd || null,
    };
  }
  if (o.type === 'user' && o.message) {
    const c = o.message.content;
    if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) {
      return { kind: 'results', at, results: c.filter((b) => b && b.type === 'tool_result').map((b) => ({ id: b.tool_use_id, status: resultStatus(b, o.toolUseResult), error_signature: b.is_error ? errorSignature(resultText(b)) : null })) };
    }
    if (o.isMeta || o.isCompactSummary || o.isVisibleInTranscriptOnly) return null;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n') : '';
    if (!text || /^<(command-|local-command|system-reminder)/.test(text.trim())) return null;
    return { kind: 'prompt', at, uuid: o.uuid, chars: text.length, cwd: o.cwd || null }; // só o tamanho
  }
  if (o.type === 'system' && o.subtype === 'compact_boundary') {
    const cm = o.compactMetadata || {};
    return { kind: 'compaction', at, uuid: o.uuid, trigger: cm.trigger || null, preTokens: cm.preTokens ?? null, postTokens: cm.postTokens ?? null, durationMs: cm.durationMs ?? null };
  }
  if (o.type === 'system' && o.subtype === 'turn_duration') {
    return { kind: 'turn', at, uuid: o.uuid, durationMs: o.durationMs ?? null, messages: o.messageCount ?? null };
  }
  return null;
}

// filtro barato antes do JSON.parse: pula só tipos de ruído CONHECIDOS (independe da ordem das chaves;
// tipo desconhecido é sempre analisado — formato mutável não pode virar perda silenciosa de dado)
const NOISE = new Set(['api-request-blob', 'api-request-shape', 'api-request', 'attachment', 'file-history-snapshot', 'file-history-delta',
  'queue-operation', 'last-prompt', 'mode', 'permission-mode', 'atis-latch', 'session-owner', 'bridge-session', 'tools-used']);
function worthParsing(line) {
  if (line.startsWith('{"type":"')) { const t = line.slice(9, line.indexOf('"', 9)); return !NOISE.has(t); }
  if (line.length > 4000 && line.lastIndexOf('"type":"attachment"') > line.length - 600) return false;
  return true;
}

module.exports = { normalizeLine, worthParsing, errorSignature, toolMeta, WRITE_TOOLS, TEST_CMD, h16 };
