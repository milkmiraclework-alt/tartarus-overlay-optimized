#!/usr/bin/env node
/* Source-development launcher. Prefer the project's own Electron runtime.
 * Distributed standalone executables serve their bundled assets directly.
 * Start-Local-Overlay.cmd [--check] [overlay arguments...]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: pause } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'http://localhost:8090/';
const CHECK_URL = 'http://127.0.0.1:8090/';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const background = args.includes('--background');
const appArgs = args.filter((arg) => !['--check', '--background', '--console'].includes(arg));
const executable = require('./overlay-runtime.js').sourceExecutable();
let server = null;
let overlay = null;

function stop() {
  if (overlay && overlay.exitCode === null) overlay.kill();
  if (server && server.exitCode === null) server.kill();
}
process.on('exit', stop);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(0); });

async function localFilesMatch() {
  for (const file of ['js/solver.js', 'analyze.html']) {
    const response = await fetch(`${CHECK_URL}${file}`, { signal: AbortSignal.timeout(1000), cache: 'no-store' });
    if (!response.ok || await response.text() !== fs.readFileSync(path.join(ROOT, file), 'utf8')) return false;
  }
  return true;
}

async function main() {
  if (!fs.existsSync(executable)) throw new Error('Electron runtime not found. Use the standalone release or build it with tools/build-standalone.ps1.');
  // Reuse a local server only after checking that it serves this code.
  try {
    if (!await localFilesMatch()) throw new Error('Another site uses port 8090. Stop that server and run this launcher again.');
    console.log('Using the local server already running on port 8090.');
  } catch (error) {
    if (!error.cause && error.name !== 'TimeoutError') throw error;
    const env = { ...process.env };
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
    server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), '--port', '8090'], {
      cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverError = '';
    server.on('error', (failure) => { serverError = failure.message; });
    server.stdout.on('data', (data) => process.stdout.write(data));
    server.stderr.on('data', (data) => { serverError += data; });
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null || serverError) throw new Error(serverError || 'Local server stopped before it was ready.');
      try { ready = await localFilesMatch(); } catch { /* Wait for the server to listen. */ }
      if (ready) break;
      await pause(100);
    }
    if (!ready) throw new Error('Local server did not become ready on port 8090.');
  }
  const html = fs.readFileSync(path.join(ROOT, 'analyze.html'), 'utf8');
  const tag = (/js\/solver\.js\?v=([\w.-]+)/.exec(html) || [])[1] || 'local';
  console.log(`Verified local optimized solver: ${tag}`);
  if (checkOnly) return;

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const runtime = require('./overlay-runtime.js').prepareRuntime(executable);
  env.TARTARUS_INSTALLED_ASAR = runtime.installedAsar;
  console.log('Starting the local overlay with the direct capture pipeline.');
  console.log(background ? 'The local service will stop when you quit the overlay from its tray menu.' : 'Leave this launcher open. Quit the overlay from its tray menu to stop.');
  const started = Date.now();
  overlay = spawn(runtime.executable, [`--site=${SITE}`, '--fast', ...appArgs], {
    cwd: path.dirname(executable), env, windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (appArgs.includes('--test')) process.stdin.pipe(overlay.stdin);
  const code = await new Promise((resolve, reject) => {
    overlay.once('error', reject);
    overlay.once('exit', resolve);
  });
  if (Date.now() - started < 3000 && code === 0) {
    throw new Error('The overlay exited immediately. Quit any running copy from its tray menu, then launch again.');
  }
  if (code) throw new Error(`Overlay exited with code ${code}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
  if (background && !checkOnly && process.platform === 'win32') {
    const dialog = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:TARTARUS_LOCAL_ERROR, "Tartarus local overlay") | Out-Null'], {
      windowsHide: true, stdio: 'ignore', env: { ...process.env, TARTARUS_LOCAL_ERROR: error.message },
    });
    dialog.on('error', () => {});
    dialog.unref();
  }
}).finally(() => {
  stop();
  if (appArgs.includes('--test')) process.stdin.unpipe();
});
