/* Tartarus Simulator: solver worker.
 * Runs the Monte Carlo solver off the page's main thread and streams partial
 * results back, so the board stays responsive while it plays options out.
 * A newer request replaces the one in progress. Background checks use short
 * slices with idle gaps. Pause retains the job; promotion resumes its exact
 * sample stream at full speed under the foreground request's ID.
 *
 * With `raw`, it sends each round's values instead of a result, so the page
 * can run several of these at once, each on its own `stream` of dice, and
 * merge their rows (TartarusSolver.summarize). */
'use strict';

importScripts(`engine.js${self.location.search}`, `tool-combos.js${self.location.search}`, `solver.js${self.location.search}`, `solver-forecast.js${self.location.search}`);
let current = null;
function tick(task) {
  task.timer = 0;
  if (current !== task || task.paused || task.done) return;
  const result = task.job.step(task.background ? 8 : 60, task.raw);
  task.done = result.done;
  if (task.raw) {
    self.postMessage({
      id: task.id, stream: task.stream, rounds: result.rounds, done: result.done, goal: result.goal,
      meta: task.sent === 0 ? task.job.rows.map((r) => ({ label: r.label, action: r.action, kind: r.kind, extra: r.extra, policy: r.policy })) : null,
      rows: task.job.rows.map((r) => ({ vals: r.vals.slice(task.sent), pass: r.pass, points: r.points, best: r.best })),
    });
    task.sent = result.rounds;
  } else self.postMessage({ id: task.id, result });
  if (!task.done) task.timer = setTimeout(() => tick(task), task.background ? 24 : 0);
}
self.onmessage = ({ data }) => {
  if (data.predict) {
    try { self.postMessage({ id: data.id, predictions: self.TartarusForecast.predict(data.state, data.action, data.options) }); }
    catch { self.postMessage({ id: data.id, predictions: [] }); }
    return;
  }
  if (data.pause || data.promote) {
    if (!current || current.id !== (data.from === undefined ? data.id : data.from)) return;
    clearTimeout(current.timer); current.timer = 0;
    current.paused = !!data.pause;
    if (data.promote) {
      if (data.indices) {
        const rows = data.indices.map((i) => current.job.rows[i]);
        current.job.rows.splice(0, current.job.rows.length, ...rows);
      }
      current.id = data.id; current.background = false;
    }
    if (!current.paused && !current.done) current.timer = setTimeout(() => tick(current), 0);
    return;
  }
  if (current) clearTimeout(current.timer);
  current = null;
  if (data.cancel) return;
  const { id, state, rollouts, params, extra, stream, raw, background, seed } = data;
  current = { id, stream, raw, background: !!background, paused: false, done: false, sent: 0, timer: 0,
    job: self.TartarusSolver.solve(state, { rollouts, params, extra, stream: stream || 0, seed: seed === undefined ? (id * 7919 + 1) >>> 0 : seed }) };
  tick(current);
};
