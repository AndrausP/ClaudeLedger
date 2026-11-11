'use strict';
// Regras determinísticas e versionadas de diagnóstico (spec 3). Puras: dados → achados.
// Toda regra explica o que observou, por que importa e quais eventos são a evidência.
const crypto = require('crypto');
const { WRITE_TOOLS } = require('./normalize');

const DEFAULT_PARAMS = {
  repeated_read: { min: 3 },
  repeated_error: { min: 3 },
  high_compaction: { min: 3, minSample: 10 },
  latency_outlier: { factor: 3, minMs: 60000, minSample: 20, maxEvidence: 5 },
  permission_denials: { min: 3 },
};

const fingerprint = (ruleId, ids) => crypto.createHash('sha1').update(ruleId + ':' + [...ids].sort((a, b) => a - b).join(',')).digest('hex').slice(0, 20);
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const fmtMs = (ms) => (ms >= 60000 ? (ms / 60000).toFixed(1).replace('.', ',') + ' min' : Math.round(ms / 1000) + ' s');

// tools: [{ id, event_id, agent_id, tool_name, target_hash, target_label, input_hash, started_at, ended_at, status, error_signature }]
const RULES = {
  repeated_read: {
    version: 1,
    run({ tools }, p) {
      const out = [];
      const byAgent = new Map();
      for (const t of tools) { if (!byAgent.has(t.agent_id)) byAgent.set(t.agent_id, []); byAgent.get(t.agent_id).push(t); }
      for (const list of byAgent.values()) {
        const open = new Map(); // chave: arquivo + mesmos parâmetros (trechos diferentes do mesmo arquivo não contam)
        const flush = (k) => { const g = open.get(k); if (g && g.length >= p.min) out.push(g); open.delete(k); };
        for (const t of list) {
          if (!t.target_hash) continue;
          if (WRITE_TOOLS.has(t.tool_name)) { for (const k of [...open.keys()]) if (k.startsWith(t.target_hash + '|')) flush(k); continue; }
          if (t.tool_name !== 'Read' || t.status === 'erro') continue;
          const k = t.target_hash + '|' + t.input_hash;
          if (!open.has(k)) open.set(k, []);
          open.get(k).push(t);
        }
        for (const k of [...open.keys()]) flush(k);
      }
      return out.map((g) => ({
        severity: g.length >= p.min * 2 ? 'atenção' : 'info',
        title: `“${g[0].target_label}” lido ${g.length}× sem alteração`,
        explanation: `O mesmo arquivo foi lido ${g.length} vezes com os mesmos parâmetros, sem nenhuma edição pelo agente entre as leituras. Cada leitura recoloca o conteúdo no contexto e consome tokens de entrada.`,
        recommendation: 'Hipótese: o conteúdo já estava no contexto. Se o arquivo não mudou por fora, uma leitura bastaria. Verifique se a releitura foi causada por compactação ou troca de subagente.',
        confidence: 'média — mudanças feitas fora do Claude Code não são visíveis no transcrito',
        evidence: g.map((t) => t.event_id),
      }));
    },
  },

  repeated_error: {
    version: 1,
    run({ tools }, p) {
      const out = [];
      const runs = new Map(); // agente|ferramenta → sequência de falhas equivalentes
      const close = (k) => { const g = runs.get(k); if (g && g.length >= p.min) out.push(g); runs.delete(k); };
      for (const t of tools) {
        const k = t.agent_id + '|' + t.tool_name;
        if (t.status === 'ok') { close(k); continue; }
        if (t.status !== 'erro' || !t.error_signature) continue;
        const g = runs.get(k);
        if (g && g[0].error_signature !== t.error_signature) close(k);
        if (!runs.has(k)) runs.set(k, []);
        runs.get(k).push(t);
      }
      for (const k of [...runs.keys()]) close(k);
      return out.map((g) => {
        const same = g.every((t) => t.input_hash === g[0].input_hash);
        return {
          severity: same ? 'crítico' : 'atenção',
          title: `${g[0].tool_name} falhou ${g.length}× com o mesmo erro`,
          explanation: `${g.length} falhas seguidas de ${g[0].tool_name} com a mesma assinatura de erro (“${g[0].error_signature}”), sem nenhum sucesso entre elas. ${same ? 'Os parâmetros foram idênticos em todas as tentativas.' : 'Os parâmetros mudaram entre as tentativas.'}`,
          recommendation: same ? 'Repetir a mesma chamada não muda o resultado. Hipótese: faltou ler a mensagem de erro e mudar a abordagem.' : 'As tentativas variaram, mas o erro foi o mesmo. Hipótese: a causa está fora dos parâmetros (ambiente, dependência, permissão).',
          confidence: 'alta — sequência e assinatura vêm direto dos resultados das ferramentas',
          evidence: g.map((t) => t.event_id),
        };
      });
    },
  },

  high_compaction: {
    version: 1,
    run({ compactions, baseline }, p) {
      if (compactions.length < p.min) return [];
      const ref = baseline.compactionP90;
      if (baseline.sessions < p.minSample || ref == null || compactions.length <= ref) return [];
      return [{
        severity: 'atenção',
        title: `${compactions.length} compactações nesta sessão`,
        explanation: `O contexto foi compactado ${compactions.length} vezes. Nas suas sessões, o P90 é ${ref} (amostra de ${baseline.sessions} sessões). Cada compactação resume o histórico e pode descartar detalhes que depois são buscados de novo.`,
        recommendation: 'Hipótese: a tarefa era grande para uma única sessão. Dividir em sessões menores ou delegar partes a subagentes pode reduzir compactações.',
        confidence: `média — comparação com o seu histórico, não com tarefas equivalentes`,
        evidence: compactions.map((c) => c.event_id),
      }];
    },
  },

  latency_outlier: {
    version: 1,
    run({ tools, baseline }, p) {
      const slow = [];
      for (const t of tools) {
        if (t.started_at == null || t.ended_at == null) continue;
        const b = baseline.toolLatency[t.tool_name];
        if (!b || b.n < p.minSample) continue;
        const d = t.ended_at - t.started_at;
        if (d >= p.minMs && d >= b.p90 * p.factor) slow.push({ t, d, b });
      }
      if (!slow.length) return [];
      slow.sort((x, y) => y.d - x.d);
      const top = slow.slice(0, p.maxEvidence);
      return [{
        severity: 'info',
        title: `${slow.length} chamada(s) de ferramenta muito acima do normal`,
        explanation: top.map(({ t, d, b }) => `${t.tool_name}: ${fmtMs(d)} (P50 ${fmtMs(b.p50)}, P90 ${fmtMs(b.p90)}, n=${b.n})`).join(' · '),
        recommendation: 'Hipótese: comando longo (build, instalação, rede) ou espera por aprovação. Verifique se a espera era necessária.',
        confidence: 'baixa — duração medida pelos horários de gravação do transcrito (inclui tempo de aprovação)',
        evidence: top.map(({ t }) => t.event_id),
      }];
    },
  },

  permission_denials: {
    version: 1,
    run({ tools }, p) {
      const denied = tools.filter((t) => t.status === 'negado');
      if (denied.length < p.min) return [];
      const by = {};
      for (const t of denied) by[t.tool_name] = (by[t.tool_name] || 0) + 1;
      return [{
        severity: 'info',
        title: `${denied.length} operações negadas`,
        explanation: `Operações recusadas por você ou por regra de permissão: ${Object.entries(by).map(([k, v]) => `${k} ×${v}`).join(', ')}.`,
        recommendation: 'Pode ser bloqueio de segurança intencional — isso não é defeito. Se as negações foram sempre do mesmo tipo, uma regra de permissão explícita evita idas e vindas.',
        confidence: 'alta para a contagem; a intenção não é inferida',
        evidence: denied.map((t) => t.event_id),
      }];
    },
  },
};

function runRules(data, params = {}) {
  const findings = [];
  for (const [id, rule] of Object.entries(RULES)) {
    const p = { ...DEFAULT_PARAMS[id], ...(params[id] || {}) };
    for (const f of rule.run(data, p)) {
      const ev = f.evidence.filter((x) => x != null);
      findings.push({ ...f, evidence: ev, rule_id: id, rule_version: rule.version, fingerprint: fingerprint(id, ev) });
    }
  }
  return findings;
}

// baseline global: P50/P90 de duração por ferramenta e P90 de compactações por sessão
function buildBaseline(toolDurations, compactionCounts) {
  const toolLatency = {};
  for (const [name, ds] of Object.entries(toolDurations)) toolLatency[name] = { n: ds.length, p50: pct(ds, 50), p90: pct(ds, 90) };
  return { toolLatency, compactionP90: pct(compactionCounts, 90), sessions: compactionCounts.length };
}

module.exports = { RULES, DEFAULT_PARAMS, runRules, buildBaseline, pct, fingerprint };
