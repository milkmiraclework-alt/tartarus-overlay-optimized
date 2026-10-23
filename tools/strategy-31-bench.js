#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const T = require('../js/engine'), S = require('../js/solver'), R = require('../js/rust-solver');
const { fixture } = require('./strategy-31-check');
const samples = [], positions = [];
for (const tools of [[], ['trap', 'saw', 'whip']]) {
  const st = T.newGame({ seed: 'BENCH31-' + tools.join('-') }); st.pending = [];
  for (const tool of tools) assert.ok(T.addTool(st, tool).ok);
  const days = new Set();
  S.playout(st, null, S.rng32(20261023), (_action, _result, current) => {
    if ([3, 7, 10].includes(current.day) && current.vault.length < 10 && !current.pending.length && current.phase === 'manage' && !days.has(current.day) && S.candidates(current).length > 1) {
      days.add(current.day); positions.push({ name: `day${current.day}-${tools.join('-') || 'none'}`, state: S.clone(current) });
    }
  });
}
positions.push({ name: 'terminal-single', state: fixture() }, { name: 'terminal-pair', state: fixture(2, 2) });
(async () => {
  const current = await R.fromBytes(fs.readFileSync('js/solver-core.wasm'));
  const baseline = 'sandbox/tartarus-before-31/js/solver-core.wasm';
  const previous = await R.fromBytes(fs.existsSync(baseline) ? fs.readFileSync(baseline) :
    require('node:child_process').execFileSync('git', ['show', 'f044ea6f6c732b2c9fd8e0bcdbac9ef5ee9d7dc1:js/solver-core.wasm'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }));
  const median = xs => xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  for (const { name, state } of positions) {
    const times = [[], []], cores = [previous, current];
    for (let round = -1; round < 7; round++) for (const v of round % 2 ? [1,0] : [0,1]) {
      const start = performance.now(), result = cores[v].request({ op: 'solve', state, rollouts: 1600, seed: 313131 });
      const elapsed = performance.now() - start;
      assert.equal(result.rounds, 1600); assert.ok(result.rows.every(row => row.n === undefined || row.n === 1600));
      if (round >= 0) times[v].push(elapsed);
    }
    const row = { name, rolloutsPerAction: 1600, samples: 7, beforeMedianMs: median(times[0]), currentMedianMs: median(times[1]), timingsMs: times };
    samples.push(row); console.log(JSON.stringify(row));
  }
  const report = { checkedAt: new Date().toISOString(), version: require('../desktop/package.json').version,
    cpu: require('node:os').cpus()[0].model, baseline: 'local.30 frozen WASM', current: 'local.31 WASM', samples,
    limitations: 'Single-thread in-process WASM comparisons with interleaved order and warm-up. Full budget retained; not live capture, game FPS or end-to-end latency. Other local work can affect timings.', gameInput: false };
  fs.writeFileSync('tools/results/tartarus-strategy-31-20261023-bench.json', JSON.stringify(report,null,2)+'\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
