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
vm.runInNewContext(source.replace(init, '  window.checkImported = { blankModel, scanToModel, buildState, forecastModels, modelFrom };'), {
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
const ambiguous = A.scanToModel({ ...picture, badge: { id: null, alike: ['tyranny', 'cagefight'] } }, base);
assert.equal(ambiguous.model.startEvent, 'none', 'An ambiguous badge guessed a contract');
assert.ok(ambiguous.notes.some(note => /Tyranny or Cage Fight/.test(note)), 'Ambiguous contracts did not explain the manual choice');
assert.equal(A.scanToModel({ ...picture, badge: { id: null, alike: ['tyranny', 'cagefight'] } }, { ...base, startEvent: 'opulence' }).model.startEvent, 'opulence');
const scan = require('../js/scan.js'), pick = require('../js/pick-data.js'), extra = require('./panel-samples.json');
assert.ok(pick.badges.some(b => b.id === 'cagefight'));
assert.ok(pick.badges.some(b => b.id === 'opulence'));
assert.ok(!pick.badges.some(b => b.id === 'tyranny'), 'The mislabeled Cage Fight sample is still registered as Tyranny');
assert.deepEqual(pick.icons.filter(i => i.from === 'confirmed-panel'), extra.icons, 'Confirmed local icon references were lost');
const img = { width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4) };
for (let i = 0; i < img.data.length; i += 4) img.data.set([90 + i % 120, 100 + (i >> 5) % 140, 110, 255], i);
const label = { x0: 30, x1: 54.4, y1: 20 };
const feat = scan.artFeature(img, ...scan.badgeBox(label, true));
const readBadge = badges => scan.readBadge(img, label, { badges });
assert.equal(readBadge([{ id: 'cagefight', feat }]).id, 'cagefight');
assert.equal(readBadge([{ id: 'cagefight', feat }, { id: 'cagefight', feat }]).id, 'cagefight', 'Two samples of one contract were treated as different contracts');
const tied = readBadge([{ id: 'tyranny', feat }, { id: 'cagefight', feat }]);
assert.equal(tied.id, null); assert.deepEqual(tied.alike, ['tyranny', 'cagefight']);
assert.equal(readBadge([]).id, null);
console.log('PASS: ambiguous badges stay unset, duplicate samples of one card remain valid, mislabeled Tyranny reference removed and confirmed local icons retained.');
// October 20: a meal selection must keep the actual framed subset, including
// when the previous board has another legally edible inmate.
const mealBase = A.blankModel(); mealBase.step = 'manage'; mealBase.warden = 1;
for (const [n, beast] of [[1, 'mammoth'], [2, 'lion'], [3, 'wolf']]) mealBase.cells[n] = { kind: 'inmate', beast, tier: 0 };
mealBase.tools = ['crown']; mealBase.toolsConfirmed = { tools: 'crown', slots: 2 };
const mealPicture = { ...picture, decision: null, chain: { targets: [2] },
  cells: picture.cells.map(c => c.n === 1 ? { ...c, beast: 'mammoth' } : c.n === 2 ? { ...c, beast: 'lion', prey: false } : c.n === 3 ? { ...c, beast: 'wolf' } : c) };
const mealModel = A.scanToModel(mealPicture, mealBase).model, meal = A.buildState(mealModel).st;
assert.equal(JSON.stringify(meal.used.mealOnly), '[2]');
assert.equal(JSON.stringify(T.startOptions(meal).map(o => o.cell)), '[2]');
assert.equal(mealModel.toolsConfirmed.tools, 'crown', 'A meal screen forgot the confirmed instruments');
assert.equal(T.devour(meal, 1, 3).ok, false, 'A consume accepted an unframed meal');
assert.ok(T.devour(meal, 1, 2).ok); assert.equal(meal.used.mealOnly, null, 'A bite retained the old menu restriction');
const chain = board([], 3); chain.cells[1].inmate.beast = 'mammoth'; chain.cells[2].inmate.beast = 'lion'; chain.cells[3].inmate.beast = 'wolf';
chain.used.devour = 1; chain.chaining = { eater: chain.cells[1].inmate.id, at: 0, bites: [] }; chain.used.mealOnly = [2];
assert.deepEqual(T.chainOptions(chain).map(o => o.cell), [2]);
assert.ok(S.candidates(chain).filter(o => o.action.type === 'chain').every(o => o.action.to === 2));
assert.equal(T.chainBite(chain, 3).ok, false);
assert.equal(JSON.stringify(A.modelFrom(chain).mealOnly), '[2]');
assert.equal(JSON.stringify(A.forecastModels(chain, mealBase)[0].mealOnly), '[2]', 'Forecast conversion lost the framed menu');
const otherMenu = S.clone(chain); otherMenu.used.mealOnly = [3];
assert.notEqual(F.visibleKey(chain), F.visibleKey(otherMenu), 'Forecast merged different meal menus');
assert.ok(T.chainBite(chain, 2).ok); assert.equal(chain.used.mealOnly, null);
assert.equal(A.scanToModel({ ...picture, decision: { title: true, consume: true, end: true } }, mealModel).model.mealOnly, null, 'Ordinary decision cards retained the previous meal restriction');
console.log('PASS: framed meals reach the reader, engine, saved model and forecasts; unframed bites fail and a successful bite clears the menu.');
// The Maiden must inspect the OLD inmate and the block BEFORE Scapegoat.
function maidenSwap(tiers, scapegoat) {
  const st = board(['maiden', ...(scapegoat ? ['scapegoat'] : [])], tiers.length);
  st.params.swapWeights = [0, 0, 1, 0, 0];
  tiers.forEach((tier, i) => { st.cells[i + 1].inmate.tier = tier; });
  const level = tiers.slice(1).filter(t => t > tiers[0]).length === tiers.slice(1).filter(t => t < tiers[0]).length;
  if (scapegoat && tiers.length >= 3) {
    const ctx = S.context(st), expectedLoss = 2 * tiers.slice(1).reduce((sum, tier) => sum + ctx.v[tier], 0) / (tiers.length - 1);
    assert.equal(ctx.scapegoat.loss, expectedLoss, 'Scapegoat loss counted the inmate being replaced');
  }
  assert.ok(T.swap(st).ok);
  assert.equal(st.log.some(e => e.x && e.x.type === 'maiden'), level);
  assert.equal(st.cells[1].inmate ? st.cells[1].inmate.tier : st.vault.length ? T.RAINBOW : -1, level ? T.RAINBOW : 2);
}
for (const scapegoat of [false, true]) for (const tiers of [[0, 2, 2], [1, 0, 2], [0], [0, 0, 2, 2, 4]]) maidenSwap(tiers, scapegoat);
assert.equal(T.DEFAULT_PARAMS.beastToolOdds, 12);
assert.equal(T.BEAST_TOOLS.length, 8);
for (const id of T.TOOL_IDS) assert.equal(T.toolWeight(null, id), T.BEAST_TOOLS.includes(id) ? 0.12 : 1);
for (let seed = 0; seed < 48; seed++) {
  const st = T.newGame({ seed: 'WEIGHTED-OFFER-' + seed, params: { beastToolOdds: 0 } });
  assert.ok(st.pending[0].options.every(id => !T.BEAST_TOOLS.includes(id)));
  st.pending[0].rerolls = 1; assert.ok(T.rerollOffer(st).ok);
  assert.ok(st.pending[0].options.every(id => !T.BEAST_TOOLS.includes(id)));
}
for (const [beastToolOdds, expected] of [[12, { type: 'choose', id: 'coin' }], [100, { type: 'reroll' }]]) {
  const st = T.newGame({ seed: 'WEIGHTED-REROLL', params: { beastToolOdds } });
  st.pending = [{ kind: 'tool', options: ['coin', 'keys', 'fire'], rerolls: 1 }];
  assert.deepEqual(S.decide(st), expected, 'Re-roll advice ignored the instrument odds');
}
console.log('PASS: Maiden checks the replaced inmate before removals, Scapegoat values only other inmates, weighted start/re-roll offers and Coin advice.');
function huntEndgame(daysLeft) {
  const st = board(['trap'], 2);
  st.params.rewards = false; st.day = st.maxDays - daysLeft;
  st.cells[1].inmate.beast = 'lion'; st.cells[2].inmate.beast = 'wolf';
  st.cells[1].inmate.tier = st.cells[2].inmate.tier = T.SUPREME;
  return st;
}
const finalHunt = huntEndgame(0), finalAction = S.decide(finalHunt);
assert.deepEqual(finalAction, { type: 'devour', to: 2 }, 'Last-day Hunt beat a Rainbow available now');
assert.ok(S.apply(finalHunt, finalAction).ok); assert.equal(finalHunt.vault.length, 1);
assert.deepEqual(S.decide(huntEndgame(15)), { type: 'hunt', to: 2 }, 'An early Hunt lost the value of its remaining mornings');
const expiringPrey = huntEndgame(1); assert.ok(T.hunt(expiringPrey, 2).ok);
expiringPrey.used.hunt = false; expiringPrey.day = expiringPrey.maxDays;
assert.deepEqual(S.decide(expiringPrey), { type: 'devour', to: 2 }, 'An expired future Prey gain prevented a last-day Rainbow');
console.log('PASS: last-day Hunt cannot outrank an immediate Rainbow, early Hunt remains useful, and breaking a mark values only the mornings left.');
const baselineAt = process.argv.indexOf('--baseline');
if (baselineAt >= 0) {
  const path = require('node:path'), baselinePath = path.resolve(process.argv[baselineAt + 1]);
  const savedEngine = globalThis.Tartarus, savedSolver = globalThis.TartarusSolver;
  let previous;
  try { globalThis.Tartarus = require(path.join(path.dirname(baselinePath), 'engine.js')); previous = require(baselinePath); }
  finally { globalThis.Tartarus = savedEngine; globalThis.TartarusSolver = savedSolver; }
  const cases = [];
  for (const chaining of [false, true]) {
    const st = board([], 3); st.cells[2].inmate.beast = 'lion'; st.used.mealOnly = [2];
    if (chaining) { st.used.devour = 1; st.chaining = { eater: st.cells[1].inmate.id, at: 0, bites: [] }; }
    cases.push(st);
  }
  for (const tools of [['maiden'], ['maiden', 'scapegoat']]) for (const tiers of [[0, 2, 2], [1, 0, 2]]) {
    const st = board(tools, tiers.length); tiers.forEach((tier, i) => { st.cells[i + 1].inmate.tier = tier; }); cases.push(st);
  }
  for (const beastToolOdds of [0, 12, 100]) {
    const st = T.newGame({ seed: 'IMPORT-REROLL', params: { ...noEvents, beastToolOdds } });
    st.pending = [{ kind: 'tool', options: ['coin', 'keys', 'fire'], rerolls: 1 }]; cases.push(st);
  }
  const json = value => JSON.stringify(value, (key, v) => (key === 'pass' || key === 'points') && v === 0 ? undefined : v);
  const finish = (solver, state, stream) => {
    const job = solver.solve(state, { seed: 7919, rollouts: 16, stream }); let result;
    do { result = job.step(8); } while (!result.done);
    return json({ result, rows: job.rows });
  };
  for (const st of cases) st.maxDays = st.day + 2;
  for (const daysLeft of [0, 1, 15]) cases.push(huntEndgame(daysLeft));
  for (const st of cases) {
    assert.equal(json(S.candidates(st)), json(previous.candidates(st)), 'Imported rule candidates differ from upstream');
    for (const stream of [0, 1]) assert.equal(finish(S, st, stream), finish(previous, st, stream), 'Imported rule samples/ranking differ from upstream');
  }
  console.log(`PASS: ${cases.length} targeted Hunt, Maiden/Scapegoat, framed-meal and weighted re-roll positions match upstream candidates and every Monte Carlo sample on two streams.`);
}
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
