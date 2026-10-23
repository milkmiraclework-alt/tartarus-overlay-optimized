#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), os = require('node:os');
const T = require('../js/engine.js'), S = require('../js/solver.js'), R = require('../js/rust-solver.js');
const run = require('./rust-solver-browser-check.js');
(async () => {
  const core = await R.fromBytes(fs.readFileSync(require('node:path').resolve(__dirname, '../js/solver-core.wasm')));
  const report = { node: process.version, cpu: os.cpus()[0].model, ...await run({ T, S, R, core }) };
  fs.mkdirSync('sandbox/rust-solver-bench', { recursive: true });
  fs.writeFileSync('sandbox/rust-solver-bench/node-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
