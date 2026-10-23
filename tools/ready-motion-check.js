#!/usr/bin/env node
/* Saved frames and synthetic courtyard motion; never captures/controls a game. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), arg = (k,d) => args.includes(k) ? args[args.indexOf(k)+1] : d;
if (!process.versions.electron) {
  (async()=>{
    const http = require('node:http'), {spawn} = require('node:child_process');
    const baseline = path.resolve(arg('--reference','sandbox/tartarus-before-30/js'));
    const server = http.createServer((req,res)=>{
      const name = new URL(req.url,'http://localhost').pathname;
      if (name === '/check.html') { res.setHeader('Content-Type','text/html'); res.end('<title>Readiness motion check</title>'); return; }
      if (!/^\/(js|previous)\/[a-z0-9_-]+\.(js|wasm)$/i.test(name)) {res.statusCode=404;res.end();return;}
      const file = path.join(name.startsWith('/previous/')?baseline:path.join(ROOT,'js'),path.basename(name));
      try {res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('../desktop/node_modules/electron'),[__filename,...args,'--check-url',`http://127.0.0.1:${server.address().port}/check.html`],{env,windowsHide:true,stdio:['ignore','inherit','inherit']});
    const timer=setTimeout(()=>child.kill(),90000);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));process.exitCode=code??1;
  })().catch(e=>{console.error(e);process.exitCode=1;});
} else {
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',path.join(ROOT,'sandbox','ready-motion-'+process.pid));
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
    await win.loadURL(arg('--check-url'));
    const files=fs.readdirSync(path.resolve(arg('--frames','sandbox/reader-profile'))).filter(n=>/\.webp$/i.test(n)).slice(0,2).map(n=>path.resolve(arg('--frames','sandbox/reader-profile'),n));
    if(files.length!==2)throw new Error('Two saved WebP board frames required');
    const report=await win.webContents.executeJavaScript(`(async()=>{
      const fs=require('fs'),root=${JSON.stringify(ROOT)},files=${JSON.stringify(files)};
      const S=require(root+'/js/scan.js'),R=require(root+'/js/frame-readiness.js'),A=require(root+'/js/scan-accelerator.js');
      S.setKernels(A.create((await WebAssembly.instantiate(fs.readFileSync(root+'/js/scan-kernels.wasm'))).instance));
      const ref=S.withPanelIcons(require(root+'/js/scan-data.js'),require(root+'/js/pick-data.js'));
      const imgs=[];for(const file of files){const b=await createImageBitmap(new Blob([fs.readFileSync(file)],{type:'image/webp'}));const c=new OffscreenCanvas(b.width,b.height),cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(b,0,0);b.close();imgs.push(cx.getImageData(0,0,c.width,c.height));}
      const first=S.scan(imgs[0],ref),loc=first.loc;
      const calibration={loc,width:imgs[0].width,height:imgs[0].height,sample:R.sample(imgs[0],loc,S),fastSample:R.sampleFast(imgs[0],loc,S),controls:R.controlsFor(first)};
      if(!calibration.controls)throw new Error('Missing reference controls');
      const a=S.at(loc,1.6,.95),b=S.at(loc,3.4,1.6);
      function motion(base,i,hide=false){
        const out=new ImageData(base.data.slice(),base.width,base.height),v=i%2?44:24;
        for(let y=Math.ceil(a[1]);y<Math.floor(b[1]);y++)for(let x=Math.ceil(a[0]);x<Math.floor(b[0]);x++){const j=(y*out.width+x)*4;out.data[j]=out.data[j+1]=out.data[j+2]=v;}
        if(hide){const bottom=Math.max(S.at(loc,0,3)[1],S.at(loc,5,3)[1])+30*loc.s;for(let y=Math.ceil(bottom);y<out.height;y++)for(let x=0;x<out.width;x++){const j=(y*out.width+x)*4;out.data[j]=out.data[j+1]=out.data[j+2]=0;}}
        return out;
      }
      const delta=R.difference(R.sampleFast(motion(imgs[1],0),loc,S),R.sampleFast(motion(imgs[1],1),loc,S));
      if(delta.changed<.01)throw new Error('Motion fixture does not stress the visual gate: '+JSON.stringify(delta));
      const expected=[];
      for(let i=0;i<2;i++){
        const img=motion(imgs[1],i),g=S.grayOf(img),sharp=S.blur(g,img.width,img.height,1),fit=S.scoreBoardAt(S.prepareBoardSearch(img,g,ref,sharp,1),loc);
        const board=S.readBoardCells(img,sharp,loc,ref),doors=S.readDoors(img,sharp,loc,ref),decision=doors?.conf>=.85?null:S.readDecision(img,loc);
        if(fit.score<.82||fit.quarters.some(x=>x<.68))throw new Error('Motion fixture corrupted the board fit: '+JSON.stringify({fit,delta}));
        expected.push(R.controlsFor({...board,doors,decision}));
      }
      if(!expected[0]||expected[0]!==expected[1]||expected[0]===calibration.controls)throw new Error('Fixture changed semantic state');
      async function checkWorker(base,current){
        const w=new Worker(base+'ready-worker.js');let id=0,last=null;
        const send=async(img,epoch=1)=>{
          const c=new OffscreenCanvas(img.width,img.height);c.getContext('2d').putImageData(img,0,0);const bitmap=c.transferToImageBitmap(),mine=++id;
          return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Motion probe timeout')),5000);w.onmessage=({data})=>{if(data.id===mine){clearTimeout(timer);last=data;resolve(data.ready);}};w.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};w.postMessage({id:mine,bitmap,epoch},[bitmap]);});
        };
        let sentAt=0;
        const delay=()=>new Promise(r=>setTimeout(r,Math.max(0,100-(performance.now()-sentAt))));
        try{
          w.postMessage({calibrate:calibration});const outcomes=[],reasons=[],costs=[],start=performance.now();let readyAtMs=null;
          for(let i=0;i<5;i++){sentAt=performance.now();outcomes.push(await send(motion(imgs[1],i)));reasons.push(last.probe?.reason||last.probe?.stage);costs.push({ms:Math.round(last.probe?.ms||0),reusedMenu:last.probe?.reusedMenu||false});if(readyAtMs===null&&outcomes.at(-1))readyAtMs=Math.round(performance.now()-start);await delay();}
          const elapsedMs=Math.round(performance.now()-start);
          if(current){if(outcomes.slice(0,3).some(Boolean)||!outcomes[3]||reasons[3]!=='ready-state')throw new Error('Semantic consensus was early or never completed: '+JSON.stringify({outcomes,reasons}));}
          else if(outcomes.some(Boolean))throw new Error('Frozen baseline unexpectedly accepted moving pixels');
          for(let i=0;i<4;i++){if(await send(motion(imgs[1],i,true)))throw new Error('Changed controls reused the cached menu');await delay();}
          w.postMessage({calibrate:calibration});
          for(let i=0;i<6;i++){if(await send(motion(imgs[0],i)))throw new Error('Moving old board accepted');await delay();}
          w.postMessage({calibrate:calibration});
          for(let i=0;i<6;i++){if(await send(motion(imgs[1],i,true)))throw new Error('Missing controls accepted');await delay();}
          if(current){
            w.postMessage({calibrate:calibration});
            for(let i=0;i<3;i++){if(await send(motion(imgs[1],i),30))throw new Error('Too few state observations');await delay();}
            for(let i=0;i<3;i++){if(await send(motion(imgs[1],i),31))throw new Error('New action reused old stability');await delay();}
            if(!await send(motion(imgs[1],3),31))throw new Error('Fresh epoch did not settle');
          }
          return {outcomes,reasons,costs,readyAtMs,elapsedMs,oldFramesRejected:true,missingControlsRejected:true,menuInvalidated:true,epochFence:current?true:null};
        }finally{w.terminate();}
      }
      return {motionDifference:delta,current:await checkWorker('/js/',true),previous:await checkWorker('/previous/',false)};
    })()`);
    const result={version:require('../desktop/package.json').version,checkedAt:new Date().toISOString(),...report,
      limitations:'Two saved frames with synthetic motion only inside the empty courtyard; same strong fit/control/confidence gates. Elapsed times are test sequence timings, not live-game latency.',gameCapture:false,gameInput:false};
    if(args.includes('--report'))fs.writeFileSync(path.resolve(arg('--report')),JSON.stringify(result,null,2)+'\n');
    console.log('PASS: moving background reaches semantic consensus; old frames, incomplete menus and old epochs stay rejected.',JSON.stringify(result));app.quit();
  }).catch(e=>{console.error(e);app.exit(1);});
}
