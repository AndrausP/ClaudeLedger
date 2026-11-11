'use strict';
// Receptor OTLP/HTTP-JSON embutido (spec 6.1), opt-in, só em 127.0.0.1.
// Formato dos eventos do Claude Code pode variar por versão: parser tolerante, nada de prompt é guardado.
// Requisições OTel vão para otel_requests e servem para preencher reported_cost das requisições do transcrito.
const http = require('http');
const crypto = require('crypto');

const PORT = 4318;
const MAX_BODY = 8 * 1024 * 1024;
const SAFE_ATTRS = /^(event\.name|session\.id|model|cost_usd|duration_ms|input_tokens|output_tokens|cache_read_tokens|cache_creation_tokens|tool_name|success|decision|source|error|status_code|attempt|event\.timestamp|request_id|speed)$/;

function val(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('boolValue' in v) return v.boolValue;
  return null;
}
const attrs = (list) => Object.fromEntries((list || []).map((a) => [a.key, val(a.value)]));
const num = (x) => (x == null || x === '' || isNaN(Number(x)) ? null : Number(x));
const fp = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 24);

// devolve registros normalizados a partir de um payload /v1/logs
function parseLogs(body) {
  const out = [];
  for (const rl of body.resourceLogs || []) {
    const res = attrs(rl.resource && rl.resource.attributes);
    for (const sl of rl.scopeLogs || []) {
      for (const lr of sl.logRecords || []) {
        const a = { ...res, ...attrs(lr.attributes) };
        const name = a['event.name'] || val(lr.body) || '';
        const at = num(lr.timeUnixNano) ? Math.floor(Number(lr.timeUnixNano) / 1e6) : Date.parse(a['event.timestamp']) || Date.now();
        out.push({ name: String(name).replace(/^claude_code\./, ''), at, attrs: a });
      }
    }
  }
  return out;
}

function store(db, records) {
  const insReq = db.prepare(`INSERT OR IGNORE INTO otel_requests(fingerprint, session_id, model, at, tokens_in, tokens_out, cache_read, cache_write, cost_usd, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insEv = db.prepare('INSERT OR IGNORE INTO otel_events(fingerprint, session_id, name, at, attrs_sanitized) VALUES (?,?,?,?,?)');
  let n = 0;
  for (const r of records) {
    const a = r.attrs, sid = a['session.id'] || null;
    if (r.name === 'api_request') {
      const row = [sid, a.model || null, r.at, num(a.input_tokens), num(a.output_tokens), num(a.cache_read_tokens), num(a.cache_creation_tokens), num(a.cost_usd), num(a.duration_ms)];
      insReq.run(fp(row), ...row); n++;
    } else {
      const safe = Object.fromEntries(Object.entries(a).filter(([k]) => SAFE_ATTRS.test(k)));
      insEv.run(fp([sid, r.name, r.at, safe]), sid, r.name, r.at, JSON.stringify(safe)); n++;
    }
  }
  return n;
}

// casa requisições OTel com as do transcrito: mesma sessão + modelo + tokens de saída, horário a até 2 min
function match(db) {
  const pending = db.prepare('SELECT * FROM otel_requests WHERE matched_request_id IS NULL AND session_id IS NOT NULL').all();
  const find = db.prepare(`SELECT id FROM model_requests WHERE session_id = ? AND model = ? AND tokens_out = ? AND ABS(COALESCE(started_at, 0) - ?) <= 120000 AND reported_cost IS NULL ORDER BY ABS(COALESCE(started_at, 0) - ?) LIMIT 1`);
  const setRep = db.prepare('UPDATE model_requests SET reported_cost = ? WHERE id = ?');
  const setMatch = db.prepare('UPDATE otel_requests SET matched_request_id = ? WHERE id = ?');
  const setSession = db.prepare(`UPDATE sessions SET source_completeness = 'parcial' WHERE id = ? AND source_completeness = 'histórico'`);
  let n = 0;
  for (const o of pending) {
    const m = find.get(o.session_id, o.model, o.tokens_out, o.at, o.at);
    if (!m) continue;
    setRep.run(o.cost_usd, m.id); setMatch.run(m.id, o.id); setSession.run(o.session_id); n++;
  }
  return n;
}

function start(getDb, onData) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !/^\/v1\/(logs|metrics|traces)$/.test(req.url)) { res.writeHead(404).end(); return; }
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('json')) { res.writeHead(415, { 'content-type': 'application/json' }).end('{"error":"use OTEL_EXPORTER_OTLP_PROTOCOL=http/json"}'); return; }
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (req.url === '/v1/logs') { const db = getDb(); store(db, parseLogs(body)); match(db); if (onData) onData(); }
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      } catch { res.writeHead(400).end(); }
    });
  });
  return new Promise((resolve) => {
    server.once('error', (err) => resolve({ ok: false, error: err.code === 'EADDRINUSE' ? `porta ${PORT} já em uso` : err.message }));
    server.listen(PORT, '127.0.0.1', () => resolve({ ok: true, server, port: PORT }));
  });
}

// variáveis para o bloco "env" do settings.json do Claude Code
const ENV = {
  CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  OTEL_LOGS_EXPORTER: 'otlp',
  OTEL_METRICS_EXPORTER: 'otlp',
  OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
  OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${PORT}`,
};

module.exports = { start, parseLogs, store, match, ENV, PORT };
