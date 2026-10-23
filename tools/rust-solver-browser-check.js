/* Run inside the real analyzer renderer (or call with explicit Node modules).
 * Only generated engine states; never reads or controls a game window. */
'use strict';
module.exports = async function checkRustSolver(options = {}) {
  const T = options.T || window.Tartarus, S = options.S || window.TartarusSolver;
  let R = options.R || window.TartarusRust;
  if (!R) {
    const script = await (await fetch(new URL('/js/rust-solver.js', location.href))).text();
    new Function('module', script)(undefined); R = window.TartarusRust;
  }
  const core = options.core || await R.fromBytes(await (await fetch(new URL('/js/solver-core.wasm', location.href))).arrayBuffer());
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const rounds = options.rounds || 64, repeats = options.repeats || 5;
  const canonical = (value) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
  const fixtures = [];
  const empty = T.newGame({ seed: 'RUST-TIMING-EARLY' });
  fixtures.push({ name: 'day-1 instrument offer', state: empty });
  for (const [name, tools, card, day] of [
    ['day-1 patrol', [], null, 1],
    ['populated tools', ['saw', 'whip', 'collar', 'revenge', 'muzzle', 'maul', 'crown', 'skewer', 'guillotine'], null, 8],
    ['Cage Fight', ['maul', 'crown', 'skewer', 'guillotine'], 'cagefight', 8],
    ['Opulence treasure', ['rope', 'maiden', 'scapegoat'], 'opulence', 14],
  ]) {
    const st = T.newGame({ seed: 'RUST-TIMING-' + name, startEvent: card });
    st.pending = []; st.day = day; st.phase = 'patrol'; st.position = 2; st.destinations = [3, 5, 8];
    for (const n of (day > 1 ? [1, 2, 3, 4, 6, 7, 10, 11, 13] : [])) T.editCell(st, n, { kind: 'open', beast: T.BEASTS[n % 4], tier: (n * 7) % 4 });
    for (const tool of tools) T.addTool(st, tool);
    if (card === 'opulence') { st.phase = 'manage'; st.pending = Array.from({ length: 3 }, () => ({ kind: 'gift', options: T.GIFT_IDS.slice() })); }
    fixtures.push({ name, state: st });
  }
  function finish(st, rust, count) {
    const opts = { rollouts: count, seed: 7919, stream: 1 };
    const job = rust ? R.solve(core, st, opts) : S.solve(st, opts); let progress;
    do { progress = job.step(60, true); } while (!progress.done);
    check(progress.rounds === count, 'Incomplete simulation budget');
    return canonical({ rows: job.rows, result: S.summarize(job.rows, progress.rounds, count, progress.goal) });
  }
  const report = [];
  for (const fixture of fixtures) {
    const saved = JSON.stringify(fixture.state), expected = finish(fixture.state, false, 8);
    check(finish(fixture.state, true, 8) === expected, 'Warmup sample mismatch: ' + fixture.name);
    const times = { javascript: [], rust: [] };
    for (let repeat = 0; repeat < repeats; repeat++) {
      const results = {};
      for (const rust of (repeat % 2 ? [true, false] : [false, true])) {
        const start = performance.now(), result = finish(fixture.state, rust, rounds);
        const label = rust ? 'rust' : 'javascript';
        times[label].push(+(performance.now() - start).toFixed(2)); results[label] = result;
      }
      check(results.rust === results.javascript, 'Raw samples/rankings changed: ' + fixture.name);
    }
    check(JSON.stringify(fixture.state) === saved, 'Solver changed its input');
    const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const jsMs = median(times.javascript), rustMs = median(times.rust);
    report.push({ name: fixture.name, day: fixture.state.day, maxDays: fixture.state.maxDays,
      candidates: S.candidates(fixture.state).length, rounds, javascriptMs: jsMs, rustMs,
      speedup: +(jsMs / rustMs).toFixed(2), measurements: times, sampleParity: true });
  }
  // Pausing at exact round boundaries and projecting a patrol family must
  // preserve every existing sample and the next RNG state.
  const family = S.clone(fixtures[1].state); family.destinations = [3, 4, 5, 6, 7, 8];
  const promotionOptions = { rollouts: 12, seed: 103, stream: 2 };
  const job = R.solve(core, family, promotionOptions);
  const partial = core.request({ op: 'step', rounds: 3 });
  for (let i = 0; i < job.rows.length; i++) { job.rows[i].vals.push(...partial.rows[i].vals.map((v) => v === null ? NaN : v)); job.rows[i].best = partial.rows[i].best; }
  job.select([0, 2, 4]);
  let progress; do { progress = job.step(60, true); } while (!progress.done);
  family.destinations = [3, 5, 7];
  const reference = S.solve(family, promotionOptions); do { progress = reference.step(60, true); } while (!progress.done);
  // Policy flags are recomputed by the foreground family projection in the
  // analyzer; all actual sample values and tie metrics must remain exact.
  check(JSON.stringify(job.rows.map(({ action, vals, best }) => ({ action, vals, best }))) ===
    JSON.stringify(reference.rows.map(({ action, vals, best }) => ({ action, vals, best }))), 'Promotion changed the continued random stream');
  job.cancel();
  return { checkedAt: new Date().toISOString(), rounds, repeats, fixtures: report, memoryBytes: core.memoryBytes(),
    rawSampleAndRankingParity: true, promotionParity: true, gameInput: false,
    limitations: 'Warm single-worker solver timings including initialization, slices, JSON boundary and summary; complete remaining-game horizon. Synthetic positions, alternating order. Excludes capture, screen settling, OCR, cold WASM compilation and parallel-worker scheduling. Background machine load is uncontrolled; no real-game profit claim.' };
};
