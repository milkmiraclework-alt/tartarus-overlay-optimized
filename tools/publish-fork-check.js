#!/usr/bin/env node
/* Real PowerShell publisher with mock gh/git: never creates a remote repo. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync, execFileSync } = require('node:child_process');
if (process.argv[2] === 'mock') {
  const kind = process.argv[3], args = process.argv.slice(4), stateFile = process.env.PUBLISH_MOCK_STATE;
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : { calls: [], created: false };
  const record = () => fs.writeFileSync(stateFile, JSON.stringify(state));
  if (kind === 'git' && !args.includes('push')) {
    const result = spawnSync(process.env.PUBLISH_REAL_GIT, args, { stdio: 'inherit', windowsHide: true }); process.exit(result.status ?? 1);
  }
  state.calls.push([kind, ...args]); record();
  if (kind === 'git') {
    if (args.some(a => a.includes('--force')) || !args.includes('https://github.com/publish-test/tartarus-overlay-optimized.git')) process.exit(8);
    if (process.env.PUBLISH_MOCK_CASE === 'push-fails') process.exit(1);
    state.pushed = true; record(); process.exit(0);
  }
  if (args[0] === 'auth' && args[1] === 'status') { console.error('Mock: not signed in'); process.exit(1); }
  if (args[0] === 'auth' && args[1] === 'login') { state.signedIn = true; record(); process.exit(0); }
  if (args[0] === 'api' && args[1] === 'user') { console.log('publish-test'); process.exit(0); }
  if (args[0] === 'repo' && args[1] === 'fork') {
    if (args.some(a => a.startsWith('--remote'))) { console.error('the --remote flag is unsupported when a repository argument is provided'); process.exit(1); }
    if (process.env.PUBLISH_MOCK_CASE === 'fork-fails') { console.error('Mock: Fork creation denied by fork policy (HTTP 403)'); process.exit(1); }
    state.created = true; record(); process.exit(0);
  }
  if (args[0] === 'repo' && args[1] === 'edit') { if (!state.pushed) process.exit(9); state.edited = true; record(); process.exit(0); }
  if (args[0] === 'api' && args[1].includes('/commits/')) { console.log(process.env.PUBLISH_EXPECTED_COMMIT); process.exit(0); }
  if (args[0] === 'api' && args[1].startsWith('repos/')) {
    if (process.env.PUBLISH_MOCK_CASE === 'lookup-fails') { console.error('Mock: Token permission denied (HTTP 403)'); process.exit(1); }
    if (process.env.PUBLISH_MOCK_CASE === 'wrong-parent') { console.log('other/repository'); process.exit(0); }
    if (!state.created && process.env.PUBLISH_MOCK_CASE !== 'existing-fork') { console.error('Mock: repository does not exist (HTTP 404)'); process.exit(1); }
    console.log('blahdot3h/tartarus-simulator'); process.exit(0);
  }
  process.exit(10);
}
const folder = path.resolve('sandbox/publisher-mocks'); fs.mkdirSync(folder, { recursive: true });
const realGit = execFileSync('where.exe', ['git'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
for (const kind of ['gh', 'git']) fs.writeFileSync(path.join(folder, kind + '.cmd'), '@echo off\r\n"' + process.execPath + '" "' + __filename + '" mock ' + kind + ' %*\r\n');
const commit = execFileSync(realGit, ['rev-parse', 'optimized-overlay'], { encoding: 'utf8' }).trim();
for (const mode of ['new-fork', 'existing-fork', 'wrong-parent', 'lookup-fails', 'fork-fails', 'push-fails']) {
  const stateFile = path.join(folder, mode + '-' + Date.now() + '.json');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tools/publish-fork.ps1')], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, PATH: folder + path.delimiter + process.env.PATH, PUBLISH_REAL_GIT: realGit, PUBLISH_MOCK_STATE: stateFile, PUBLISH_MOCK_CASE: mode, PUBLISH_EXPECTED_COMMIT: commit }
  });
  const state = JSON.parse(fs.readFileSync(stateFile));
  const text = result.stdout + '\n' + result.stderr;
  const success = ['new-fork', 'existing-fork'].includes(mode);
  const madeFork = state.calls.some(call => call[0] === 'gh' && call[1] === 'repo' && call[2] === 'fork');
  if (success ? result.status !== 0 || !state.signedIn || !state.pushed || !state.edited || (mode === 'new-fork' ? !state.created : madeFork)
    : result.status === 0 || state.edited || ['wrong-parent', 'lookup-fails', 'fork-fails'].includes(mode) && state.pushed
      || ['wrong-parent', 'lookup-fails'].includes(mode) && madeFork
      || mode === 'fork-fails' && !text.includes('fork policy') || mode === 'lookup-fails' && !text.includes('Token permission denied')) {
    console.log(result.stdout); console.log(result.stderr); throw Error('Publisher mock failed: ' + mode);
  }
  console.log('PASS: publisher ' + mode + ' (mock tools, no network or real push).');
}
