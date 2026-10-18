#!/usr/bin/env node
/* Imported live rules and read-only upstream update detection. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const T = require('../js/engine.js'), S = require('../js/solver.js');
const updates = require('../desktop/lib/upstream-updates.js');
const version = require('../desktop/lib/upstream-version.json');
const noEvents = { eventStartChance: 0, eventMorningChance: 0, eventWalkChance: 0, eventActionChance: 0 };
function board(tools = [], count = 2, startEvent) {
  const st = T.newGame({ seed: 'UPSTREAM-RULES', startEvent, params: { ...noEvents, rewards: true } });
  st.pending = []; st.phase = 'manage'; st.position = 1;
  for (let n = 1; n <= count; n++) T.editCell(st, n, { kind: 'open', beast: n === 1 ? 'mammoth' : 'wolf', tier: 0 });
  for (const tool of tools) T.addTool(st, tool);
  return st;
}
assert.equal(T.DEFAULT_PARAMS.doubleEatTier, 0);
for (const [eater, meal] of [['mammoth', 'wolf'], ['lion', 'rat']]) {
  assert.ok(T.canEat(board(), { id: 1, beast: eater, tier: 0 }, { id: 2, beast: meal, tier: 0 }));
}
const four = board(['muzzle'], 4), five = board(['muzzle'], 5);
assert.equal(T.gainFor(four, 1, { cell: 2 }).gain, 3);
assert.equal(T.gainFor(five, 1, { cell: 2 }).gain, 1, 'Muzzle counted after the meal instead of before it');
const capped = board([], 2); capped.vault = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, beast: 'wolf' }));
capped.cells[1].inmate.tier = 4; capped.cells[2].inmate.tier = 4;
assert.ok(T.devour(capped, 1, 2).ok);
assert.equal(capped.vault.length, 10); assert.equal(capped.cells[1].inmate.tier, 4);
const rich = board([], 2, 'opulence'); rich.cells[1].inmate.tier = 4; rich.cells[2].inmate.tier = 4;
assert.ok(T.devour(rich, 1, 2).ok); assert.equal(rich.pending.filter((p) => p.kind === 'gift').length, 3);
const hunt = board(['trap'], 2); hunt.cells[1].inmate.beast = 'lion'; hunt.cells[2].inmate.beast = 'rat';
assert.ok(T.canHuntNow(hunt)); assert.ok(S.candidates(hunt).some((o) => o.action.type === 'hunt'));
hunt.used.noHunt = true; assert.ok(!S.candidates(hunt).some((o) => o.action.type === 'hunt'));
hunt.used.noHunt = false; assert.ok(T.hunt(hunt, 2).ok); assert.ok(!T.canSwapNow(hunt) && !T.canDevourNow(hunt));
const events = board([], 3); events.phase = 'office'; events.position = 0;
assert.equal(T.instigateCount(events), 2);
assert.ok(T.officeAct(events, 'instigate').ok); assert.equal(events.cells.filter((c) => c.event).length, 2);
assert.equal(T.instigateCount(events), 1);
const open = board([], 15); open.phase = 'office'; open.position = 0;
assert.ok(T.officeAct(open, 'instigate').ok); assert.equal(open.cells.filter((c) => c.event).length, 2, 'Instigate ignored open cells');
const portion = board([], 15); portion.phase = 'event'; portion.event = { kind: 'portion', cell: 1 };
assert.ok(T.resolveEvent(portion, true).ok); assert.equal(portion.cells.filter((c) => c.inmate?.tier === 1).length, 3);
const usurp = board([], 15); usurp.phase = 'event'; usurp.event = { kind: 'usurp1', cell: 1 }; usurp.eventPool = ['usurp1'];
assert.ok(T.resolveEvent(usurp, true).ok); assert.ok(usurp.cells.some((c) => c.event === 'usurp2'), 'Next Usurpation was lost on an all-open board');
console.log('PASS: second meals, Muzzle, vault cap, Opulence, Hunt, Instigate on open cells, Extra Portion and successive Usurpations.');
// 0.2.18 restrictions must reach the fast solver as well as the full UI.
const marked = board(['trap'], 3);
marked.cells[1].inmate.beast = 'lion';
marked.cells[2].inmate.beast = marked.cells[3].inmate.beast = 'rat';
marked.cells[2].inmate.marked = true;
assert.deepEqual(T.huntTargets(marked), [3], 'An already marked inmate was offered for Hunt');
marked.used.huntOnly = [2];
assert.deepEqual(T.huntTargets(marked), [2], 'The game-framed pick was ignored');
const office = board(); office.phase = 'office'; office.position = 0; office.used.officeOnly = 'bestow';
assert.deepEqual(S.candidates(office).map(o => o.action.choice), ['bestow']);
assert.equal(S.decide(office).choice, 'bestow');
assert.equal(T.officeAct(office, 'instigate').ok, false);
const taskWindow = { Tartarus: T, TartarusSolver: S };
const init = '  buildBoard();\n  bind();\n  render();';
const source = fs.readFileSync(require.resolve('../js/analyze.js'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(source.includes(init));
vm.runInNewContext(source.replace(init, '  window.checkImported = { blankModel, scanToModel, buildState, forecastModels };'), {
  window: taskWindow, document: { currentScript: null }, navigator: { hardwareConcurrency: 4 }, localStorage: { getItem: () => null }
});
const A = taskWindow.checkImported, base = A.blankModel(); base.tools = ['trap'];
const picture = {
  cells: Array.from({ length: 16 }, (_, n) => n === 0 ? { n, kind: 'office', conf: 1 } : n <= 3
    ? { n, kind: 'inmate', beast: n === 1 ? 'lion' : 'rat', tier: 0, conf: 1, prey: n === 2 } : { n, kind: 'locked', conf: 1 }),
  days: { days: 19 }, warden: { cell: 1, conf: 1 }, tools: { tools: [] }, chromatic: { count: 0 }, decision: { title: true, ratway: true, framed: [3] }
};
const huntRead = A.scanToModel(picture, base).model;
assert.equal(huntRead.step, 'manage'); assert.equal(huntRead.cells[2].marked, true);
assert.equal(JSON.stringify(huntRead.huntOnly), '[3]');
assert.equal(JSON.stringify(T.huntTargets(A.buildState(huntRead).st)), '[3]');
const only = A.scanToModel({ ...picture, warden: { cell: 0, conf: 1 }, decision: { office: true, bestow: true, instigate: false } }, base).model;
assert.equal(only.officeOnly, 'bestow'); assert.equal(A.buildState(only).st.used.officeOnly, 'bestow');
const hiddenDoor = { ...picture, decision: null, doors: { cells: [7], hidden: [7], conf: 0.9 } };
assert.equal(A.scanToModel(hiddenDoor, base).checks.has(7), true, 'An unresolved covered door was not marked Check');
assert.equal(A.scanToModel({ ...hiddenDoor, doors: { ...hiddenDoor.doors, lit: true } }, base).checks.has(7), false, 'A door settled by lit cells stayed marked Check');
const badge = { ...picture, badge: { id: 'cagefight' } };
assert.equal(A.scanToModel(badge, base).model.startEvent, 'cagefight');
assert.equal(A.scanToModel(badge, { ...base, startEvent: 'tyranny' }).model.startEvent, 'tyranny', 'A badge overrode a known start card');
assert.equal(A.forecastModels(office, base)[0].officeOnly, 'bestow', 'Forecast conversion dropped the office restriction');
assert.equal(JSON.stringify(A.forecastModels(marked, base)[0].huntOnly), '[2]', 'Forecast conversion dropped Hunt framing');
const F = require('../js/solver-forecast.js');
const unmarked = S.clone(marked); unmarked.cells[2].inmate.marked = false;
assert.notEqual(F.visibleKey(marked), F.visibleKey(unmarked));
console.log('PASS: Prey marks, framed Hunt targets, one-card office choices, covered doors, protected start cards and reader/solver/forecast conversions.');
(async () => {
  let calls = 0;
  const fetch = (data, ok = true) => async (url, options) => {
    calls++; assert.equal(url, 'https://api.github.com/repos/blahdot3h/tartarus-simulator/commits/main');
    assert.equal(options.method, undefined); // Only a read, never a mutation.
    return { ok, status: ok ? 200 : 503, json: async () => data };
  };
  assert.equal(await updates.check(fetch({ sha: version.commit }), version.commit), null);
  const next = 'a'.repeat(40), result = await updates.check(fetch({ sha: next, commit: { message: 'New fix\nDetails' } }), version.commit);
  assert.equal(result.commit, next); assert.equal(result.title, 'New fix'); assert.ok(result.url.endsWith(`${version.commit}...${next}`));
  await assert.rejects(updates.check(fetch({ sha: 'malformed' }), version.commit), /Invalid/);
  await assert.rejects(updates.check(fetch({}, false), version.commit), /503/);
  assert.equal(calls, 4);
  console.log('PASS: current/new/invalid/offline update responses; notices use read-only requests and compare the pinned author revision.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
