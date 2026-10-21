#!/usr/bin/env node
/* Collector failure/restart behavior, with local fixtures and no network. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const file = require.resolve('./live-data.js'), source = fs.readFileSync(file, 'utf8');
const folder = fs.mkdtempSync(path.resolve(__dirname, '../sandbox/live-data-check-'));
function collector(dir, respond, failMeasure = false) {
  const mod = { exports: {} }, calls = [], messages = [];
  const context = vm.createContext({ module: mod, require: createRequire(file), __dirname: path.dirname(file),
    process: { argv: ['node', file, 'pull', '--dir', dir, '--url', 'https://collector.test', '--token', 'test-only'], env: {} },
    console: { log: message => messages.push(message) },
    fetch: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      const query = new URL(url).searchParams;
      const call = { after: Number(query.get('after')), limit: Number(query.get('limit')) }; calls.push(call);
      return respond(call, calls.length);
    }
  });
  const marker = 'module.exports = { measure, observe, pairsOf, print };';
  assert.ok(source.includes(marker));
  vm.runInContext(source.replace(marker, marker + '\nmodule.exports.pull = pull;'), context);
  if (failMeasure) vm.runInContext('rates = () => { throw Error("Controlled rates failure"); };', context);
  return { pull: mod.exports.pull, calls, messages };
}
const response = (status, rows = [], last = 0) => ({ status, ok: status === 200, json: async () => ({ rows, last }) });
async function main() {
  const dir = path.join(folder, 'partial');
  const firstRows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, received: '2026-10-21' }));
  const first = collector(dir, (_, n) => n === 4 ? response(200, firstRows, 25) : response(503));
  await assert.rejects(first.pull(), /HTTP 503/);
  assert.deepEqual(first.calls.map(c => c.limit), [200, 100, 50, 25, 25]);
  assert.equal(first.calls.at(-1).after, 25);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).last, 25);
  assert.equal(fs.readFileSync(path.join(dir, 'raw/2026-10-21.jsonl'), 'utf8').trim().split('\n').length, 25);
  const second = collector(dir, () => response(200, [{ id: 26, received: '2026-10-21' }], 26), true);
  await second.pull();
  assert.deepEqual(second.calls, [{ after: 25, limit: 200 }]);
  assert.ok(second.messages.some(m => m.includes('Controlled rates failure')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).last, 26);
  const ids = fs.readFileSync(path.join(dir, 'raw/2026-10-21.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).id);
  assert.deepEqual(ids, Array.from({ length: 26 }, (_, i) => i + 1));
  const denied = collector(path.join(folder, 'denied'), () => response(401));
  await assert.rejects(denied.pull(), /HTTP 401/); assert.equal(denied.calls.length, 1);
  assert.equal(fs.existsSync(path.join(folder, 'denied/state.json')), false);
  console.log('PASS: 503 pages halve to 25, partial boards/cursor survive failure, restart resumes without duplicates, rates failure preserves new boards and 401 stops immediately.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
