#!/usr/bin/env node
/* Real GPU-backed integer-grid sampling, isolated from the user's overlay. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process'), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('../desktop/node_modules/electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, encoding: 'utf8', timeout: 60000 });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = require('electron'), ROOT = path.resolve(__dirname, '..');
app.setPath('userData', path.join(ROOT, 'sandbox', `ready-sample-${process.pid}`));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  await win.loadURL('data:text/html,<body>sample check</body>');
  const at = process.argv.indexOf('--reference'), previous = at >= 0 ? path.resolve(process.argv[at + 1]) : null;
  const result = await win.webContents.executeJavaScript(`(async()=>{
    const R=require(${JSON.stringify(path.join(ROOT, 'js/frame-readiness.js'))}),S=require(${JSON.stringify(path.join(ROOT, 'js/scan.js'))});
    const old=${previous ? `require(${JSON.stringify(path.join(previous, 'frame-readiness.js'))})` : 'null'};
    const results=[];let checks=0,clipped=0;
    for(const width of [1920,2560,3840]){
      const height=width*9/16,canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d');
      const img=context.createImageData(width,height);let seed=1777;
      for(let i=0;i<img.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;img.data[i]=seed>>>24;img.data[i+1]=(seed>>>16)&255;img.data[i+2]=(seed>>>8)&255;img.data[i+3]=255;}
      context.putImageData(img,0,0);const bitmap=canvas.transferToImageBitmap();
      const tiny=new OffscreenCanvas(32,48).getContext('2d',{willReadFrequently:false});
      for(let j=0;j<24;j++){
        const loc={s:.4+j*.025,tx:200+j*1.234,ty:150+j*.345};
        const actual=R.sampleBitmap(bitmap,loc,S,tiny),expected=R.sampleFast(img,loc,S);
        if(actual){if(expected.some((v,i)=>v!==actual[i]))throw new Error('Fractional GPU/CPU mismatch '+width+' '+j);checks++;}else clipped++;
      }
      const loc={s:.675,tx:200.123,ty:150.456},current=[],previous=[];
      const oldTiny=old?new OffscreenCanvas(32,48).getContext('2d',{willReadFrequently:false}):null;
      for(let j=0;j<20;j++)for(const label of j%2?['previous','current']:['current','previous']){
        if(label==='previous'&&!old)continue;
        const start=performance.now();(label==='current'?R:old).sampleBitmap(bitmap,loc,S,label==='current'?tiny:oldTiny);
        if(j>=5)(label==='current'?current:previous).push(performance.now()-start);
      }
      const median=xs=>xs.length?xs.sort((a,b)=>a-b)[xs.length>>1]:null;
      results.push({width,height,currentMedianMs:median(current),previousMedianMs:median(previous)});bitmap.close();
    }
    return {checks,clipped,results};
  })()`);
  assert.ok(result.checks >= 36); assert.ok(result.results.every(r => r.currentMedianMs !== null));
  const report = { checkedAt: new Date().toISOString(), version: require('../desktop/package.json').version, ...result,
    baseline: previous ? path.relative(ROOT, previous) : null, electron: process.versions.electron,
    measurement: 'Opaque pseudorandom GPU bitmaps; 24 fractional layout transforms at each of 1080p/1440p/4K. Warm medians of 15 calls after 5 warmups, alternating order; different old/new grids each preserve their respective exact CPU semantics.',
    limitations: 'Only the tiny readiness sampler; excludes semantic recognition, full capture, game animations and simulation. Background user activity uncontrolled.', gameInput: false };
  const out = process.argv.indexOf('--report'); if (out >= 0) fs.writeFileSync(path.resolve(process.argv[out + 1]), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: exact GPU pixels across fractional layouts.', JSON.stringify(report)); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
