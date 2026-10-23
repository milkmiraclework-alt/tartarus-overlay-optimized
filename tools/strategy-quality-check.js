#!/usr/bin/env node
/* Paired held-out whole games. Never captures or controls a real game. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const T = require('../js/engine.js'), S = require('../js/solver.js'), R = require('../js/rust-solver.js');
const args = process.argv.slice(2), arg = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const games = Number(arg('--games', 256)), mcGames = Number(arg('--mc-games', 8)), rollouts = Number(arg('--rollouts', 64));
assert.ok([games, mcGames, rollouts].every(x => Number.isInteger(x) && x > 0));
const prefix = arg('--prefix', 'STRATEGY28-HOLDOUT-A');
const window = { Tartarus: T, TartarusSolver: S };
const source = fs.readFileSync(require.resolve('../js/analyze.js'), 'utf8').replace(/\r\n/g, '\n');
const init = '  buildBoard();\n  bind();\n  render();'; assert.ok(source.includes(init));
vm.runInNewContext(source.replace(init, '  window.qualityRank = rankRecommendation;'), {
  window, document: { currentScript: null }, navigator: { hardwareConcurrency: 4 }, localStorage: { getItem: () => null },
});
const sets = [[], ['trap'], ['trap', 'crown', 'muzzle'], ['trap', 'saw', 'whip'], ['maiden', 'rope'], ['guillotine', 'crown', 'skewer']];
const selectedSets = String(arg('--sets', sets.map((_, i) => i).join(','))).split(',').map(Number);
assert.ok(selectedSets.length && selectedSets.every(i => Number.isInteger(i) && i >= 0 && i < sets.length));
const stats = xs => {
  const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
  return { n, mean, ci95: 1.96 * Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1) / n), capped: xs.filter(x => x >= 10).length };
};
const compare = (a, b) => ({ old: stats(a), next: stats(b), pairedDifference: stats(b.map((v, i) => v - a[i])) });
function fixture(set, i, family) {
  const state = T.newGame({ seed: `${prefix}-${family}-${set}-${i}`, startEvent: set === 2 ? 'cagefight' : set === 4 ? 'opulence' : null });
  if (family !== 'mc' || set) state.pending = [];
  for (const tool of sets[set]) assert.ok(T.addTool(state, tool).ok, 'Invalid fixture tool ' + tool);
  return state;
}
function observed(st) {
  const out = S.clone(st);
  if (out.pending[0]?.start && out.day === 1 && !out.tools.length) {
    for (const c of out.cells) if (c.n) Object.assign(c, { sealed: true, inmate: null, hidden: null, known: 0, atLeast: 0, scratch: false, nest: null, event: null, ivory: false, seen: false, eventKnown: true });
    out.phase = 'manage'; out.destinations = []; out.nextId = 1; out.stats.best = 0;
    for (const p of out.pending) delete p.start;
    out.initialInmatesPending = true;
  }
  return out;
}
(async () => {
  const core = await R.fromBytes(fs.readFileSync('js/solver-core.wasm'));
  const reference = arg('--reference', 'sandbox/tartarus-before-28/js/solver-core.wasm');
  const previousBytes = fs.existsSync(reference) ? fs.readFileSync(reference)
    : !args.includes('--reference') ? require('node:child_process').execFileSync('git', ['show', '1440e612666397a03d2759af2f8f22259fafe16d:js/solver-core.wasm'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    : fs.readFileSync(reference);
  const previous = await R.fromBytes(previousBytes);
  const variants = [
    { name: 'local27', core: previous },
    { name: 'preySurvival', core, overrides: { preySurvival: true, giftAdaptive: false } },
    { name: 'adaptiveGifts', core, overrides: { preySurvival: true, giftAdaptive: true } },
  ];
  const begin = performance.now(), policy = [], adviser = []; let equivalence = 0, decisions = 0;
  for (const set of selectedSets) {
    const values = variants.map(() => []), times = variants.map(() => 0);
    for (let i = 0; i < games; i++) {
      const state = fixture(set, i, 'policy'), seed = 0x28ab0000 + i;
      const old = previous.request({ op: 'playout', state, seed }); assert.equal(old.ok, true);
      if (i < 16) {
        const legacy = core.request({ op: 'playout', state, seed, params: { ...S.paramsFor(state), preySurvival: false, giftAdaptive: false } });
        assert.deepEqual(legacy, old, 'Disabled corrections must reproduce the frozen .27 core'); equivalence++;
      }
      values[0].push(old.state.vault.length);
      for (let v = 1; v < variants.length; v++) {
        const start = performance.now(), next = core.request({ op: 'playout', state, seed, params: { ...S.paramsFor(state), ...variants[v].overrides } });
        times[v] += performance.now() - start; assert.equal(next.ok, true); values[v].push(next.state.vault.length);
      }
    }
    const result = { tools: sets[set], startEvent: set === 2 ? 'cagefight' : set === 4 ? 'opulence' : null,
      prey: compare(values[0], values[1]), adaptiveOverPrey: compare(values[1], values[2]), elapsedMs: times };
    policy.push(result); console.log('POLICY', JSON.stringify(result));
  }
  // Full MC at every decision, with the production paired-SE/0.05 switch rule.
  // The budget is explicit: smaller than production unless --rollouts >= 400.
  for (const set of selectedSets) {
    const values = [[], []], times = [0, 0], moves = [0, 0];
    for (let i = 0; i < mcGames; i++) for (let v = 0; v < 2; v++) {
      const st = fixture(set, i, 'mc'), selected = variants[v], started = performance.now();
      for (let step = 0; st.phase !== 'ended' && st.vault.length < 10; step++) {
        assert.ok(step < 2000, 'Incomplete adviser game');
        const state = observed(st), params = selected.overrides ? { ...S.paramsFor(state), ...selected.overrides } : undefined;
        const raw = selected.core.request({ op: 'solve', state, rollouts, seed: (0x1234abcd ^ Math.imul(step + 1, 7919) ^ i) >>> 0, params });
        const rows = raw.rows.map(r => ({ ...r, label: JSON.stringify(r.action), vals: r.vals.map(x => x === null ? NaN : x) }));
        const pick = rows.find(r => r.policy), summary = S.summarize(rows, raw.rounds, rollouts, raw.goal);
        const ranked = window.qualityRank(state, pick ? { action: pick.action, label: pick.label, why: '' } : null, summary);
        assert.ok(ranked, 'No adviser recommendation');
        const result = S.apply(st, ranked.action); assert.ok(result.ok, JSON.stringify({ action: ranked.action, result }));
        st.log = []; moves[v]++; decisions++;
      }
      times[v] += performance.now() - started; values[v].push(st.vault.length);
    }
    const result = { tools: sets[set], ...compare(values[0], values[1]), moves, elapsedMs: times };
    adviser.push(result); console.log('ADVISER', JSON.stringify(result));
  }
  const report = { checkedAt: new Date().toISOString(), version: require('../desktop/package.json').version, prefix,
    baseline: 'local.27 frozen WASM', variants: variants.map(v => ({ name: v.name, overrides: v.overrides })),
    selectedSets, productionGiftAdaptive: S.DEFAULTS.giftAdaptive, equivalenceGames: equivalence, policyGamesPerVariant: games * selectedSets.length,
    adviserGamesPerVariant: mcGames * selectedSets.length, adviserRolloutsPerAction: rollouts, adviserDecisions: decisions,
    elapsedMs: Math.round(performance.now() - begin), policy, adviser,
    limitations: 'Synthetic seeded games, expected capped Rainbow objective, no prices or wall-clock game actions. Paired descriptive confidence intervals across several tool sets, not evidence of real profit/hour. Adviser budget is recorded and may be below production (400–1600). Starting offers hide the unobserved board from both advisers. Adaptive gifts are experimental and not used by full-MC comparisons.', gameInput: false };
  fs.writeFileSync(arg('--report', 'tools/results/tartarus-strategy-28-20261023-quality.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: frozen-core equivalence and independent complete policy/adviser games.', { decisions, elapsedMs: report.elapsedMs });
})().catch(error => { console.error(error); process.exitCode = 1; });
