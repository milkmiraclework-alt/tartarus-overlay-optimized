#!/usr/bin/env node
/* Exact-output regression checks for sharing the reader's blur pass.
 * node tools/scan-check.js [--baseline path/to/previous/scan.js]
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../js/scan.js');
const ref = require('../js/scan-data.js');
const at = process.argv.indexOf('--baseline');
const before = at < 0 ? null : require(path.resolve(process.argv[at + 1]));
function image(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const value = (i * 17 + (i / width | 0) * 13) % 251;
    data.set([value, value, value, 255], i * 4);
  }
  return { width, height, data };
}
function clean(result) { const copy = { ...result }; delete copy.ms; return copy; }
if (before) {
  for (let seed = 0; seed < 24; seed++) {
    const img = image(73 + seed, 51 + seed);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 1] = (img.data[i + 1] + seed * 19 + i) % 256;
      img.data[i + 2] = (img.data[i + 2] + seed * 31 + (i >> 5)) % 256;
    }
    const boxes = [[0, 0, img.width - 1, img.height - 1], [-3.4, 2.7, img.width + 5.1, img.height - 3.2], [5.5, -8, 54.4, 39.7], [20, 20, 18, 19], [0, 0, 2, 2]];
    for (const box of boxes) {
      const test = (x, y) => ((x * 13 + y * 29 + seed) % 17) < seed % 17;
      assert.deepEqual(S.blobs(img, ...box, test), before.blobs(img, ...box, test), 'component order or geometry changed');
      for (const r of [1, 3, 9]) for (const s of [0, 0.34, 1.01]) {
        const opts = { minH: 2, maxH: 30, r, s };
        assert.deepEqual(S.textLines(img, ...box, opts), before.textLines(img, ...box, opts), 'glyph grouping changed');
      }
    }
    assert.deepEqual(S.readObjectiveTitle(img), before.readObjectiveTitle(img), 'objective title changed');
  }
  console.log('PASS: exact connected components and text across color/contrast settings, fractional/clipped/empty boxes and 24 images.');
}
for (const [width, height] of [[640, 360], [1280, 720], [1920, 1080]]) {
  const img = image(width, height);
  const gray = S.grayOf(img);
  const sharp = S.blur(gray, width, height, 1);
  assert.deepEqual(S.locateBoard(img, gray, ref), S.locateBoard(img, gray, ref, sharp));
  if (before) {
    assert.deepEqual(gray, before.grayOf(img));
    assert.deepEqual(sharp, before.blur(gray, width, height, 1));
    assert.deepEqual(clean(S.scan(img, ref)), clean(before.scan(img, ref)));
  }
}
console.log('PASS: grayscale, blur, board location and complete reader output are unchanged at three resolutions.');
const framesAt = process.argv.indexOf('--frames');
if (framesAt >= 0) {
  const { performance } = require('node:perf_hooks');
  const folder = path.resolve(process.argv[framesAt + 1]);
  const fullRef = S.withPanelIcons(ref, require('../js/pick-data.js'));
  const files = fs.readdirSync(folder).filter((name) => name.endsWith('.rgba'));
  assert.ok(files.length, 'No RGBA fixtures found; each name.rgba needs name.json with width/height.');
  for (const name of files) {
    const metadata = JSON.parse(fs.readFileSync(path.join(folder, name.replace(/\.rgba$/, '.json')), 'utf8'));
    const img = { ...metadata, data: new Uint8ClampedArray(fs.readFileSync(path.join(folder, name))) };
    assert.equal(img.data.length, img.width * img.height * 4);
    if (before) assert.deepEqual(S.readObjectiveTitle(img), before.readObjectiveTitle(img), `Objective title changed for ${name}`);
    let expected;
    const times = { current: [], baseline: [] };
    const rounds = process.argv.includes('--bench') ? 4 : 1;
    for (let i = 0; i < rounds; i++) {
      const order = i % 2 ? [['baseline', before], ['current', S]] : [['current', S], ['baseline', before]];
      for (const [label, reader] of order) if (reader) {
        const start = performance.now();
        const result = reader.scan(img, fullRef);
        const elapsed = performance.now() - start;
        if (!expected) expected = clean(result);
        else assert.deepEqual(clean(result), expected, `Reader output changed for ${name}`);
        if (rounds === 1 || i) times[label].push(elapsed);
      }
    }
    const median = (values) => values.sort((a, b) => a - b)[values.length >> 1];
    const current = median(times.current), old = before && median(times.baseline);
    console.log(`PASS: exact reader output ${name} (${img.width}x${img.height}): ${current.toFixed(0)} ms${before ? `; baseline ${old.toFixed(0)} ms; ${(old / current).toFixed(2)}x faster` : ''}`);
  }
}
if (process.argv.includes('--bench')) {
  const { performance } = require('node:perf_hooks');
  const median = (list) => list.sort((a, b) => a - b)[list.length >> 1];
  for (const [width, height] of [[1920, 1080], [2600, 1462]]) {
    const gray = S.grayOf(image(width, height));
    const times = { current: [], baseline: [] };
    for (let i = 0; i < 8; i++) {
      const order = i % 2 ? [['baseline', before], ['current', S]] : [['current', S], ['baseline', before]];
      for (const [name, scan] of order) if (scan) {
        const start = performance.now(); scan.blur(gray, width, height, 1);
        if (i) times[name].push(performance.now() - start);
      }
    }
    const current = median(times.current), old = before && median(times.baseline);
    console.log(`blur ${width}x${height}: ${current.toFixed(1)} ms${before ? `; baseline ${old.toFixed(1)} ms; ${(old / current).toFixed(2)}x faster` : ''}`);
  }
}
