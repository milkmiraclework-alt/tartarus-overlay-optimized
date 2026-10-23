#!/usr/bin/env node
/* Explicit rule-math regression and paired complete-run policy audit. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const T = require('../js/engine.js'), S = require('../js/solver.js'), R = require('../js/rust-solver.js');
const args = process.argv.slice(2), at = args.indexOf('--reference');
const base = path.resolve(at >= 0 ? args[at + 1] : 'sandbox/tartarus-before-rust');
if (!fs.existsSync(path.join(base, 'solver.js')) && at < 0) {
  fs.mkdirSync(base, { recursive: true });
  for (const name of ['engine', 'solver', 'tool-combos']) fs.writeFileSync(path.join(base, name + '.js'),
    require('node:child_process').execFileSync('git', ['show', '72d284dd7e56a28f505903b68e3abc82f5427dd2:js/' + name + '.js']));
}
const previousT = require(path.join(base, 'engine.js'));
const previous = require(path.join(base, 'solver.js'));
const board = T.newGame({ seed: 'GUILLOTINE-MATH', params: { rewards: false, eventStartChance: 0 } });
board.pending = []; board.phase = 'manage'; board.position = 1;
T.editCell(board, 1, { kind: 'open', beast: 'mammoth', tier: 1 });
T.editCell(board, 2, { kind: 'open', beast: 'lion', tier: 1 });
T.editCell(board, 3, { kind: 'open', beast: 'rat', tier: 1 });
T.addTool(board, 'guillotine');
const weights = { tierBase: 3, rainbowMult: 1, wStair: 0 };
assert.equal(S.devourScores(board, S.context(board, weights)).find((o) => o.cell === 2).score, 6.75);
assert.equal(previous.devourScores(board, previous.context(board, weights)).find((o) => o.cell === 2).score, 3);
assert.equal(S.chainOdds(board, 1, 2).bites, 1.25);
console.log('PASS: exact chain value 6.75 instead of 3; expected bites 1.25 includes the Wolf lower-tier meal.');
const stats = (xs) => {
  const n = xs.length, mean = xs.reduce((a, x) => a + x, 0) / n;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, n - 1);
  return { n, mean, ci95: 1.96 * Math.sqrt(variance / n) };
};
(async () => {
  const core = await R.fromBytes(fs.readFileSync('js/solver-core.wasm'));
  const score = core.request({ op: 'scores', state: board, params: weights }).devour.find((row) => row[0] === 2)[1];
  assert.equal(score, 6.75, 'Rust and JS corrected chain math differ');
  const results = [], countAt = args.indexOf('--games-per-set');
  const count = countAt >= 0 ? Number(args[countAt + 1]) : args.includes('--quick') ? 32 : 4096;
  assert.ok(Number.isInteger(count) && count > 0);
  for (const tools of [[], ['guillotine'], ['guillotine', 'saw', 'whip'], ['guillotine', 'crown', 'skewer']]) {
    const oldValues = [], newValues = [], deltas = [];
    for (let i = 0; i < count; i++) {
      const state = T.newGame({ seed: 'QUALITY-GUILLOTINE-' + i });
      state.pending = []; // held-from-day-1 comparison, without a pending starting offer
      for (const tool of tools) assert.ok(T.addTool(state, tool).ok, 'Quality fixture failed to add ' + tool);
      const seed = 271828 + i;
      const old = core.request({ op: 'playout', state, seed, params: { ...S.paramsFor(state), legacyWolfChains: true } });
      assert.equal(old.ok, true);
      if (i < 64) {
        const reference = previous.clone(state); previous.playout(reference, null, previous.rng32(seed));
        assert.equal(old.state.vault.length, reference.vault.length, 'Native legacy policy does not match the frozen JavaScript');
        assert.equal(old.state.rng, reference.rng, 'Native legacy engine RNG diverged from frozen JavaScript');
      }
      const next = core.request({ op: 'playout', state, seed }); assert.equal(next.ok, true);
      oldValues.push(old.state.vault.length); newValues.push(next.state.vault.length); deltas.push(next.state.vault.length - old.state.vault.length);
    }
    results.push({ tools, old: stats(oldValues), corrected: stats(newValues), pairedDifference: stats(deltas),
      oldCapped: oldValues.filter((x) => x >= 10).length, correctedCapped: newValues.filter((x) => x >= 10).length });
  }
  const report = { checkedAt: new Date().toISOString(), referenceCommit: '72d284dd7e56a28f505903b68e3abc82f5427dd2',
    games: results.length * count, legacyJavaScriptEquivalenceGames: Math.min(64, count) * results.length,
    changedPolicy: 'Fanged Guillotine lower-tier Wolf meals included in exact chain evaluation',
    exactRegression: { previousValue: 3, correctedValue: 6.75, expectedBites: 1.25, nativeMatches: true }, results,
    limitations: 'Paired seeded synthetic complete runs of the continuation policy, not full Monte Carlo decisions at every turn. Confidence intervals use paired differences and are descriptive across several tool sets. This fixes rule-model consistency; real-game profit/hour is not measured.', gameInput: false };
  fs.writeFileSync('tools/results/tartarus-rust-quality-20261023.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
