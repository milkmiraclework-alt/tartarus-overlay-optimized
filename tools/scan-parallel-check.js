#!/usr/bin/env node
/* Run the real reader and nested search workers under worker_threads.
 * Optional: --frames DIR --baseline previous/scan.js --bench */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { Worker: Thread, isMainThread, parentPort, workerData } = require('node:worker_threads');

if (!isMainThread) {
  global.self = globalThis;
  self.location = { search: '' };
  // Browser workers fetch the checked-in kernel beside their own script.
  self.fetch = async (file) => ({ ok: true, arrayBuffer: async () => {
    const bytes = fs.readFileSync(path.resolve(path.dirname(workerData.script), file.split('?')[0]));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } });
  Object.defineProperty(self, 'navigator', { value: { hardwareConcurrency: workerData.cores } });
  self.postMessage = (message) => parentPort.postMessage(message);
  self.importScripts = (...files) => {
    for (const file of files) {
      const absolute = path.resolve(path.dirname(workerData.script), file.split('?')[0]);
      vm.runInThisContext(fs.readFileSync(absolute, 'utf8'), { filename: absolute });
    }
  };
  self.Worker = class {
    constructor(file) {
      parentPort.postMessage({ diagnostic: 'spawn' });
      if (workerData.failure === 'create') throw new Error('Test: worker creation blocked');
      this.thread = workerData.failure === 'runtime'
        ? new Thread('throw new Error("Test: nested worker crashed")', { eval: true })
        : new Thread(__filename, { workerData: { script: path.resolve(path.dirname(workerData.script), file.split('?')[0]), cores: workerData.cores } });
      this.thread.on('message', (data) => { if (this.onmessage) this.onmessage({ data }); });
      this.thread.on('error', () => { if (this.onerror) this.onerror({ preventDefault() {} }); });
    }
    postMessage(message) {
      if (workerData.failure === 'panel' && message.panel !== undefined) {
        this.thread.terminate();
        queueMicrotask(() => this.onerror && this.onerror({ preventDefault() {} }));
      } else this.thread.postMessage(message);
    }
    terminate() { this.thread.terminate(); }
  };
  importScripts(path.basename(workerData.script));
  parentPort.on('message', (data) => self.onmessage({ data }));
} else {
  const args = process.argv.slice(2);
  const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
  const S = require('../js/scan.js');
  const before = option('--baseline') ? require(path.resolve(option('--baseline'))) : S;
  const reference = require('../js/scan-data.js'), picks = require('../js/pick-data.js');
  const ref = S.withPanelIcons(reference, picks);
  const clean = (result) => { const copy = { ...result }; delete copy.ms; return copy; };
  function expected(img) {
    const result = before.scan(img, ref);
    for (const tool of result.tools && result.tools.tools || []) {
      Object.assign(tool, ref.toolNames[tool.id] || {});
      for (const alt of tool.alts || []) alt.sim = ref.toolNames[alt.id]?.sim;
    }
    if (result.tools) result.tools.sims = [...new Set(ref.tools.map((r) => ref.toolNames[r.id]?.sim).filter(Boolean))];
    return clean(result);
  }
  function reader(cores, failure, tracking = false) {
    const thread = new Thread(__filename, { workerData: { script: path.resolve(__dirname, '../js/scan-worker.js'), cores, failure } });
    const pending = new Map();
    let id = 0, spawned = 0, lastTracking = null;
    thread.on('message', (data) => {
      if (data.diagnostic === 'spawn') { spawned++; return; }
      const task = pending.get(data.id);
      if (!task) return;
      pending.delete(data.id); clearTimeout(task.timer);
      lastTracking = data.tracking || null;
      if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
    });
    thread.on('error', (error) => { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); });
    thread.postMessage({ configure: { parallel: true, tracking } });
    return {
      async scan(img, prepared) {
        const current = ++id;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(current); reject(new Error('Reader timed out')); }, 30000);
          pending.set(current, { resolve, reject, timer });
          thread.postMessage({ id: current, width: img.width, height: img.height, buffer: img.data.buffer, prepared });
        });
      },
      spawned: () => spawned,
      info: () => lastTracking,
      stop: () => thread.terminate(),
    };
  }
  async function main() {
    const tiny = { width: 160, height: 100, data: new Uint8ClampedArray(160 * 100 * 4) };
    for (let i = 0; i < tiny.data.length; i++) tiny.data[i] = i * 17 % 251;
    const tinyExpected = expected(tiny);
    for (const [cores, failure] of [[2, null], [8, 'create'], [8, 'runtime']]) {
      const test = reader(cores, failure);
      try {
        assert.deepEqual(clean(await test.scan(tiny)), tinyExpected);
        const count = test.spawned();
        assert.equal(count > 0, cores > 2);
        assert.deepEqual(clean(await test.scan(tiny)), tinyExpected);
        assert.equal(test.spawned(), count, 'A failed pool was repeatedly restarted');
      } finally { await test.stop(); }
    }
    console.log('PASS: low-core, blocked-worker and crashed-worker fallbacks preserve results.');
    const fixtures = [{ name: 'small non-board', img: tiny }, { name: 'uniform non-board (tied search scores)', img: { ...tiny, data: new Uint8ClampedArray(tiny.data.length).fill(73) } }];
    if (option('--frames')) {
      const folder = path.resolve(option('--frames'));
      for (const name of fs.readdirSync(folder).filter((file) => file.endsWith('.rgba'))) {
        const metadata = JSON.parse(fs.readFileSync(path.join(folder, name.replace(/\.rgba$/, '.json'))));
        fixtures.push({ name, img: { ...metadata, data: new Uint8ClampedArray(fs.readFileSync(path.join(folder, name))) } });
      }
    }
    const parallel = reader(8);
    const serial = reader(2);
    try {
      for (const { name, img } of fixtures) {
        const oracle = expected(img);
        const times = { serial: [], parallel: [] };
        const rounds = args.includes('--bench') && name.endsWith('.rgba') ? 4 : 1;
        for (let i = 0; i < rounds; i++) {
          const order = i % 2 ? [['serial', serial], ['parallel', parallel]] : [['parallel', parallel], ['serial', serial]];
          for (const [label, test] of order) {
            const start = performance.now();
            const result = await test.scan(img);
            const elapsed = performance.now() - start;
            assert.deepEqual(clean(result), oracle, `Reader output changed for ${label}: ${name}`);
            if (rounds === 1 || i) times[label].push(elapsed);
          }
        }
        const median = (values) => values.sort((a, b) => a - b)[values.length >> 1];
        const old = median(times.serial), now = median(times.parallel);
        console.log(`PASS: exact full reader output ${name}; serial ${old.toFixed(0)} ms; parallel ${now.toFixed(0)} ms; ${(old / now).toFixed(2)}x faster.`);
      }
      assert.equal(parallel.spawned(), 4, 'Search workers were recreated per frame');
      const board = fixtures.find(({ name }) => name.endsWith('.rgba'));
      if (board) {
        const handed = reader(8, null, true);
        try {
          const img = board.img, oracle = expected(img), gray = S.grayOf(img), sharp = S.blur(gray, img.width, img.height, 1), loc = oracle.loc;
          const cells = S.readBoardCells(img, sharp, loc, ref);
          const prepared = { width: img.width, height: img.height, loc, board: cells,
            doors: S.readDoors(img, sharp, loc, ref, false, cells.cells), days: S.readDays(img, sharp, loc, ref), decision: S.readDecision(img, loc) };
          assert.deepEqual(clean(await handed.scan(img, prepared)), oracle, 'exact-frame handoff changed the reading');
          assert.equal(handed.info().fromProbe, true);
          assert.deepEqual(clean(await handed.scan(img, { ...prepared, width: img.width + 1 })), oracle, 'invalid handoff did not fall back');
          assert.equal(handed.info().fromProbe, false);
          console.log('PASS: exact-frame probe handoff and incompatible-dimensions fallback preserve full reader results.');
        } finally { await handed.stop(); }
        const failedPanel = reader(8, 'panel');
        try {
          assert.deepEqual(clean(await failedPanel.scan(board.img)), expected(board.img));
          assert.deepEqual(clean(await failedPanel.scan(board.img)), expected(board.img));
          console.log('PASS: a panel-worker failure falls back to exact serial reading and remains usable.');
        } finally { await failedPanel.stop(); }
        const tracked = reader(8, null, true);
        try {
          for (const frame of fixtures.filter(({ name }) => name.endsWith('.rgba'))) {
            const oracle = expected(frame.img);
            assert.deepEqual(clean(await tracked.scan(frame.img)), oracle, 'tracked board differs from full reading');
            const start = performance.now();
            assert.deepEqual(clean(await tracked.scan(frame.img)), oracle, 'repeated board differs from full reading');
            assert.equal(tracked.info().mode, 'tracked');
            assert.equal(tracked.info().accelerated, true, 'WASM reader was not enabled');
            assert.equal(tracked.info().panels, 3, 'identical panels were read again');
            console.log(`PASS: calibrated layout, exact full output and 3 reused panels ${frame.name}: ${(performance.now() - start).toFixed(0)} ms.`);
          }
          const { img } = board;
          const shifted = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.length) };
          for (let y = 0; y < img.height; y++) shifted.data.set(img.data.subarray(y * img.width * 4, (y * img.width + img.width - 80) * 4), (y * img.width + 80) * 4);
          assert.deepEqual(clean(await tracked.scan(shifted)), expected(shifted), 'moved board did not reacquire correctly');
          assert.equal(tracked.info().mode, 'full');
          assert.deepEqual(clean(await tracked.scan(tiny)), tinyExpected, 'resizing retained an old board');
          assert.equal(tracked.info().mode, 'full');
          assert.deepEqual(clean(await tracked.scan(img)), expected(img), 'recovery after a missing board failed');
          console.log('PASS: board movement, window resizing and missing screens invalidate calibration and reacquire the complete board.');
        } finally { await tracked.stop(); }
      }
    } finally { await parallel.stop(); await serial.stop(); }
  }
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
