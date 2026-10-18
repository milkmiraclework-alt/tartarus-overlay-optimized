/* Read-only source update notice for a locally modified build. No download,
 * checkout, installation or change to files is performed by this module. */
'use strict';
const API = 'https://api.github.com/repos/blahdot3h/tartarus-simulator/commits/main';
const REPO = 'https://github.com/blahdot3h/tartarus-simulator';
async function check(fetch, current, signal) {
  const response = await fetch(API, { cache: 'no-store', signal, headers: { 'User-Agent': 'Tartarus-local-overlay' } });
  if (!response.ok) throw new Error(`Upstream check: HTTP ${response.status}`);
  const data = await response.json();
  if (!/^[a-f0-9]{40}$/.test(data.sha || '')) throw new Error('Invalid upstream revision');
  if (data.sha === current) return null;
  return { commit: data.sha, title: String(data.commit?.message || '').split('\n')[0].slice(0, 200), url: `${REPO}/compare/${current}...${data.sha}` };
}
module.exports = { check };
