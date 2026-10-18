#!/usr/bin/env node
/* The parallel reader must settle occluded card numbers using fresh board
 * cells, including when the panel's own pixels are unchanged. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
async function check(cores) {
  const loc = { s: 1, tx: 0, ty: 0, score: 1 }, calls = [];
  let actualCell = 7, cached = false, hidden = true;
  const scan = {
    grayOf: () => [], blur: () => [], readBoardCells: () => ({ cells: [actualCell], warden: { cell: 1 } }),
    prepareBoardSearch: () => ({ W: 100, H: 100, bw: 10, bh: 10, levels: [{ f: 1 }] }),
    coarseBoardSearch: () => [], refineBoardSearch: () => loc,
    readDoors(img, sharp, at, ref, foreign, cells) {
      calls.push(cells); return { cells: [cells ? cells[0] : 4], hidden: hidden ? [cells ? cells[0] : 4] : [], lit: !!cells };
    },
    readDays: () => ({}), readTools: () => ({}), readChromatic: () => ({}),
    scanLocated: (img, ref, gray, sharp, at, start, pre) => ({ ok: true, loc, warden: { cell: 1 }, cells: pre.board.cells, ...pre.panels })
  };
  const self = { navigator: { hardwareConcurrency: cores }, location: { search: '' }, TartarusScan: scan,
    TartarusScanTracker: { create: () => ({ locate: () => loc, panels: () => cached ? { doors: { cells: [7], hidden: [7], lit: true }, days: {}, tools: {}, chromatic: {} } : {}, remember() {}, info: () => ({ mode: 'full' }), reset() {} }) } };
  const context = vm.createContext({ self, importScripts() {}, setTimeout, clearTimeout, Date,
    Worker: class {
      postMessage(m) { queueMicrotask(() => this.onmessage({ data: { id: m.id, result: m.panel === 0 ? { doors: scan.readDoors(m.img, m.sharp, m.loc, {}, false, m.cells), days: {} } : m.panel === 1 ? { tools: {} } : { chromatic: {} } } })); }
      terminate() {}
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/scan-worker.js'), 'utf8') + '\nself.check = scanBoard;', context);
  await self.onmessage({ data: { configure: { parallel: true, tracking: true } } });
  assert.equal((await self.check({}, {})).doors.cells[0], 7);
  assert.ok(calls.some(c => c && c[0] === 7));
  actualCell = 9; cached = true; calls.length = 0;
  assert.equal((await self.check({}, {})).doors.cells[0], 9, 'Cached panel retained old lighting');
  assert.ok(calls.some(c => c && c[0] === 9));
  cached = false; hidden = false; calls.length = 0;
  await self.check({}, {});
  assert.equal(calls.length, 1, 'An ordinary English panel was unnecessarily read twice');
}
check(2).then(() => check(8)).then(() => console.log('PASS: hidden English numbers use fresh lit cells with serial/parallel helpers; panel reuse cannot retain old lighting; ordinary cards keep one pass.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
