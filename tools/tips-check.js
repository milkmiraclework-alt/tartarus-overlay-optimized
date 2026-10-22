#!/usr/bin/env node
/* Imported strategy notes and their cost in the hidden analyzer. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const T = require('../js/engine.js'), S = require('../js/solver.js'), tips = require('../js/tips.js');
for (const id of T.TOOL_IDS) assert.ok(tips.TOOL_NOTES[id], 'Missing note for ' + id);
for (const id of Object.keys(T.START_EVENTS)) assert.ok(tips.CONTRACT_NOTES[id], 'Missing contract note for ' + id);
assert.deepEqual(tips.notesFor([], 'none'), []);
const names = { ironlaw: 'Iron Law', maiden: 'Maiden', scapegoat: 'Scapegoat' };
assert.deepEqual(tips.notesFor(['maiden', 'scapegoat'], 'ironlaw', names).map(n => n.kind), ['contract', 'tool', 'tool', 'pair']);
assert.ok(tips.notesFor(['maul'], 'cagefight').some(n => n.kind === 'contract-tool'));
const source = fs.readFileSync(require.resolve('../js/analyze.js'), 'utf8').replace(/\r\n/g, '\n');
const init = '  buildBoard();\n  bind();\n  render();'; assert.ok(source.includes(init));
let calls = 0, writes = 0;
const box = { hidden: true }, list = { set innerHTML(value) { writes++; this.html = value; } };
const taskWindow = { Tartarus: T, TartarusSolver: S, TartarusDesktop: { fast: true },
  TartarusTips: { notesFor(...args) { calls++; return tips.notesFor(...args); } } };
vm.runInNewContext(source.replace(init, '  window.checkNotes = { renderPlayNotes, set: (tools, card) => { model.tools = tools; model.startEvent = card; }, visible: (v) => { desktopWindowVisible = v; } };'), {
  window: taskWindow, navigator: { hardwareConcurrency: 4 }, localStorage: { getItem: () => null },
  document: { currentScript: null, getElementById: id => id === 'az-play-notes' ? box : list }
});
const A = taskWindow.checkNotes; A.set(['maiden', 'scapegoat'], 'ironlaw');
A.renderPlayNotes(); assert.equal(calls, 0); assert.equal(writes, 0);
A.visible(true); A.renderPlayNotes(); assert.equal(calls, 1); assert.equal(box.hidden, false);
assert.ok(list.html.includes('Iron Law') && list.html.includes('before the Scapegoat'));
for (let i = 0; i < 100; i++) A.renderPlayNotes();
assert.equal(calls, 1); assert.equal(writes, 1, 'Unchanged settings rewrote the notes');
A.visible(false); A.set(['maul'], 'cagefight'); A.renderPlayNotes(); assert.equal(calls, 1);
A.visible(true); A.renderPlayNotes(); assert.equal(calls, 2); assert.ok(list.html.includes('With Cage Fight'));
A.set([], 'none'); A.renderPlayNotes(); assert.equal(box.hidden, true); assert.equal(list.html, '');
console.log('PASS: instrument/contract/pair notes, zero hidden rendering, unchanged notes reuse their DOM, visible changes refresh and empty selections clear.');
