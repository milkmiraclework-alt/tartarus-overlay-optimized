/* A separate cheap screen probe never blocks a full board read. */
'use strict';
importScripts(`scan.js${self.location.search}`, `scan-data.js${self.location.search}`, `frame-readiness.js${self.location.search}`);
importScripts(`scan-accelerator.js${self.location.search}`);
const accelerationReady = self.TartarusScanAccelerator.load(`scan-kernels.wasm${self.location.search}`);
const detector = self.TartarusFrameReadiness.create();
self.onmessage = async ({ data }) => {
  if ('calibrate' in data) { detector.calibrate(data.calibrate); return; }
  const { id, bitmap, epoch } = data;
  try {
    await accelerationReady;
    const S = self.TartarusScan, C = detector.calibration;
    if (!C || !C.controls || bitmap.width !== C.width || bitmap.height !== C.height) { self.postMessage({ id, ready: false }); return; }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const img = context.getImageData(0, 0, canvas.width, canvas.height);
    const gray = S.grayOf(img), sharp = S.blur(gray, img.width, img.height, 1);
    const prepared = S.prepareBoardSearch(img, gray, self.TARTARUS_SCAN, sharp);
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
    const ready = detector.observe({ epoch, time: performance.now(), valid, controls, sample: self.TartarusFrameReadiness.sample(img, C.loc, S) });
    // The accepted bitmap is immutable. Hand its already-read controls
    // and cells to the final reader, rather than recognise them twice.
    const handoff = ready ? { width: img.width, height: img.height, loc: { ...C.loc, score: fit.score }, board, doors,
      days: S.readDays(img, sharp, C.loc, self.TARTARUS_SCAN), decision } : null;
    self.postMessage({ id, ready, prepared: handoff });
  } catch { self.postMessage({ id, ready: false }); }
  finally { bitmap.close(); }
};
