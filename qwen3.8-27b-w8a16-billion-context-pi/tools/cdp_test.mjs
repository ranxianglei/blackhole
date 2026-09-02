#!/usr/bin/env node
// GARGANTUA — headless Chromium CDP test harness (no puppeteer).
// Launches headless Chromium, loads the app, captures console/exceptions,
// waits for readiness, and saves a screenshot.
//
// Usage: node tools/cdp_test.mjs [url] [outPng]
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const URL = process.argv[2] || 'http://localhost:8123/index.html';
const OUT = process.argv[3] || 'tmp/shot.png';
const PORT = 9333;
const CHROME = process.env.CHROME || '/usr/bin/chromium-browser';

const chromeArgs = [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=1280,720',
  '--hide-scrollbars',
  '--mute-audio',
  'about:blank',
];

const chrome = spawn(CHROME, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });

async function getJSON(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return r.json();
}

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try { await getJSON('/json/version'); return; } catch { await sleep(200); }
  }
  throw new Error('Chrome DevTools not reachable');
}

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.handlers = []; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg.method, msg.params);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(fn) { this.handlers.push(fn); }
  close() { try { this.ws.close(); } catch {} }
}

const consoleMsgs = [];
const exceptions = [];

async function main() {
  await waitForDebugger();
  // create a fresh target
  const ver = await getJSON('/json/version');
  const browserWs = ver.webSocketDebuggerUrl;
  const b = new CDP(browserWs);
  await b.connect();
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  // route session messages
  const page = new CDP(browserWs);
  await page.connect();
  // We need to send commands with sessionId. Wrap:
  const cmd = (method, params = {}) => b.send(method, { ...params, __sid: sessionId }).catch(e => {
    // fallback: send via flattened session
    throw e;
  });
  // Simpler: use a dedicated connection to the page target directly.
  const list = await getJSON('/json/list');
  const pageTarget = list.find(t => t.id === targetId) || list.find(t => t.type === 'page');
  const pc = new CDP(pageTarget.webSocketDebuggerUrl);
  await pc.connect();
  pc.on((method, params) => {
    if (method === 'Runtime.consoleAPICalled') {
      const txt = (params.args || []).map(a => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ');
      consoleMsgs.push(`[${params.type}] ${txt}`);
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      exceptions.push(d.exception?.description || d.text || 'exception');
    } else if (method === 'Log.entryAdded') {
      consoleMsgs.push(`[log:${params.entry.level}] ${params.entry.text}`);
    }
  });
  await pc.send('Runtime.enable');
  await pc.send('Page.enable');
  await pc.send('Log.enable');
  await pc.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await pc.send('Page.navigate', { url: URL });

  // wait for readiness
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
      const r = await pc.send('Runtime.evaluate', { expression: 'window.__GARGANTUA_READY__ === true', returnByValue: true });
      if (r.result && r.result.value === true) { ready = true; break; }
    } catch {}
  }
  // give it a couple more frames to settle
  await sleep(1500);

  // read diagnostics
  const diag = await pc.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      ready: window.__GARGANTUA_READY__ === true,
      hasG: typeof window.GARGANTUA,
      overlay: (document.getElementById('overlay')||{}).style?.display,
      overlayText: (document.getElementById('overlay')||{}).textContent,
      webgl: (()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch(e){return false;}})(),
      glCanvasSize: (()=>{const c=document.getElementById('gl');return c?c.width+'x'+c.height:'none';})(),
      hudStatus: (document.querySelector('.hud-status')||{}).textContent,
    })`,
    returnByValue: true,
  });

  // screenshot
  const shot = await pc.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('tmp', { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  console.log('=== DIAGNOSTICS ===');
  console.log(diag.result.value);
  console.log('=== CONSOLE (' + consoleMsgs.length + ') ===');
  for (const m of consoleMsgs) console.log('  ' + m);
  console.log('=== EXCEPTIONS (' + exceptions.length + ') ===');
  for (const e of exceptions) console.log('  ' + e);
  console.log('=== RESULT ===');
  console.log('ready:', ready, '| screenshot:', OUT);
  const errors = consoleMsgs.filter(m => m.startsWith('[error]')) .concat(exceptions);
  console.log('console errors:', errors.length);
  for (const e of errors) console.log('  ERR: ' + e);

  pc.close(); b.close();
  chrome.kill('SIGTERM');
  process.exit(errors.length > 0 ? 2 : 0);
}

main().catch(e => { console.error('TEST FAILED:', e.message); console.error(chromeErr.slice(-2000)); chrome.kill('SIGTERM'); process.exit(1); });
