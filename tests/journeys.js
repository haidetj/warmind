#!/usr/bin/env node
// Journey smoke test: walks every journey in app/warmind/data/logic.yaml (served at /api/logic).
// For each step with a `probe` it opens the screen that step passes through, at phone widths, and
// checks that it renders (`expect` selector visible), throws no page errors and has no sideways scroll.
// The journeys on the Logic tab ARE the test plan: add a step there, it's tested here.
//
//   WARMIND_VISION_MOCK=1 python -m uvicorn server:app --port 8099   (from app/, a scratch WARMIND_DB)
//   node tests/journeys.js [http://localhost:8099]
//
// Needs Playwright (`npm i playwright` or a global install). Creates its own profile, table and
// debrief through the API (mock mode: no Claude calls, no cost).
const { chromium } = require('playwright');
const B = process.argv[2] || process.env.WARMIND_URL || 'http://localhost:8099';
const WIDTHS = [360, 448];

async function api(path, opts = {}) {
  const r = await fetch(B + path, opts);
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const jpost = (path, body, headers = {}) => api(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });

async function fixtures() {
  // a profile, a briefed war table with one debrief: enough state for every journey's screens
  const L = await jpost('/api/locker', { callsign: 'Journey' + (Date.now() % 1e6) });
  const fd = new FormData(); fd.append('name', 'Journey test'); fd.append('squad_size', '1');
  fd.append('locker_id', L.locker_id); fd.append('locker_key', L.locker_key);
  const T = await api('/api/lobby', { method: 'POST', body: fd });
  const j = new FormData(); j.append('locker_id', L.locker_id); j.append('locker_key', L.locker_key);
  const seat = await api(`/api/lobby/${T.lobby_id}/join`, { method: 'POST', body: j });
  const meta = await api('/api/meta');
  const mission = meta.missions.find(m => !m.factions.length || m.factions.includes('automatons'));
  await jpost(`/api/lobby/${T.lobby_id}/mission`, { mission: { mission_id: mission.id, faction: 'automatons', difficulty: 7, mode: 'optimize', oaths: ['no_deaths'] } }, { 'x-token': T.creator_token });
  await jpost(`/api/lobby/${T.lobby_id}/brief`, {}, { 'x-token': T.creator_token });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const f = new FormData(); f.append('images', new Blob([png], { type: 'image/png' }), 's.png');
  await api(`/api/lobby/${T.lobby_id}/player/${seat.player_id}/result`, { method: 'POST', headers: { 'x-token': seat.player_token }, body: f });
  return { locker: { id: L.locker_id, key: L.locker_key }, lid: T.lobby_id, ct: T.creator_token, seat: { id: seat.player_id, token: seat.player_token } };
}

(async () => {
  const logic = await api('/api/logic');
  if (!(logic.live || {}).mock) console.warn('! the server is not in mock mode: the debrief fixture makes real (billed) Claude calls');
  const fx = await fixtures();
  const fill = u => u.replace('{lid}', fx.lid).replace('{locker}', fx.locker.id);
  const browser = await chromium.launch();
  const rows = []; let failed = 0;
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 820 } });
    await ctx.addInitScript(x => {
      localStorage.setItem('wm_locker', JSON.stringify(x.locker));
      localStorage.setItem('wm_creator_' + x.lid, x.ct);
      localStorage.setItem('wm_me_' + x.lid, JSON.stringify(x.seat));
    }, fx);
    const page = await ctx.newPage();
    for (const jr of logic.journeys) {
      for (const [i, st] of jr.steps.entries()) {
        if (!st.probe) continue;
        const errs = [];
        const onErr = e => errs.push(e.message);
        page.on('pageerror', onErr);
        let ok = true, why = '';
        try {
          await page.goto(B + fill(st.probe.url), { waitUntil: 'domcontentloaded' });
          if (st.probe.click) { await page.locator('button', { hasText: new RegExp(st.probe.click, 'i') }).first().click({ timeout: 10000 }); }
          await page.locator(st.probe.expect).first().waitFor({ state: 'visible', timeout: 12000 });
          await page.waitForTimeout(300);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          if (over > 0) { ok = false; why = `sideways scroll ${over}px`; }
        } catch (e) { ok = false; why = e.message.split('\n')[0].slice(0, 140); }
        if (errs.length) { ok = false; why = (why ? why + '; ' : '') + 'page error: ' + errs[0].slice(0, 120); }
        page.off('pageerror', onErr);
        failed += !ok;
        rows.push(`${ok ? 'PASS' : 'FAIL'}  ${w}px  ${jr.id} #${i + 1}  ${st.probe.url}${st.probe.click ? ' → ' + st.probe.click : ''}${ok ? '' : '  — ' + why}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(rows.join('\n'));
  console.log(`\n${rows.length - failed}/${rows.length} journey checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('journeys: ' + e.message); process.exit(2); });
