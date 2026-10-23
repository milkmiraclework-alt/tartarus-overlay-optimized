#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const T = require('../js/engine.js'), S = require('../js/solver.js');
const revision = require('../desktop/lib/upstream-version.json').commit;
const context = { module: { exports: {} } };
let originalSource;
try { originalSource = execFileSync('git', ['show', `${revision}:js/engine.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
catch {
  execFileSync('git', ['fetch', '--no-tags', 'https://github.com/blahdot3h/tartarus-simulator.git', revision], { stdio: 'inherit' });
  originalSource = execFileSync('git', ['show', `${revision}:js/engine.js`], { encoding: 'utf8' });
}
vm.runInNewContext(originalSource, context);
const original = context.module.exports;
const clean = state => JSON.parse(JSON.stringify(state, (key, value) => key === 'log' ? undefined : value));
let cases = 0;
for (let seed = 0; seed < 64; seed++) {
  const config = { seed: `UPSTREAM-020-${seed}` };
  const local = T.newGame(config), author = original.newGame(config);
  assert.deepEqual(clean(local), clean(author), 'initial inmates, weighted doors and initial RNG');
  const opened = local.cells.filter(c => c.inmate && !c.sealed).length;
  assert.ok(opened === 3 || opened === 4);
  local.pending = []; author.pending = [];
  for (const st of [local, author]) { st.phase = 'manage'; st.position = 1; }
  for (const beast of T.BEASTS) for (const pestle of [false, true]) {
    const a = S.clone(local), b = JSON.parse(JSON.stringify(author));
    for (const [engine, state] of [[T, a], [original, b]]) {
      engine.editCell(state, 1, { kind: 'open', beast, tier: 0 });
      if (pestle) engine.addTool(state, 'pestle');
      assert.ok(engine.swap(state).ok);
      assert.equal(state.cells[1].inmate.beast === beast, pestle);
    }
    assert.deepEqual(clean(a), clean(b), 'Replace beast/rarity/RNG'); cases++;
  }
  for (const accept of [false, true]) for (const kind of ['chain', 'usurp1', 'usurp4']) {
    const a = S.clone(local), b = JSON.parse(JSON.stringify(author));
    for (const [engine, state] of [[T, a], [original, b]]) {
      state.params.eventFollowChance = 100;
      state.phase = 'event'; state.event = { kind, cell: 1 };
      assert.ok(engine.resolveEvent(state, accept).ok);
    }
    assert.deepEqual(clean(a), clean(b), 'follow-up event and Usurpation RNG'); cases++;
  }
  for (const officeDoorOdds of [0, 37, 100]) {
    const a = S.clone(local), b = JSON.parse(JSON.stringify(author));
    for (const [engine, state] of [[T, a], [original, b]]) {
      state.position = 12; state.params.officeDoorOdds = officeDoorOdds;
      assert.ok(engine.endDay(state).ok);
      if (!officeDoorOdds) assert.ok(!state.destinations.includes(0));
    }
    assert.deepEqual(clean(a), clean(b), 'weighted office draw'); cases++;
  }
}
const source = fs.readFileSync(require.resolve('../js/analyze.js'), 'utf8');
const start = source.indexOf('      const again = model.runStart'), end = source.indexOf('      runObjective = null;', start);
assert.ok(start > 0 && end > start);
for (const [model, runStartEvent, expected] of [
  [{ maxDays: 30, step: 'manage' }, null, 20],
  [{ maxDays: 20, step: 'manage' }, 'ironlaw', 30],
  [{ maxDays: 30, runStart: true, step: 'choice', startEvent: 'ironlaw' }, null, 30],
  [{ maxDays: 30, step: 'patrol' }, 'cagefight', 20],
]) {
  const got = vm.runInNewContext(source.slice(start, end) + '\nkeep.maxDays;', { model, runStartEvent, runObjective: null, T });
  assert.equal(got, expected, 'Iron Law duration must reset only for a new run');
}
console.log(`PASS: ${cases} targeted starting-board/Replace/event/office cases match pinned upstream, including RNG; 4 Iron Law transitions.`);
