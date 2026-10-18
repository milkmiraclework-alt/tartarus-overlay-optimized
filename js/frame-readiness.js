/* Readiness evidence: a changed board, visible controls and stable fresh frames. */
(function (root) {
  'use strict';
  function sample(img, loc, S) {
    const corners = [[0, 0], [5, 0], [0, 3], [5, 3]].map(([u, v]) => S.at(loc, u, v));
    const left = Math.min(...corners.map((p) => p[0])) - 40 * loc.s;
    const right = Math.max(...corners.map((p) => p[0])) + 40 * loc.s;
    const top = Math.min(...corners.map((p) => p[1])) - 80 * loc.s;
    const bottom = Math.max(...corners.map((p) => p[1])) + 30 * loc.s;
    const boxes = [[left, top, right, bottom], [left, bottom, right, img.height - 1]];
    const out = new Uint8Array(32 * 24 * boxes.length);
    let i = 0;
    for (const box of boxes) for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
      const px = Math.max(0, Math.min(img.width - 1, Math.round(box[0] + (box[2] - box[0]) * (x + 0.5) / 32)));
      const py = Math.max(0, Math.min(img.height - 1, Math.round(box[1] + (box[3] - box[1]) * (y + 0.5) / 24)));
      const offset = (py * img.width + px) * 4;
      out[i++] = Math.round(0.299 * img.data[offset] + 0.587 * img.data[offset + 1] + 0.114 * img.data[offset + 2]);
    }
    return out;
  }
  function difference(a, b) {
    if (!a || !b || a.length !== b.length) return { changed: 1, mean: 255 };
    let changed = 0, sum = 0;
    for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); sum += delta; if (delta >= 12) changed++; }
    return { changed: changed / a.length, mean: sum / a.length };
  }
  function controlsFor(result) {
    if (!result.warden || result.warden.conf < 0.8 || !result.cells || result.cells.some((cell) => cell.kind === 'inmate' && (cell.conf < 0.6 || cell.ghost))) return '';
    let menu = '';
    if (result.doors && result.doors.conf >= 0.85) menu = 'doors:' + result.doors.cells.slice().sort((a, b) => a - b).join(',');
    else if (result.decision && result.decision.title && (result.decision.consume || result.decision.replace || result.decision.end || result.decision.office || result.decision.hunt)) {
      const decision = result.warden.cell === 0 && !result.decision.ratway ? { ...result.decision, consume: false, replace: false, end: false, office: true } : result.decision;
      menu = 'decision:' + ['consume', 'replace', 'end', 'office', 'ratway', 'hunt'].map((key) => !!decision[key]).join(',') + '|' + JSON.stringify({ instigate: decision.instigate, bestow: decision.bestow, framed: decision.framed });
    }
    if (!menu) return '';
    return menu + '|' + JSON.stringify({ warden: result.warden.cell, cells: result.cells.map((cell) => [cell.kind, cell.beast, cell.tier, !!cell.nest, !!cell.jaws, !!cell.event, !!cell.prey]) });
  }
  function create() {
    let calibration = null, generation = null, previous = null, stableAt = 0, count = 0;
    function reset() { previous = null; stableAt = 0; count = 0; }
    return {
      calibrate(value) { calibration = value; generation = null; reset(); },
      get calibration() { return calibration; },
      observe({ epoch, time, sample, controls, valid, fresh = true }) {
        if (generation !== epoch) { generation = epoch; reset(); }
        if (!calibration || !valid || !controls || controls === calibration.controls || !fresh || difference(calibration.sample, sample).changed < 0.01) { reset(); return false; }
        const delta = previous && difference(previous.sample, sample);
        if (!previous || controls !== previous.controls || delta.changed > 0.004 || delta.mean > 1) { stableAt = time; count = 1; }
        else count++;
        previous = { sample, controls };
        return count >= 3 && time - stableAt >= 200;
      },
    };
  }
  const api = { create, sample, difference, controlsFor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TartarusFrameReadiness = api;
})(typeof self !== 'undefined' ? self : globalThis);
