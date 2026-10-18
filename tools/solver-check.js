#!/usr/bin/env node
/* Deterministic solver regression checks and repeatable timing.
 * node tools/solver-check.js [--baseline path/to/previous/solver.js] [--bench]
 * The baseline must resolve engine.js and tool-combos.js beside itself.
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Worker } = require('node:worker_threads');
const T = require('../js/engine.js');
const S = require('../js/solver.js');
const args = process.argv.slice(2);
const baselineAt = args.indexOf('--baseline');
// Local stream compatibility retains two unused zero counters after upstream
// removed contracts. Compare every actual sample/value/ranking unchanged.
const json = (value) => JSON.stringify(value, (key, value) => (key === 'pass' || key === 'points') && value === 0 ? undefined : value);
let before = null;
let beforeEngine = null;
if (baselineAt >= 0) {
  const baselineFile = path.resolve(args[baselineAt + 1]);
  const savedEngine = globalThis.Tartarus;
  const savedSolver = globalThis.TartarusSolver;
  try {
    beforeEngine = require(path.join(path.dirname(baselineFile), 'engine.js'));
    // The browser-compatible solver prefers the global engine. Point the
    // baseline at its own engine for a complete, fair before/after check.
    globalThis.Tartarus = beforeEngine;
    before = require(baselineFile);
  } finally {
    globalThis.Tartarus = savedEngine;
    globalThis.TartarusSolver = savedSolver;
  }
}

// Exercise the allocation-free legality predicate independently of solver
// choices, including every tool combination relevant to its rules.
let legalPairs = 0;
for (const fight of [false, true]) for (const doubleEatTier of [0, 1, 2, 3, 4, 5]) {
  const st = T.newGame({ seed: 'LEGALITY', startEvent: fight ? 'cagefight' : null, params: { doubleEatTier } });
  for (let mask = 0; mask < 16; mask++) {
    st.tools = ['skewer', 'crown', 'maul', 'guillotine'].filter((_, bit) => mask & (1 << bit));
    for (const eaterBeast of T.BEASTS) for (const mealBeast of T.BEASTS) {
      for (let eaterTier = 0; eaterTier <= T.RAINBOW; eaterTier++) for (let mealTier = 0; mealTier <= T.RAINBOW; mealTier++) {
        const eater = { id: 1, beast: eaterBeast, tier: eaterTier };
        const meal = { id: 2, beast: mealBeast, tier: mealTier };
        const counters = T.eatsOf(st, eater.beast, eater.tier).includes(meal.beast) || (eater.beast === 'rat' && meal.beast === 'rat' && st.tools.includes('skewer'));
        const expected = eater.tier >= T.RAINBOW ? false : eater.tier === meal.tier
          ? counters || (eater.beast === 'lion' && st.tools.includes('crown'))
          : (meal.tier < eater.tier && counters && fight) ||
            (meal.tier > eater.tier && counters && eater.beast === 'mammoth' && st.tools.includes('maul')) ||
            (eater.tier > meal.tier && eater.beast === 'wolf' && st.tools.includes('guillotine') && T.eatsOf(st, 'wolf').includes(meal.beast));
        assert.equal(T.canEat(st, eater, meal), expected, 'legality differs from the complete food chain');
        if (beforeEngine) assert.equal(T.canEat(st, eater, meal), beforeEngine.canEat(st, eater, meal), 'legality changed from baseline engine');
        assert.equal(T.canEat(st, eater, { ...meal, id: eater.id }), false, 'an inmate can eat itself');
        legalPairs++;
      }
    }
    assert.equal(T.canEat(st, null, null), false);
  }
}
console.log(`PASS: ${legalPairs} eater/meal pairs, tier thresholds, Cage Fight and tool combinations.`);

const fixtures = [
  ...Object.keys(T.SCENARIOS).map((scenario) => ({ scenario })),
  { params: { rewards: false } },
  ...Object.keys(T.START_EVENTS).map((startEvent) => ({ startEvent })),
  ...Object.keys(T.LOADOUTS || {}).map((loadout) => ({ mode: 'challenge', loadout })),
  ...T.TOOL_IDS.map((tool) => ({ tool })),
  { tools: ['saw', 'whip', 'collar', 'revenge'] },
  { tools: ['maul', 'crown', 'skewer'], startEvent: 'cagefight' },
];

function makeState(fixture, seed) {
  const st = T.newGame({ ...fixture, seed: `PERF-${seed}` });
  for (const tool of fixture.tools || (fixture.tool ? [fixture.tool] : [])) T.addTool(st, tool);
  freeze(st.params);
  if (st.challenge) freeze(st.challenge.contracts);
  return st;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

function assertIndependent(a, b) {
  if (!a || typeof a !== 'object') return;
  assert.notStrictEqual(a, b, 'clone shares a mutable object');
  for (const key of Object.keys(a)) if (key !== 'log') assertIndependent(a[key], b[key]);
}

const snapshots = [];

// Cached diets must still follow tool changes, rarity thresholds and Cage
// Fight. Strategy overrides stay per-context and can change between calls.
for (const tools of [[], ['skewer'], ['crown'], ['skewer', 'crown']]) {
  for (const fight of [false, true]) {
    for (let doubleEatTier = 0; doubleEatTier <= T.RAINBOW; doubleEatTier++) {
      const st = makeState({ tools, startEvent: fight ? 'cagefight' : null, params: { doubleEatTier } }, 0);
      const weights = { tierBase: 2.6, wStair: 0.23 };
      const ctx = S.context(st, weights);
      const table = (context) => Array.from({ length: T.RAINBOW }, (_, t) => [context.eatsAt(t), context.countersAt(t)]);
      if (before) assert.equal(json(table(ctx)), json(table(before.context(st, weights))), 'cached diet changed');
      assert.ok(Object.isFrozen(ctx.eatsAt(0)), 'a caller can change the shared diet');
      ctx.P.wOpen = -99;
      assert.notEqual(S.context(st, weights).P.wOpen, -99, 'contexts share strategy overrides');
      weights.tierBase = 3.1;
      assert.equal(S.context(st, weights).P.tierBase, 3.1, 'strategy override became stale');
    }
  }
}
console.log('PASS: diet variants, changing thresholds, Cage Fight and isolated strategy overrides.');

let moves = 0;
for (const [i, fixture] of fixtures.entries()) {
  for (let seed = 0; seed < 6; seed++) {
    const st = makeState(fixture, seed);
    const random = S.rng32(seed + 1);
    const referenceRandom = S.rng32(seed + 1);
    let guard = 0;
    while (st.phase !== 'ended') {
      assert.ok(guard++ < 2000, `run did not end: fixture ${i}, seed ${seed}`);
      const saved = json(st);
      for (const cell of st.cells) assert.equal(T.hasDevourOption(st, cell.n), T.devourOptions(st, cell.n).length > 0, 'meal existence differs from the complete legal move list');
      const copy = S.clone(st);
      assert.equal(json(st), saved, 'cloning changes the source');
      assert.equal(json(copy), json({ ...st, log: [] }));
      assertIndependent(st, copy);
      const action = S.decide(st, null, random);
      assert.equal(json(st), saved, 'deciding changes the source state');
      if (before) assert.equal(json(action), json(before.decide(st, null, referenceRandom)), `decision changed: fixture ${i}, seed ${seed}, day ${st.day}, ${st.phase}`);
      if (seed === 0 && snapshots.length < (i + 1) * 3 && !st.pending.length) snapshots.push(copy);
      assert.ok(action, 'no decision before the end');
      const referenceState = beforeEngine && JSON.parse(json(st));
      assert.ok(S.apply(st, action).ok, `illegal move: ${json(action)}`);
      if (beforeEngine) {
        // Apply through the separately loaded solver so all of the baseline
        // engine's side effects, random draws and log entries are compared.
        assert.ok(before.apply(referenceState, action).ok, 'baseline engine rejected the move');
        assert.equal(json(st), json(referenceState), 'engine state, random draws or log entries changed');
      }
      moves++;
    }
  }
}
console.log(`PASS: ${fixtures.length * 6} seeded runs, ${moves} decisions; clones are isolated${before ? '; all decisions match baseline' : ''}.`);

function finish(solver, st, stream = 0, progressOnly = false) {
  const job = solver.solve(st, { rollouts: 24, seed: 7919, stream });
  let result;
  do { result = job.step(8, progressOnly); } while (!result.done);
  return { result: solver.summarize(job.rows, result.rounds, 24, result.goal), rows: job.rows };
}

for (const st of snapshots.filter((_, i) => i % 9 === 0)) {
  for (const stream of [0, 1]) {
    const saved = json(st);
    const actual = finish(S, st, stream);
    assert.equal(json(st), saved, 'solve changes the source');
    assert.deepEqual(actual, finish(S, st, stream, true), 'progress-only steps change results');
    if (before) assert.equal(json(actual), json(finish(before, st, stream)), 'Monte Carlo samples or ranking changed');
  }
}
console.log('PASS: deterministic Monte Carlo samples, rankings, worker streams and progress-only stepping.');

// Stop at exact round boundaries, independent of either implementation's
// speed, and change strategy weights between slices of an existing job.
function stepRounds(job, rounds) {
  const savedNow = Date.now;
  let calls = 0;
  try {
    Date.now = () => calls++ <= rounds ? 0 : 2;
    const result = job.step(1, true);
    return { done: result.done, rounds: result.rounds, goal: result.goal };
  } finally { Date.now = savedNow; }
}
if (before) {
  const state = T.newGame({ seed: 'POLICY-SLICES', params: { rewards: false } });
  state.maxDays = 3;
  const params = { tierBase: 2.6, wNow: 0.5 };
  const current = S.solve(state, { rollouts: 6, seed: 8675309, params });
  const baseline = before.solve(state, { rollouts: 6, seed: 8675309, params });
  state.params.tierWeights[0] = 100; // Both jobs must keep their own snapshot.
  for (let slice = 0; slice < 3; slice++) {
    params.tierBase = 2.6 + slice * 0.25;
    params.wNow = 0.5 + slice * 0.1;
    assert.deepEqual(stepRounds(current, 2), stepRounds(baseline, 2));
    assert.equal(json(current.rows), json(baseline.rows), 'prepared rules or strategy became stale between slices');
  }
  const a = T.newGame({ seed: 'POLICY-CALLBACK', params: { rewards: false } }); a.maxDays = 3;
  const b = JSON.parse(json(a));
  let changed = false;
  const onMove = (action, result, st) => {
    if (!changed) { st.params.tierWeights = [0, 0, 0, 0, 1]; changed = true; }
  };
  S.playout(a, null, S.rng32(27), onMove);
  changed = false;
  before.playout(b, null, before.rng32(27), onMove);
  assert.equal(json(a), json(b), 'public playout stopped observing rule changes in its callback');
  console.log('PASS: frozen rule/contract definitions, isolated input snapshots, changed strategy slices and public playout callbacks.');
}

if (args.includes('--bench')) {
  const boards = snapshots.filter((_, i) => i % 3 === 0);
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const measure = (solver, task) => {
    const start = performance.now();
    task(solver);
    return performance.now() - start;
  };
  const tasks = {
    clone(solver) { for (let i = 0; i < 300; i++) for (const st of boards) solver.clone(st); },
    decide(solver) { for (let i = 0; i < 25; i++) for (const st of boards) solver.decide(st, null, solver.rng32(1)); },
    solve(solver) { for (const st of boards.slice(0, 12)) finish(solver, st); },
  };
  for (const [name, task] of Object.entries(tasks)) {
    task(S);
    if (before) task(before);
    const currentTimes = [];
    const beforeTimes = [];
    // Alternate order to reduce warmup and CPU clock bias.
    for (let repeat = 0; repeat < 5; repeat++) {
      for (const [solver, times] of repeat % 2 ? [[before, beforeTimes], [S, currentTimes]] : [[S, currentTimes], [before, beforeTimes]]) {
        if (solver) times.push(measure(solver, task));
      }
    }
    const ms = median(currentTimes);
    const old = before && median(beforeTimes);
    console.log(`${name}: ${ms.toFixed(1)} ms${before ? `; baseline ${old.toFixed(1)} ms; ${(old / ms).toFixed(2)}x faster` : ''}`);
  }
}

// Exercise the actual browser worker script with importScripts/postMessage
// supplied by a Node worker. No DOM or browser dependencies are needed.
async function checkWorkers() {
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    globalThis.self = globalThis;
    self.location = { search: '' };
    self.postMessage = (message) => parentPort.postMessage(message);
    self.importScripts = (...files) => {
      for (const file of files) {
        const name = path.join(workerData, file);
        vm.runInThisContext(fs.readFileSync(name, 'utf8'), { filename: name });
      }
    };
    importScripts('solver-worker.js');
    parentPort.on('message', (data) => self.onmessage({ data }));
  `, { eval: true, workerData: path.resolve(__dirname, '../js') });
  const st = T.newGame({ seed: 'WORKER-CHECK', params: { rewards: false } });
  st.maxDays = 2;
  async function request(id, raw, stream = 0, replace = false) {
    const received = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => cleanup(new Error('solver worker timed out')), 30000);
      const cleanup = (error) => {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('error', cleanup);
        if (error) reject(error);
        else resolve();
      };
      const onMessage = (m) => {
        if (m.id !== id) return;
        received.push(m);
        if (raw ? m.done : m.result.done) cleanup();
      };
      worker.on('message', onMessage);
      worker.on('error', cleanup);
      if (replace) worker.postMessage({ id: id - 1, state: st, rollouts: 100000, raw });
      worker.postMessage({ id, state: st, rollouts: 24, stream, raw });
    });
    const job = S.solve(st, { rollouts: 24, seed: (id * 7919 + 1) >>> 0, stream });
    let expected;
    do { expected = job.step(8); } while (!expected.done);
    if (!raw) assert.deepEqual(received.at(-1).result, expected);
    else {
      const rows = received[0].meta.map((meta) => ({ ...meta, vals: [] }));
      let sent = 0;
      for (const m of received) {
        assert.equal(m.rows[0].vals.length, m.rounds - sent);
        sent = m.rounds;
        m.rows.forEach((r, i) => Object.assign(rows[i], { ...r, vals: rows[i].vals.concat(r.vals) }));
      }
      assert.deepEqual(S.summarize(rows, sent, 24, expected.goal), expected);
    }
  }
  try {
    await request(1, false);
    await request(2, true, 1);
    await request(4, true, 2, true);
    console.log('PASS: worker results, streamed samples and replacing an active calculation.');
  } finally {
    await worker.terminate();
  }
}
checkWorkers().catch((error) => { console.error(error); process.exitCode = 1; });
