#!/usr/bin/env node
/* Diagnose speculative coverage against a local recorded sequence. No game input. */
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const T = require('../js/engine.js'), S = require('../js/solver.js');
const K = require('../js/solver-cache.js'), F = require('../js/solver-forecast.js');
const record = process.argv[2];
const optimized = process.argv.includes('--optimized');
if (!record) throw new Error('Usage: node tools/forecast-replay.js path/to/record.jsonl');
const window = { Tartarus: T, TartarusSolver: S, TartarusSolverCache: K };
let source = fs.readFileSync(path.resolve(__dirname, '../js/analyze.js'), 'utf8').replace(/\r\n/g, '\n');
const init = '  buildBoard();\n  bind();\n  render();';
if (!source.includes(init)) throw new Error('Analyzer initialization changed');
source = source.replace(init, '  window.replay = { normalize, buildState, forecastModels, rolloutTarget, resultKey };');
vm.runInNewContext(source, { window, document: { currentScript: null }, navigator: { hardwareConcurrency: 12 }, localStorage: { getItem: () => null } });
const A = window.replay;
function differences(a, b, prefix = '') {
  const out = [];
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[key], y = b?.[key];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object') out.push(...differences(x, y, prefix + key + '.'));
    else out.push({ field: prefix + key, predicted: x, observed: y });
  }
  return out;
}
const rows = fs.readFileSync(record, 'utf8').trim().split(/\r?\n/).map((s) => JSON.parse(s));
const boards = rows.filter((r) => r.type === 'advice' && r.board && r.advice?.move);
const unique = [];
for (const row of boards) if (!unique.length || K.key(row.board, 1) !== K.key(unique.at(-1).board, 1)) unique.push(row);
const results = [];
for (let i = 0; i + 1 < unique.length; i++) {
  const before = A.normalize(unique[i].board), after = A.normalize(unique[i + 1].board);
  const { st, problems } = A.buildState(before);
  if (problems.length) continue;
  const option = S.candidates(st).find((o) => o.label === unique[i].advice.move);
  if (!option) continue;
  const target = A.rolloutTarget(A.buildState(after).st), key = A.resultKey(after, target);
  let nearest = null, exact = false, covered = 0;
  for (const prediction of F.predict(st, option.action, { samples: 48, limit: 4, seed: 7919 * (i + 1), autoDay: optimized, patrolFamilies: optimized })) {
    for (const model of A.forecastModels(prediction.state, before)) {
      const next = A.normalize(model);
      if (prediction.patrolFamily && after.step === 'patrol' && after.dest.every((n) => next.dest.includes(n))) next.dest = after.dest.slice();
      const diffs = differences(next, after);
      covered++;
      if (A.resultKey(next, A.rolloutTarget(A.buildState(next).st)) === key) exact = true;
      if (!nearest || diffs.length < nearest.length) nearest = diffs;
    }
  }
  results.push({ i, from: before.step, to: after.step, day: before.day, action: option.action,
    covered, exact, differences: nearest });
}
const fields = {};
for (const r of results) for (const d of r.differences || []) fields[d.field] = (fields[d.field] || 0) + 1;
console.log(JSON.stringify({ optimized, positions: unique.length, transitions: results.length, exact: results.filter((r) => r.exact).length,
  fields: Object.entries(fields).sort((a, b) => b[1] - a[1]), results }, null, 2));
