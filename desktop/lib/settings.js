'use strict';
const D = window.TartarusDesktop;
const $ = (id) => document.getElementById(id);
function render(settings) {
  if (!settings) return;
  const enabled = !!settings.consent && !settings.consent.withdrawn && settings.consent.version === 4;
  $('status').textContent = enabled ? 'Game capture enabled.' : 'Game capture is off.';
  $('speed').checked = !!settings.speed;
}
$('enable').onclick = () => { D.setConsent({ version: 4, at: new Date().toISOString() }); setTimeout(() => D.fastSettings().then(render), 30); };
$('disable').onclick = () => { D.setConsent({ withdrawn: true, at: new Date().toISOString() }); setTimeout(() => D.fastSettings().then(render), 30); };
$('speed').onchange = () => D.setFastSettings({ speed: $('speed').checked });
$('log').onclick = () => D.pickLog();
D.fastSettings().then(render);
D.onFastSettings(render);
