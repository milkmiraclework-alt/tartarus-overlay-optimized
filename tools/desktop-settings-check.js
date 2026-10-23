#!/usr/bin/env node
/* Exercise the production settings block with in-memory profiles, no app,
 * real game, user settings directory, registry or startup changes. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const text = fs.readFileSync(require.resolve('../desktop/main.js'), 'utf8');
const start = text.indexOf('const settings = Object.assign('), end = text.indexOf('// ---------- The debug log ----------', start);
assert.ok(start >= 0 && end > start);
function load(saved, extra = {}) {
  let flush = null, persisted = null;
  const context = { OPTIMIZED: true, TEST: false, DEV: false, ...extra, readJson: () => structuredClone(saved), SETTINGS_FILE: 'isolated/settings.json',
    setTimeout(fn) { flush = fn; return 1; }, clearTimeout() {}, path: { dirname() { return 'isolated'; } },
    fs: { mkdirSync() {}, writeFileSync(file, bytes) { assert.equal(file, 'isolated/settings.json'); persisted = JSON.parse(bytes); } } };
  vm.runInNewContext(text.slice(start, end) + '\nglobalThis.snapshot=JSON.parse(JSON.stringify(settings));', context);
  flush?.();
  return { settings: JSON.parse(JSON.stringify(context.snapshot)), persisted };
}
const original = { v: 2, record: true, consent: { version: 4, at: 'retained' }, logPath: 'chosen.log', hideBehind: true, overlayWidth: 390 };
const first = load(original);
assert.equal(first.settings.record, false); assert.equal(first.persisted.optimizedRecordPolicy, 1);
for (const key of ['consent', 'logPath', 'hideBehind', 'overlayWidth']) assert.deepEqual(first.persisted[key], original[key]);
const next = load(first.persisted); assert.equal(next.settings.record, false); assert.equal(next.persisted, null);
assert.equal(load({ ...first.persisted, record: true }).settings.record, true, 'Explicit recording opt-in was lost on restart');
assert.equal(load(original, { TEST: true }).settings.record, true, 'Controlled test recording was disabled');
assert.equal(load(original, { DEV: true }).settings.record, true, 'Explicit debug recording was disabled');
assert.equal(load({}, { OPTIMIZED: false }).settings.record, true, 'Legacy non-fork defaults changed');
const pruneStart = text.indexOf('function pruneRecords() {'), pruneEnd = text.indexOf('function recordTo()', pruneStart);
assert.ok(pruneStart >= 0 && pruneEnd > pruneStart);
vm.runInNewContext(text.slice(pruneStart, pruneEnd) + '\npruneRecords();', {
  settings: { record: false },
  fs: new Proxy({}, { get() { throw new Error('Disabled recording touched historical records'); } }),
  rebuildMenu() { throw new Error('Disabled recording did unnecessary housekeeping'); },
});
console.log('PASS: optimized recording defaults off; old profiles migrate once without changing consent/log/layout, explicit opt-in survives restart, and test/debug profiles retain recording.');
