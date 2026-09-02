#!/usr/bin/env node
// GARGANTUA — batch CDP test: one Chromium session, many cases (url -> png).
// Collects console errors/exceptions across all cases.
// Usage: node tools/cdp_batch.mjs
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const BASE = 'http://localhost:8123/index.html';
const PORT = 9334;
const CHROME = process.env.CHROME || '/usr/bin/chromium-browser';
fs.mkdirSync('tmp', { recursive: true });

// test cases: [name, query, settleMs]
const CASES = [
  ['preset0_classic',    '?az=0&el=18&dist=28&fov=60&t=5',        1200],
  ['preset1_overhead',   '?az=0&el=72&dist=32&fov=55&t=5',        1200],
  ['preset2_photonring', '?az=0&el=3&dist=17&fov=50&t=5',         1200],
  ['preset3_orbit',      '?az=40&el=32&dist=24&fov=60&t=5',       1200],
  ['debug1_steps',       '?az=0&el=18&dist=28&fov=60&t=5&debug=1',1200],
  ['debug2_deflection',  '?az=0&el=18&dist=28&fov=60&t=5&debug=2',1200],
  ['debug4_doppler',     '?az=0&el=18&dist=28&fov=60&t=5&debug=4',1200],
  ['debug5_redshift',    '?az=0&el=18&dist=28&fov=60&t=5&debug=5',1200],
  ['debug6_temp',        '?az=0&el=18&dist=28&fov=60&t=5&debug=6',1200],
  ['quality_standard',   '?az=0&el=18&dist=28&fov=60&t=5&quality=standard',1200],
  // NOTE: cinematic (768 steps) is very slow under SwiftShader software GL;
  // fine on a real GPU. Kept for GPU runs — remove for fast headless CI.
  ['quality_cinematic',  '?az=0&el=18&dist=28&fov=60&t=5&quality=cinematic',1500],
  ['doppler_off',        '?az=0&el=18&dist=28&fov=60&t=5&doppler=0&redshift=0',1200],
  ['thick_disk',         '?az=0&el=25&dist=26&fov=60&t=5&diskThickness=1.6&turbulence=1.6',1200],
];

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });

async function getJSON(p) { return (await fetch(`http://127.0.0.1:${PORT}${p}`)).json(); }
async function waitForDebugger() { for (let i = 0; i < 50; i++) { try { await getJSON('/json/version'); return; } catch { await sleep(200); } } throw new Error('no CDP'); }

class CDP {
  constructor(u) { this.u = u; this.id = 0; this.pending = new Map(); this.handlers = []; }
  async connect() { this.ws = new WebSocket(this.u); await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) for (const h of this.handlers) h(m.method, m.params); }; }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

const allErrors = [];
async function main() {
  await waitForDebugger();
  const ver = await getJSON('/json/version');
  const b = new CDP(ver.webSocketDebuggerUrl); await b.connect();
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const list = await getJSON('/json/list');
  const t = list.find(x => x.id === targetId);
  const pc = new CDP(t.webSocketDebuggerUrl); await pc.connect();
  pc.on((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const txt = (params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      if (params.type === 'error' || params.type === 'warning') allErrors.push(`[console:${params.type}] ${txt}`);
    } else if (method === 'Runtime.exceptionThrown') {
      allErrors.push('[exception] ' + (params.exceptionDetails.exception?.description || params.exceptionDetails.text));
    }
  });
  await pc.send('Runtime.enable'); await pc.send('Page.enable');
  await pc.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const results = [];
  for (const [name, query, settle] of CASES) {
    const url = BASE + query;
    const errsBefore = allErrors.length;
    await pc.send('Page.navigate', { url });
    let ready = false;
    for (let i = 0; i < 100; i++) { await sleep(250);
      try { const r = await pc.send('Runtime.evaluate', { expression: 'window.__GARGANTUA_READY__===true', returnByValue: true }); if (r.result?.value === true) { ready = true; break; } } catch {} }
    await sleep(settle);
    const diag = await pc.send('Runtime.evaluate', { expression: `JSON.stringify({ov:(document.getElementById('overlay')||{}).style?.display, st:(document.querySelector('.hud-status')||{}).textContent})`, returnByValue: true });
    const shot = await pc.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`tmp/${name}.png`, Buffer.from(shot.data, 'base64'));
    const newErrs = allErrors.slice(errsBefore);
    results.push({ name, ready, diag: diag.result.value, errs: newErrs.length });
    console.log(`${ready ? 'OK ' : 'FAIL'} ${name.padEnd(20)} ${diag.result.value} ${newErrs.length ? 'ERRS:' + newErrs.join(' | ') : ''}`);
  }

  console.log('\n=== TOTAL ERRORS: ' + allErrors.length + ' ===');
  for (const e of allErrors) console.log('  ' + e);
  pc.close(); b.close(); chrome.kill('SIGTERM');
  process.exit(allErrors.length > 0 ? 2 : 0);
}
main().catch(e => { console.error('FAILED:', e.message); console.error(chromeErr.slice(-1500)); chrome.kill('SIGTERM'); process.exit(1); });
