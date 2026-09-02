// GARGANTUA — HUD: builds the DOM overlay (sliders, debug views, presets, toggles, status).
import { PARAMS, QUALITY, QUALITY_ORDER } from './params.js';
import { PRESETS } from './camera.js';

const DEBUG_NAMES = ['Beauty', 'Steps', 'Deflection', 'Density', 'Doppler', 'Redshift', 'Temp', 'Transmittance', 'Min Radius', 'Photon Sphere'];

export function buildHUD(root, state, handlers) {
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  const hud = el('div', 'hud');
  root.appendChild(hud);

  // ---- top-left status ----
  const top = el('div', 'hud-top');
  const title = el('div', 'hud-title', 'GARGANTUA');
  const subtitle = el('div', 'hud-sub', 'Schwarzschild Black Hole Raytracer');
  const status = el('div', 'hud-status', '—');
  top.append(title, subtitle, status);
  hud.appendChild(top);

  // ---- panel toggle button ----
  const toggleBtn = el('button', 'hud-toggle', '☰ Controls');
  hud.appendChild(toggleBtn);

  // ---- right panel ----
  const panel = el('div', 'hud-panel');
  hud.appendChild(panel);

  const section = (label) => {
    const s = el('div', 'hud-section');
    s.appendChild(el('div', 'hud-section-title', label));
    panel.appendChild(s);
    return s;
  };

  // parameter sliders, grouped
  const groups = {};
  for (const p of PARAMS) {
    if (!groups[p.group]) groups[p.group] = section(p.group);
    const row = el('div', 'hud-row');
    const lab = el('label', 'hud-label', p.label);
    const val = el('span', 'hud-val', fmt(p.def, p.step));
    const input = el('input');
    input.type = 'range';
    input.min = p.min; input.max = p.max; input.step = p.step;
    input.value = state.params[p.key];
    input.dataset.key = p.key;
    val.textContent = fmt(state.params[p.key], p.step);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      val.textContent = fmt(v, p.step);
      handlers.onParam(p.key, v);
    });
    row.append(lab, input, val);
    groups[p.group].appendChild(row);
  }

  // quality
  const qSec = section('Quality');
  const qRow = el('div', 'hud-btnrow');
  for (const q of QUALITY_ORDER) {
    const b = el('button', 'hud-btn' + (q === state.quality ? ' active' : ''), QUALITY[q].label);
    b.dataset.q = q;
    b.addEventListener('click', () => { handlers.onQuality(q); syncQuality(); });
    qRow.appendChild(b);
  }
  qSec.appendChild(qRow);

  // debug views
  const dSec = section('Debug View');
  const dRow = el('div', 'hud-btnrow hud-debugrow');
  for (let i = 0; i <= 9; i++) {
    const b = el('button', 'hud-btn hud-debug' + (i === state.debug ? ' active' : ''), String(i));
    b.title = DEBUG_NAMES[i];
    b.dataset.d = i;
    b.addEventListener('click', () => { handlers.onDebug(i); syncDebug(); });
    dRow.appendChild(b);
  }
  dSec.appendChild(dRow);
  const dName = el('div', 'hud-debugname', DEBUG_NAMES[state.debug]);
  dSec.appendChild(dName);

  // presets
  const pSec = section('Camera Presets');
  const pRow = el('div', 'hud-btnrow');
  PRESETS.forEach((pr, i) => {
    const b = el('button', 'hud-btn' + (i === state.preset ? ' active' : ''), pr.name);
    b.dataset.p = i;
    b.addEventListener('click', () => { handlers.onPreset(i); syncPreset(); });
    pRow.appendChild(b);
  });
  pSec.appendChild(pRow);

  // toggles
  const tSec = section('Playback');
  const tRow = el('div', 'hud-btnrow');
  const playBtn = el('button', 'hud-btn' + (state.playing ? ' active' : ''), state.playing ? '⏸ Pause' : '▶ Play');
  playBtn.addEventListener('click', () => { handlers.onPlay(); syncPlay(); });
  const cineBtn = el('button', 'hud-btn' + (state.cinematic ? ' active' : ''), '🎬 Cinematic');
  cineBtn.addEventListener('click', () => { handlers.onCinematic(); syncCine(); });
  const musicBtn = el('button', 'hud-btn' + (state.music ? ' active' : ''), '🎵 Music');
  musicBtn.addEventListener('click', () => { handlers.onMusic(); syncMusic(); });
  const resetBtn = el('button', 'hud-btn', '↺ Reset');
  resetBtn.addEventListener('click', () => handlers.onReset());
  tRow.append(playBtn, cineBtn, musicBtn, resetBtn);
  tSec.appendChild(tRow);

  // ---- bottom help ----
  const help = el('div', 'hud-help',
    '<b>Keys</b> Space play · C cinematic · 1–4 presets · 0–9 debug · Q quality · H hide · M music · S screenshot · R reset · F fullscreen · drag orbit · wheel zoom');
  hud.appendChild(help);

  // ---- sync helpers ----
  function syncQuality() {
    qRow.querySelectorAll('.hud-btn').forEach(b => b.classList.toggle('active', b.dataset.q === state.quality));
  }
  function syncDebug() {
    dRow.querySelectorAll('.hud-btn').forEach(b => b.classList.toggle('active', +b.dataset.d === state.debug));
    dName.textContent = DEBUG_NAMES[state.debug];
  }
  function syncPreset() {
    pRow.querySelectorAll('.hud-btn').forEach(b => b.classList.toggle('active', +b.dataset.p === state.preset));
  }
  function syncPlay() { playBtn.textContent = state.playing ? '⏸ Pause' : '▶ Play'; playBtn.classList.toggle('active', state.playing); }
  function syncCine() { cineBtn.classList.toggle('active', state.cinematic); }
  function syncMusic() { musicBtn.classList.toggle('active', state.music); }

  let panelOpen = true;
  function togglePanel() {
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    toggleBtn.classList.toggle('active', panelOpen);
  }
  toggleBtn.addEventListener('click', togglePanel);
  panel.classList.add('open');
  toggleBtn.classList.add('active');

  function updateStatus(s) {
    status.textContent = `${s.fps} fps · ${QUALITY[s.quality].label} · ${s.steps} steps · ${s.w}×${s.h} · ${DEBUG_NAMES[s.debug]}`;
  }

  function setParam(key, v) {
    const p = PARAMS.find(x => x.key === key);
    if (!p) return;
    const inp = panel.querySelector(`input[type=range][data-key="${key}"]`);
    if (inp) {
      inp.value = v;
      const val = inp.parentElement.querySelector('.hud-val');
      if (val) val.textContent = fmt(v, p.step);
    }
  }

  return {
    updateStatus, setParam, syncDebug, syncQuality, syncPreset, syncPlay, syncCine, syncMusic,
    togglePanel,
    setDebug: (d) => { state.debug = d; syncDebug(); },
    setQuality: (q) => { state.quality = q; syncQuality(); },
    setPreset: (i) => { state.preset = i; syncPreset(); },
    setPlaying: (b) => { state.playing = b; syncPlay(); },
    setCinematic: (b) => { state.cinematic = b; syncCine(); },
    setMusic: (b) => { state.music = b; syncMusic(); },
    panel,
  };
}

function fmt(v, step) {
  if (step >= 1) return String(Math.round(v));
  const dec = step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return v.toFixed(dec);
}
