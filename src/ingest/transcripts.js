'use strict';
// Importador incremental de transcritos (spec 6.4).
// - cursor em bytes por arquivo; só lê o que foi acrescentado
// - arquivo menor que o cursor ou com cabeçalho diferente = truncado/rotacionado → reimporta (dedup garante zero duplicata)
// - linha incompleta no fim do arquivo fica para a próxima rodada
// - idempotente: chaves únicas por fonte em todas as tabelas
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { tx } = require('../db');
const { normalizeLine, worthParsing } = require('../domain/normalize');
const { costOf, versionAt } = require('../domain/pricing');

const SRC = 'transcript';
const CHUNK = 8 * 1024 * 1024;

function walk(dir, out = []) {
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.name.endsWith('.jsonl')) out.push(f);
  }
  return out;
}

// garante uma versão de preço igual à tabela atual; mudança gera NOVA versão (histórico não é reescrito)
function ensurePricing(db, rows) {
  const json = JSON.stringify(rows || []);
  const latest = db.prepare('SELECT * FROM pricing_versions ORDER BY effective_from DESC, id DESC LIMIT 1').get();
  if (!latest) db.prepare('INSERT INTO pricing_versions(effective_from, prices_json, created_at, source_url) VALUES (0, ?, ?, ?)').run(json, Date.now(), 'tabela local do app');
  else if (latest.prices_json !== json) db.prepare('INSERT INTO pricing_versions(effective_from, prices_json, created_at, source_url) VALUES (?, ?, ?, ?)').run(Date.now(), json, Date.now(), 'tabela local do app');
  return db.prepare('SELECT id, effective_from, prices_json FROM pricing_versions').all().map((v) => ({ id: v.id, effective_from: v.effective_from, rows: JSON.parse(v.prices_json) }));
}

function statements(db) {
  const p = (sql) => db.prepare(sql);
  return {
    getState: p('SELECT * FROM ingestion_state WHERE source_id = ?'),
    excluded: p('SELECT 1 FROM excluded_sessions WHERE session_id = ?'),
    setState: p(`INSERT INTO ingestion_state(source_id, cursor, size, mtime, head_hash, last_seen_at, error) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET cursor=excluded.cursor, size=excluded.size, mtime=excluded.mtime, head_hash=excluded.head_hash, last_seen_at=excluded.last_seen_at, error=excluded.error`),
    project: p('INSERT OR IGNORE INTO projects(id, name) VALUES (?, ?)'),
    projectRoot: p('UPDATE projects SET root_path = ?, name = ? WHERE id = ? AND root_path IS NULL'),
    session: p('INSERT OR IGNORE INTO sessions(id, project_id, updated_at) VALUES (?, ?, ?)'),
    touch: p('UPDATE sessions SET start_at = MIN(COALESCE(start_at, ?1), ?1), end_at = MAX(COALESCE(end_at, ?1), ?1), updated_at = ?2 WHERE id = ?3'),
    title: p('UPDATE sessions SET title = ? WHERE id = ?'),
    agent: p('INSERT OR IGNORE INTO agents(id, session_id, name, kind, parent_agent_id, tool_use_id) VALUES (?,?,?,?,?,?)'),
    request: p(`INSERT INTO model_requests(session_id, agent_id, model, request_id, tokens_in, tokens_out, cache_read, cache_w5m, cache_w1h, recalculated_cost, pricing_version_id, cost_status, started_at, ended_at, source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source, request_id) DO UPDATE SET tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out, cache_read=excluded.cache_read,
        cache_w5m=excluded.cache_w5m, cache_w1h=excluded.cache_w1h, recalculated_cost=excluded.recalculated_cost, cost_status=excluded.cost_status, ended_at=excluded.ended_at
      WHERE excluded.tokens_out >= model_requests.tokens_out`),
    event: p(`INSERT INTO session_events(session_id, agent_id, type, at, end_at, status, source, source_event_id, payload_sanitized) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source, source_event_id) DO UPDATE SET payload_sanitized = excluded.payload_sanitized`),
    eventResult: p('UPDATE session_events SET end_at = ?, status = ? WHERE source = ? AND source_event_id = ?'),
    tool: p(`INSERT OR IGNORE INTO tool_calls(id, session_id, agent_id, tool_name, target_hash, target_label, input_hash, started_at, is_test, model, request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
    toolResult: p('UPDATE tool_calls SET ended_at = ?, status = ?, error_signature = ? WHERE id = ?'),
    cost: p(`INSERT INTO session_cost_reports(session_id, model, reported_cost, tokens_json, has_unknown_cost, captured_at, source) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(session_id, model) DO UPDATE SET reported_cost=excluded.reported_cost, tokens_json=excluded.tokens_json, has_unknown_cost=excluded.has_unknown_cost, captured_at=excluded.captured_at`),
  };
}

function context(root, file, S, now) {
  const rel = path.relative(root, file).split(path.sep);
  const project = rel[0];
  const isSub = rel.includes('subagents');
  const session = isSub ? rel[rel.indexOf('subagents') - 1] : path.basename(file, '.jsonl');
  const main = 'main:' + session;
  S.project.run(project, project);
  S.session.run(session, project, now);
  S.agent.run(main, session, 'main', 'main', null, null);
  let agent = main;
  if (isSub) {
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch { /* sem meta */ }
    agent = 'sub:' + path.basename(file, '.jsonl');
    S.agent.run(agent, session, String(meta.agentType || 'subagent'), 'subagent', main, meta.toolUseId || null);
  }
  return { project, session, agent, isSub };
}

function apply(rec, ctx, S, versions, now) {
  const { session, agent } = ctx;
  const ev = (type, id, at, end, status, payload) => S.event.run(session, agent, type, at, end ?? null, status ?? null, SRC, id, payload ? JSON.stringify(payload) : null);
  if (rec.at) S.touch.run(rec.at, now, session);
  switch (rec.kind) {
    case 'title': if (!ctx.isSub) S.title.run(rec.title, session); break;
    case 'cost':
      if (ctx.isSub) break;
      S.cost.run(session, '*', rec.total, JSON.stringify({ apiMs: rec.apiMs, toolMs: rec.toolMs }), rec.unknown ? 1 : 0, now, SRC);
      for (const m of rec.models) S.cost.run(session, m.model, m.cost, JSON.stringify(m.tokens), rec.unknown ? 1 : 0, now, SRC);
      break;
    case 'request': {
      const v = versionAt(versions, rec.at || 0) || versions[0];
      const c = costOf(rec, v ? v.rows : []);
      S.request.run(session, agent, rec.model, rec.request_id, rec.tokens_in, rec.tokens_out, rec.cache_read, rec.cache_w5m, rec.cache_w1h, c.cost, v ? v.id : null, c.status, rec.at, rec.at, SRC);
      ev('model_response', 'msg:' + rec.request_id, rec.at, null, 'ok', { model: rec.model, in: rec.tokens_in, out: rec.tokens_out, cr: rec.cache_read, cw: rec.cache_w5m + rec.cache_w1h, cost: c.cost, tools: rec.tools.map((t) => t.tool_name), stop: rec.stop });
      if (rec.cwd && !ctx.isSub) S.projectRoot.run(rec.cwd, rec.cwd.split(/[\\/]/).filter(Boolean).pop() || rec.cwd, ctx.project);
      for (const t of rec.tools) {
        S.tool.run(t.id, session, agent, t.tool_name, t.target_hash, t.target_label, t.input_hash, rec.at, t.is_test, rec.model, rec.request_id);
        ev('tool_call', 'tool:' + t.id, rec.at, null, 'desconhecido', { tool: t.tool_name, label: t.label, target: t.target_label, is_test: t.is_test || undefined, tool_use_id: t.id });
      }
      break;
    }
    case 'results':
      for (const r of rec.results) {
        S.toolResult.run(rec.at, r.status, r.error_signature, r.id);
        S.eventResult.run(rec.at, r.status, SRC, 'tool:' + r.id);
      }
      break;
    case 'api_error': ev('api_error', 'uuid:' + rec.uuid, rec.at, null, 'erro', { error: rec.error, cause: rec.cause }); break;
    case 'prompt':
      ev('user_prompt', 'uuid:' + rec.uuid, rec.at, null, null, { chars: rec.chars });
      if (rec.cwd && !ctx.isSub) S.projectRoot.run(rec.cwd, rec.cwd.split(/[\\/]/).filter(Boolean).pop() || rec.cwd, ctx.project);
      break;
    case 'compaction': ev('compaction', 'uuid:' + rec.uuid, rec.at, null, 'ok', { trigger: rec.trigger, preTokens: rec.preTokens, postTokens: rec.postTokens, durationMs: rec.durationMs }); break;
    case 'turn': ev('turn', 'uuid:' + rec.uuid, rec.durationMs != null ? rec.at - rec.durationMs : rec.at, rec.at, 'ok', { durationMs: rec.durationMs, messages: rec.messages }); break;
    default: break;
  }
}

function ingestFile(db, root, file, versions, S) {
  const st = fs.statSync(file);
  const prev = S.getState.get(file);
  const fd = fs.openSync(file, 'r');
  try {
    const hn = Math.min(4096, st.size), hb = Buffer.alloc(hn);
    if (hn) fs.readSync(fd, hb, 0, hn, 0);
    const head = crypto.createHash('sha1').update(hb).digest('hex');
    let cursor = prev ? prev.cursor : 0;
    const rotated = prev && (st.size < prev.cursor || prev.head_hash !== head);
    if (rotated) cursor = 0;
    if (prev && !rotated && st.size === prev.size && st.mtimeMs === prev.mtime) return { skipped: true };
    const now = Date.now();
    // sessão excluída pelo usuário: avança o cursor sem importar nada
    const rel = path.relative(root, file).split(path.sep);
    const sid = rel.includes('subagents') ? rel[rel.indexOf('subagents') - 1] : path.basename(file, '.jsonl');
    if (S.excluded.get(sid)) { S.setState.run(file, st.size, st.size, st.mtimeMs, head, now, null); return { skipped: true }; }
    let lines = 0;
    const consumed = tx(db, () => {
      const ctx = context(root, file, S, now);
      let pos = cursor, carry = Buffer.alloc(0);
      while (pos < st.size) {
        const len = Math.min(CHUNK, st.size - pos);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, pos);
        pos += len;
        const data = carry.length ? Buffer.concat([carry, buf]) : buf;
        let start = 0, nl;
        while ((nl = data.indexOf(0x0a, start)) !== -1) {
          const line = data.toString('utf8', start, nl).replace(/\r$/, '');
          start = nl + 1;
          if (!line || !worthParsing(line)) continue;
          let o; try { o = JSON.parse(line); } catch { continue; }
          const rec = normalizeLine(o);
          if (rec) { apply(rec, ctx, S, versions, now); lines++; }
        }
        carry = data.subarray(start);
      }
      return st.size - carry.length; // só bytes de linhas completas
    });
    S.setState.run(file, consumed, st.size, st.mtimeMs, head, now, null);
    return { skipped: false, rotated: !!rotated, lines };
  } catch (err) {
    S.setState.run(file, prev ? prev.cursor : 0, prev ? prev.size : null, prev ? prev.mtime : null, prev ? prev.head_hash : null, Date.now(), String(err.message).slice(0, 300));
    return { error: err.message };
  } finally {
    fs.closeSync(fd);
  }
}

function ingestAll(db, root, pricingRows, onProgress) {
  const t0 = Date.now();
  const versions = ensurePricing(db, pricingRows);
  const S = statements(db);
  const files = walk(root);
  const sum = { files: files.length, changed: 0, skipped: 0, rotated: 0, errors: 0, lines: 0 };
  files.forEach((f, i) => {
    const r = ingestFile(db, root, f, versions, S);
    if (r.error) sum.errors++; else if (r.skipped) sum.skipped++; else { sum.changed++; sum.lines += r.lines; if (r.rotated) sum.rotated++; }
    if (onProgress && (i % 3 === 0 || i === files.length - 1)) onProgress(i + 1, files.length);
  });
  sum.ms = Date.now() - t0;
  return sum;
}

module.exports = { ingestAll, ingestFile, ensurePricing, statements, walk };
