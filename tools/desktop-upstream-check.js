#!/usr/bin/env node
/* Newest active log selection and native game-window identity, without
 * opening user processes or touching the real game/profile. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../desktop/main.js'), 'utf8').replace(/\r\n/g, '\n');
const statOf = p => { try { return fs.statSync(p); } catch { return null; } };
const folder = fs.mkdtempSync(path.resolve(__dirname, '../sandbox/desktop-upstream-check-'));
const logs = path.join(folder, 'Torchlight Infinite/UE_game/TorchLight/Saved/Logs'); fs.mkdirSync(logs, { recursive: true });
const now = Date.now();
const file = (name, age) => { const p = path.join(logs, name); fs.writeFileSync(p, 'test'); fs.utimesSync(p, new Date(now - age), new Date(now - age)); return p; };
const chosen = file('UE_game.log', 180000), active = file('UE_game_2.log', 1000);
file('UE_game_backup.log', 0); // Never follow an archive because it is newer.
const context = vm.createContext({ fs, path, statOf, process: { env: {} }, Date: { now: () => now },
  settings: { logPath: chosen }, logPath: chosen, LOG_OVERRIDE: '', logFoundBy: '', game: { running: true, hwnd: 11 }, gameSince: now - 180000,
  win32: { programOf: () => path.join(folder, 'Torchlight Infinite/UE_game/Binaries/Win64/torchlight.exe') } });
const begin = source.indexOf('const virtualStore ='), end = source.indexOf('// #endregion', begin);
assert.ok(begin >= 0 && end > begin);
vm.runInContext(source.slice(begin, end), context);
const nativeStart = source.indexOf('findWindow(re, known) {'), nativeEnd = source.indexOf('// Where the program behind a window is:', nativeStart);
assert.ok(nativeStart >= 0 && nativeEnd > nativeStart);
const windows = [
  { hwnd: 21, title: 'Torchlight: Infinite', area: 100, pid: 1 },
  { hwnd: 22, title: 'Torchlight: Infinite', area: 2000, pid: 1 },
  { hwnd: 23, title: 'Other application', area: 9000, pid: 1 },
  { hwnd: 24, title: 'Torchlight: Infinite', area: 5000, pid: 9 }
];
const get = h => windows.find(w => w.hwnd === h);
let minimized = 0;
const native = vm.runInNewContext('({' + source.slice(nativeStart, nativeEnd) + '})', {
  Buffer, process: { pid: 9 }, TEST: false, visible: h => !!get(h), iconic: h => h === minimized,
  windowText: (h, buffer) => { buffer.write(get(h).title, 'utf16le'); return get(h).title.length; },
  windowPid: (h, out) => { out[0] = get(h).pid; },
  nextWindow: (_, after) => windows[windows.findIndex(w => w.hwnd === after) + 1]?.hwnd || 0,
  rect: (h, out) => { Object.assign(out, { left: 0, top: 0, right: get(h).area, bottom: 1 }); return true; }
});
assert.equal(native.findWindow(/Torchlight/, 21).hwnd, 22, 'A known launcher beat the larger game window');
minimized = 22; assert.equal(native.findWindow(/Torchlight/, 22).hwnd, 22, 'A minimized game lost its identity');
minimized = 0; windows[0].area = 2000; assert.equal(native.findWindow(/Torchlight/, 21).hwnd, 21, 'An equal-size known window was discarded');
console.log('PASS: largest matching native window, minimized identity, stable ties and own/unrelated window exclusion.');
const shareStart = source.indexOf('let s = game.hwnd ?', source.indexOf('function allowCapture()'));
const shareEnd = source.indexOf('callback(s ? { video: s } : {});', shareStart);
assert.ok(shareStart >= 0 && shareEnd > shareStart);
const sharing = vm.createContext({ game: { running: true, hwnd: 22, title: 'Torchlight: Infinite' }, GAME_TITLE: /Torchlight/, note() {}, sources: [] });
const selectShare = source.slice(shareStart, shareEnd) + '\ns;';
sharing.sources = [{ id: 'window:21:0', name: 'Torchlight: Infinite' }, { id: 'window:22:0', name: 'Torchlight: Infinite' }];
assert.equal(vm.runInContext(selectShare.replace('let s =', 'var s ='), sharing).id, 'window:22:0');
sharing.sources.pop();
assert.equal(vm.runInContext(selectShare.replace('let s =', 'var s ='), sharing).id, 'window:22:0', 'An unlisted real game fell back to the listed launcher');
console.log('PASS: sharing follows the selected game HWND even when only its same-title launcher is listed.');
(async () => {
  assert.equal(vm.runInContext('newestLog([settings.logPath.replace(/[^\\\\/]+$/, "")]).p', context), active);
  assert.equal(vm.runInContext('logStale()', context), true);
  assert.equal(await vm.runInContext('findLog()', context), active, 'A stale chosen log did not yield to UE_game_2.log');
  fs.utimesSync(chosen, new Date(now), new Date(now));
  assert.equal(await vm.runInContext('findLog()', context), chosen, 'An actively written player choice was overridden');
  fs.utimesSync(chosen, new Date(now - 180000), new Date(now - 180000));
  context.LOG_OVERRIDE = chosen;
  assert.equal(await vm.runInContext('findLog()', context), chosen, 'Explicit test/launch override was ignored');
  context.LOG_OVERRIDE = ''; context.game.running = false;
  assert.equal(vm.runInContext('logStale()', context), false);
  assert.equal(await vm.runInContext('findLog()', context), chosen, 'An idle game changed the chosen log');
  console.log('PASS: active numbered log, archive exclusion, stale/fresh chosen paths, explicit override and inactive game.');
})().catch(error => { console.error(error); process.exitCode = 1; });
