#!/usr/bin/env node
// GARGANTUA — test URL screenshot API + state persistence + steps-per-quality.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const BASE = 'http://localhost:8123/index.html';
const PORT = 9336;
const CHROME = process.env.CHROME || '/usr/bin/chromium-browser';
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  pc.on((m, p) => { if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push('[console] ' + (p.args || []).map(a => a.value ?? a.description ?? '').join(' '));
    else if (m === 'Runtime.exceptionThrown') errors.push('[exception] ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)); });
  await pc.send('Runtime.enable'); await pc.send('Page.enable');
  const ev = (expression) => pc.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(r => r.result?.value);
  const nav = async (url, settle) => { await pc.send('Page.navigate', { url });
    for (let i = 0; i < 100; i++) { await sleep(250); if ((await ev('window.__GARGANTUA_READY__===true')) === true) break; }
    await sleep(settle); };

  // 1) URL screenshot API (?shot=dataurl)
  await nav(BASE + '?shot=dataurl&az=0&el=18&dist=28&fov=60&t=5&quality=standard', 1500);
  const shotGlobal = await ev('typeof window.__GARGANTUA_SHOT__ + " len=" + (window.__GARGANTUA_SHOT__||"").length');
  console.log('1) ?shot=dataurl ->', shotGlobal);

  // 2) steps per quality
  const stepsStd = await ev('window.GARGANTUA.getState().params.steps');
  console.log('2) standard steps:', stepsStd, '(expect 300)');
  await nav(BASE + '?quality=cinematic&az=0&el=18&dist=28&fov=60&t=5', 1500);
  const stepsCine = await ev('window.GARGANTUA.getState().params.steps');
  console.log('   cinematic steps:', stepsCine, '(expect 768)');

  // 3) state persistence: set a param, reload, check it stuck
  await nav(BASE + '?quality=standard&diskBrightness=5.5&az=0&el=18&dist=28&fov=60&t=5', 1200);
  const ls1 = await ev('JSON.parse(localStorage.getItem("gargantua.state.v1")||"{}").params.diskBrightness');
  console.log('3) after ?diskBrightness=5.5, localStorage =', ls1);
  await nav(BASE + '?quality=standard&az=0&el=18&dist=28&fov=60&t=5', 1200); // no brightness override
  const persisted = await ev('window.GARGANTUA.getState().params.diskBrightness');
  console.log('   after plain reload, diskBrightness =', persisted, '(expect 5.5 from localStorage)');

  console.log('\n=== ERRORS: ' + errors.length + ' ===');
  for (const e of errors) console.log('  ' + e);
  pc.close(); b.close(); chrome.kill('SIGTERM');
  process.exit(errors.length > 0 ? 2 : 0);
}
main().catch(e => { console.error('FAILED:', e.message); console.error(chromeErr.slice(-1500)); chrome.kill('SIGTERM'); process.exit(1); });
