#!/usr/bin/env node
/* Exact RGB classification and connected components for board markers. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('../js/scan.js');
// Expose private helpers only in this isolated test copy.
const source = fs.readFileSync(require.resolve('../js/scan.js'), 'utf8')
  .replace('  api.scoreBoardAt =', '  api.warmPixel = warmPixel; api.warmBlobs = warmBlobs;\n  api.scoreBoardAt =');
const tested = new Function('window', 'module', source + ';return module.exports;')({}, { exports: {} });
function matches(r, g, b, gold) {
  const [h, s, v] = S.hsv(r, g, b);
  return gold ? h >= 32 && h <= 56 && s > 0.38 && s < 0.9 && v > 0.5 : h >= 18 && h <= 46 && s > 0.6 && v > 0.55;
}
for (let r = 0; r < 256; r++) for (let g = 0; g < 256; g++) for (let b = 0; b < 256; b++) {
  const [h, s, v] = S.hsv(r, g, b);
  const gold = h >= 32 && h <= 56 && s > 0.38 && s < 0.9 && v > 0.5;
  const orange = h >= 18 && h <= 46 && s > 0.6 && v > 0.55;
  if (tested.warmPixel(r, g, b, true) !== gold || tested.warmPixel(r, g, b, false) !== orange) {
    assert.fail(`Marker classification changed for RGB ${r},${g},${b}`);
  }
}
console.log('PASS: both marker masks match HSV thresholds for all 16,777,216 RGB colors.');
for (let seed = 0; seed < 24; seed++) {
  const width = 73 + seed, height = 51 + seed, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i * 31 + seed * 13) % 256;
    data[i + 1] = (i * 17 + seed * 29) % 256;
    data[i + 2] = (i * 7 + seed * 47) % 256;
    data[i + 3] = 255;
  }
  const img = { width, height, data };
  for (const box of [[0, 0, width - 1, height - 1], [-3.4, 2.7, width + 5.1, height - 3.2], [5.5, -8, 54.4, 39.7], [20, 20, 18, 19], [width + 5, 0, width + 9, 10]]) {
    for (const gold of [true, false]) {
      const expected = S.blobs(img, ...box, (x, y) => {
        const offset = (y * width + x) * 4;
        return matches(data[offset], data[offset + 1], data[offset + 2], gold);
      });
      assert.deepEqual(tested.warmBlobs(img, ...box, gold), expected);
    }
  }
}
console.log('PASS: exact marker component order and geometry on 24 images, including fractional, clipped and empty regions.');
