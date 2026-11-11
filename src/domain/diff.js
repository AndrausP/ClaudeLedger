'use strict';
// Diff de linhas (Myers, O((N+M)·D)) → hunks unificados com contexto. Sem dependências.
const MAX_LINES = 20000;
const MAX_D = 4000;

function myers(a, b) {
  const N = a.length, M = b.length, max = N + M, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= Math.min(max, MAX_D); d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) return backtrack(trace, a, b, off, d);
    }
  }
  return null; // diferença grande demais
}

function backtrack(trace, a, b, off, dEnd) {
  const ops = [];
  let x = a.length, y = b.length;
  for (let d = dEnd; d > 0; d--) {
    const v = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
    const px = v[off + prevK], py = px - prevK;
    while (x > px && y > py) { ops.push({ t: ' ', a: x - 1, b: y - 1 }); x--; y--; }
    if (x === px) ops.push({ t: '+', b: y - 1 }); else ops.push({ t: '-', a: x - 1 });
    x = px; y = py;
  }
  while (x > 0 && y > 0) { ops.push({ t: ' ', a: x - 1, b: y - 1 }); x--; y--; }
  return ops.reverse();
}

const splitLines = (s) => (s === '' ? [] : String(s).replace(/\r\n/g, '\n').split('\n'));

// → { added, removed, hunks: [{ header, lines: [{t, text, na, nb}] }], tooLarge }
function unified(before, after, context = 3) {
  const a = splitLines(before), b = splitLines(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES) return { tooLarge: true, added: null, removed: null, hunks: [] };
  const ops = myers(a, b);
  if (!ops) return { tooLarge: true, added: null, removed: null, hunks: [] };
  const added = ops.filter((o) => o.t === '+').length, removed = ops.filter((o) => o.t === '-').length;
  const hunks = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].t === ' ') { i++; continue; }
    let s = Math.max(0, i - context), e = i;
    // estende enquanto houver mudança a menos de 2*context linhas
    while (e < ops.length) {
      let j = e; while (j < ops.length && ops[j].t !== ' ') j++;
      let k = j; while (k < ops.length && ops[k].t === ' ' && k - j < context * 2) k++;
      if (k < ops.length && ops[k].t !== ' ') { e = k; continue; }
      e = Math.min(ops.length, j + context); break;
    }
    const slice = ops.slice(s, e);
    const first = slice[0];
    const na0 = first.a != null ? first.a + 1 : (slice.find((o) => o.a != null) || { a: a.length }).a + 1;
    const nb0 = first.b != null ? first.b + 1 : (slice.find((o) => o.b != null) || { b: b.length }).b + 1;
    const la = slice.filter((o) => o.t !== '+').length, lb = slice.filter((o) => o.t !== '-').length;
    hunks.push({
      header: `@@ -${na0},${la} +${nb0},${lb} @@`,
      lines: slice.map((o) => ({ t: o.t, text: o.t === '+' ? b[o.b] : a[o.a], na: o.a != null ? o.a + 1 : null, nb: o.b != null ? o.b + 1 : null })),
    });
    i = e;
  }
  return { added, removed, hunks, tooLarge: false };
}

// parse de saída "git show --patch" em arquivos + hunks (para o mesmo visualizador)
function parseGitPatch(text) {
  const files = [];
  let cur = null, hunk = null, na = 0, nb = 0;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) { cur = { path: line.replace(/^diff --git a\/(.*) b\/.*$/, '$1'), hunks: [], added: 0, removed: 0, binary: false }; files.push(cur); hunk = null; continue; }
    if (!cur) continue;
    if (line.startsWith('Binary files')) { cur.binary = true; continue; }
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (m) { na = +m[1]; nb = +m[2]; hunk = { header: line, lines: [] }; cur.hunks.push(hunk); continue; }
    if (!hunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) { hunk.lines.push({ t: '+', text: line.slice(1), na: null, nb: nb++ }); cur.added++; }
    else if (line.startsWith('-') && !line.startsWith('---')) { hunk.lines.push({ t: '-', text: line.slice(1), na: na++, nb: null }); cur.removed++; }
    else if (line.startsWith(' ')) hunk.lines.push({ t: ' ', text: line.slice(1), na: na++, nb: nb++ });
  }
  return files;
}

module.exports = { unified, parseGitPatch, myers, splitLines };
