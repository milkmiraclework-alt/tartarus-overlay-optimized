/* A separate cheap screen probe never blocks a full board read. */
'use strict';
importScripts(`scan.js${self.location.search}`, `scan-data.js${self.location.search}`, `frame-readiness.js${self.location.search}`);
importScripts(`scan-accelerator.js${self.location.search}`);
const accelerationReady = self.TartarusScanAccelerator.load(`scan-kernels.wasm${self.location.search}`);
const detector = self.TartarusFrameReadiness.create({ visualOnly: true });
let canvas = null, context = null, checkedEpoch = null, retryAt = 0;
// Keep this tiny target accelerated: a software target can read the entire
// GPU-backed game bitmap back for each individual source pixel.
const samples = new OffscreenCanvas(32, 48), sampleContext = samples.getContext('2d', { willReadFrequently: false });
self.onmessage = async ({ data }) => {
  if ('calibrate' in data) { detector.calibrate(data.calibrate); checkedEpoch = null; retryAt = 0; return; }
  const { id, bitmap, epoch } = data;
  const started = performance.now();
  try {
    const S = self.TartarusScan, C = detector.calibration;
    if (!C || !C.controls || bitmap.width !== C.width || bitmap.height !== C.height) { self.postMessage({ id, ready: false }); return; }
    let img;
    const pixels = () => {
      if (!img) {
        if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          context = canvas.getContext('2d', { willReadFrequently: true });
        }
        context.drawImage(bitmap, 0, 0);
        img = context.getImageData(0, 0, canvas.width, canvas.height);
      }
      return img;
    };
    const sample = self.TartarusFrameReadiness.sampleBitmap(bitmap, C.loc, S, sampleContext)
      || self.TartarusFrameReadiness.sample(pixels(), C.loc, S);
    const stable = detector.observe({ epoch, time: performance.now(), valid: true, sample });
    if (checkedEpoch !== epoch) { checkedEpoch = epoch; retryAt = 0; }
    if (!stable || performance.now() < retryAt) {
      self.postMessage({ id, ready: false, probe: { stage: 'visual', ms: performance.now() - started } }); return;
    }
    // Only a changed, stable screen pays for semantic recognition. Incomplete
    // menus are retried at most four times per second, within the capture burst.
    await accelerationReady;
    if (detector.calibration !== C) { self.postMessage({ id, ready: false }); return; }
    pixels();
    const gray = S.grayOf(img), sharp = S.blur(gray, img.width, img.height, 1);
    const prepared = S.prepareBoardSearch(img, gray, self.TARTARUS_SCAN, sharp, 1);
    const fit = S.scoreBoardAt(prepared, C.loc);
    let controls = '', board = null, doors = null, decision = null;
    const valid = fit.score >= 0.82 && fit.quarters.every((score) => score >= 0.68);
    if (valid) {
      doors = S.readDoors(img, sharp, C.loc, self.TARTARUS_SCAN);
      decision = doors && doors.conf >= 0.85 ? null : S.readDecision(img, C.loc);
      if (doors && doors.conf >= 0.85 || decision && decision.title) {
        board = S.readBoardCells(img, sharp, C.loc, self.TARTARUS_SCAN);
        controls = self.TartarusFrameReadiness.controlsFor({ ...board, doors, decision });
      }
    }
    const ready = valid && !!controls && controls !== C.controls;
    if (!ready) retryAt = performance.now() + 250;
    // The accepted bitmap is immutable. Hand its already-read controls
    // and cells to the final reader, rather than recognise them twice.
    const handoff = ready ? { width: img.width, height: img.height, loc: { ...C.loc, score: fit.score }, board, doors,
      days: S.readDays(img, sharp, C.loc, self.TARTARUS_SCAN), decision } : null;
    self.postMessage({ id, ready, prepared: handoff, probe: { stage: 'semantic', ms: performance.now() - started } });
  } catch { self.postMessage({ id, ready: false }); }
  finally { bitmap.close(); }
};
