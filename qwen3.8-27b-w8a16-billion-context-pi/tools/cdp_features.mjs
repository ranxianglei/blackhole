#!/usr/bin/env node
// GARGANTUA — feature tests: cinematic, screenshot API, mobile/Retina, context recovery.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
const BASE = 'http://localhost:8123/index.html';
const PORT = 9335;
const CHROME = process.env.CHROME || '/usr/bin/chromium-browser';
fs.mkdirSync('tmp', { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = ''; chrome.stderr.on('data', d => { chromeErr += d.toString(); });
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
const errors = [];
async function main() {
  await waitForDebugger();
  const ver = await getJSON('/json/version');
  const b = new CDP(ver.webSocketDebuggerUrl); await b.connect();
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const list = await getJSON('/json/list');
  const pc = new CDP(list.find(x => x.id === targetId).webSocketDebuggerUrl); await pc.connect();
  pc.on((m, p) => {
    if (m === 'Runtime.consoleAPICalled' && (p.type === 'error')) errors.push('[console] ' + (p.args || []).map(a => a.value ?? a.description ?? '').join(' '));
    else if (m === 'Runtime.exceptionThrown') errors.push('[exception] ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  });
  await pc.send('Runtime.enable'); await pc.send('Page.enable');
  const ev = (expression) => pc.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(r => r.result?.value);
  const nav = async (url, settle) => { await pc.send('Page.navigate', { url });
    for (let i = 0; i < 100; i++) { await sleep(250); if ((await ev('window.__GARGANTUA_READY__===true')) === true) break; }
    await sleep(settle); };
  const shot = async (name) => { const s = await pc.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`tmp/${name}.png`, Buffer.from(s.data, 'base64')); };

  // 1) cinematic (low res + standard quality for speed)
  await pc.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await nav(BASE + '?cinematic=1&quality=standard&t=0', 3500);
  const cineCam = await ev('JSON.stringify(window.GARGANTUA.getState().cinematic)');
  await shot('feature_cinematic');
  console.log('cinematic on:', cineCam);

  // 2) screenshot API
  const shotApi = await ev('window.GARGANTUA.screenshot().slice(0,22)');
  console.log('screenshot API:', shotApi);

  // 3) setParams API
  const sp = await ev('window.GARGANTUA.setParams({diskBrightness:3.0}); window.GARGANTUA.getState().params.diskBrightness');
  console.log('setParams diskBrightness ->', sp);

  // 4) mobile / Retina (dpr 2, capped by quality)
  await pc.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav(BASE + '?quality=high', 1500);
  const mob = await ev('JSON.stringify({w:document.getElementById("gl").width, h:document.getElementById("gl").height, dpr:window.devicePixelRatio})');
  await shot('feature_mobile');
  console.log('mobile canvas (390x844 @dpr2, high cap1.5):', mob);

  // 5) WebGL context loss / restore (synthetic events)
  await pc.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await nav(BASE + '?quality=standard', 1000);
  const lost = await ev(`(()=>{const c=document.getElementById('gl');c.dispatchEvent(new Event('webglcontextlost'));return document.getElementById('overlay').style.display;})()`);
  console.log('after contextlost, overlay display:', lost);
  await sleep(500);
  const restored = await ev(`(()=>{const c=document.getElementById('gl');c.dispatchEvent(new Event('webglcontextrestored'));return 'dispatched';})()`);
  await sleep(2500);
  const afterRestore = await ev('JSON.stringify({ov:document.getElementById("overlay").style.display, ready:window.__GARGANTUA_READY__===true})');
  await shot('feature_recovered');
  console.log('after contextrestored:', afterRestore);

  console.log('\n=== ERRORS: ' + errors.length + ' ===');
  for (const e of errors) console.log('  ' + e);
  pc.close(); b.close(); chrome.kill('SIGTERM');
  process.exit(errors.length > 0 ? 2 : 0);
}
main().catch(e => { console.error('FAILED:', e.message); console.error(chromeErr.slice(-1500)); chrome.kill('SIGTERM'); process.exit(1); });
