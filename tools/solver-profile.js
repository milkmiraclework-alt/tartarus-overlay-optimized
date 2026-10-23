#!/usr/bin/env node
/* Isolated synthetic CPU profile of the production Monte Carlo solver.
 * No capture, game input, reduced game horizon or altered strategy.
 * node tools/solver-profile.js [--rounds 64] [--repeats 3] [--out sandbox/solver-profile]
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const inspector = require('node:inspector');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { fileURLToPath } = require('node:url');
const T = require('../js/engine.js');
const S = require('../js/solver.js');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const rounds = Number(arg('--rounds', 64)), repeats = Number(arg('--repeats', 3));
assert.ok(Number.isInteger(rounds) && rounds > 0 && Number.isInteger(repeats) && repeats > 0);
const out = path.resolve(arg('--out', path.join(ROOT, 'sandbox/solver-profile')));

function fixtures() {
  const result = [];
  for (const tools of [[], ['maul', 'crown', 'skewer'], ['saw', 'whip', 'collar', 'revenge']]) {
    const st = T.newGame({ seed: 'CPU-PROFILE-' + tools.join('-') });
    if (tools.length) st.pending = [];
    for (const tool of tools) assert.ok(T.addTool(st, tool).ok, 'Profile fixture failed to add ' + tool);
    const random = S.rng32(23), seen = new Set();
    let guard = 0;
    while (st.phase !== 'ended') {
      assert.ok(guard++ < 2000, 'fixture did not finish');
      const band = st.day === 1 ? 'early' : st.day >= Math.ceil(st.maxDays * .75) ? 'late' : st.day >= Math.ceil(st.maxDays * .4) ? 'middle' : null;
      const phase = st.pending.length ? 'offer' : st.chaining ? 'chain' : st.phase;
      const key = phase === 'patrol' ? band && `${band}-patrol` : phase;
      const candidates = S.candidates(st).length;
      if (key && !seen.has(key) && candidates > 1) {
        seen.add(key);
        result.push({ name: `${tools.join('+') || 'no-tools'}:${key}`, tools, day: st.day, maxDays: st.maxDays,
          phase, candidates, state: S.clone(st) });
      }
      const action = S.decide(st, null, random);
      assert.ok(action && S.apply(st, action).ok, 'fixture policy returned an illegal move');
    }
  }
  return result;
}
function run(fixture, count) {
  const job = S.solve(fixture.state, { rollouts: count, seed: 7919, stream: 1 });
  let progress;
  do { progress = job.step(60, true); } while (!progress.done);
  assert.equal(progress.rounds, count, 'incomplete rollout budget');
  assert.ok(job.rows.every((row) => row.vals.length === count), 'lost samples');
  return { digest: createHash('sha256').update(JSON.stringify(job.rows)).digest('hex'), chainCache: job.chainInfo() };
}
function summarize(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
  const totals = new Map(), frames = new Map(), stages = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = nodes.get(profile.samples[i]);
    const weight = profile.timeDeltas[i];
    total += weight;
    const frameKey = JSON.stringify(node.callFrame);
    frames.set(frameKey, node.callFrame);
    totals.set(frameKey, (totals.get(frameKey) || 0) + weight);
    const stack = [];
    for (let n = node; n; n = nodes.get(parents.get(n.id))) stack.push(n.callFrame);
    const has = (names) => stack.some((f) => f.url.endsWith('/solver.js') && names.includes(f.functionName));
    const stage = node.callFrame.functionName === '(garbage collector)' ? 'garbage collection'
      : has(['forkTrial', 'clone', 'copyData']) ? 'state copying'
      : has(['hideFuture']) ? 'hidden-state sampling'
      : has(['decide']) ? 'policy evaluation'
      : has(['apply']) ? 'engine actions'
      : 'other';
    stages.set(stage, (stages.get(stage) || 0) + weight);
  }
  const rows = (entries, transform) => [...entries].sort((a, b) => b[1] - a[1]).map(([key, us]) => ({ ...transform(key), ms: Math.round(us / 1000), percent: +(us / total * 100).toFixed(2) }));
  return {
    sampledMs: Math.round(total / 1000), samples: profile.samples.length,
    stages: rows(stages, (stage) => ({ stage })),
    functions: rows(totals, (key) => {
      const f = frames.get(key);
      const file = f.url.startsWith('file:') ? path.relative(ROOT, fileURLToPath(f.url)).replace(/\\/g, '/') : f.url;
      return { name: f.functionName || '(anonymous)', file, line: f.lineNumber + 1 };
    }).slice(0, 30),
  };
}
(async () => {
  const boards = fixtures();
  for (const fixture of boards) run(fixture, 4);
  const session = new inspector.Session();
  session.connect();
  const post = (name, params = {}) => new Promise((resolve, reject) => session.post(name, params, (error, value) => error ? reject(error) : resolve(value)));
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: 500 });
  await post('Profiler.start');
  const start = performance.now(), cpu = process.cpuUsage();
  const timings = boards.map((f) => ({ name: f.name, day: f.day, maxDays: f.maxDays, phase: f.phase, candidates: f.candidates, ms: [] }));
  for (let repeat = 0; repeat < repeats; repeat++) {
    // Rotate the order rather than always measuring the same board first.
    for (let k = 0; k < boards.length; k++) {
      const i = (k + repeat) % boards.length, begin = performance.now();
      const result = run(boards[i], rounds), entry = timings[i];
      entry.ms.push(+(performance.now() - begin).toFixed(1));
      if (entry.digest) assert.equal(result.digest, entry.digest, 'repeated seeded samples changed');
      entry.digest = result.digest;
      entry.chainCache = result.chainCache;
    }
  }
  const elapsedMs = Math.round(performance.now() - start), usage = process.cpuUsage(cpu);
  const { profile } = await post('Profiler.stop');
  session.disconnect();
  const report = { checkedAt: new Date().toISOString(), cpu: os.cpus()[0].model, logicalProcessors: os.cpus().length,
    node: process.version, roundsPerCandidate: rounds, repeats, singleThread: true, elapsedMs,
    cpuMs: Math.round((usage.user + usage.system) / 1000),
    sourceSha256: Object.fromEntries(['engine', 'solver'].map((name) => [`js/${name}.js`, createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'js', name + '.js'))).digest('hex')])),
    ...summarize(profile), fixtures: timings,
    limitations: 'Synthetic deterministic fixtures, full remaining game horizon. CPU profiling adds overhead. One Node worker, not Electron end-to-end latency, parallel scaling, a native comparison or real-game profit. Percentages are weighted stack samples, not exact instruction counters.' };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'solver.cpuprofile'), JSON.stringify(profile));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ elapsedMs, fixtures: boards.length, stages: report.stages, functions: report.functions.slice(0, 15), report: path.join(out, 'report.json') }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
