// GARGANTUA — parameter definitions, quality presets, persistence, URL parsing.

// 21 user-facing parameters. `key` maps to a shader uniform (or is handled in JS).
export const PARAMS = [
  { key: 'timeScale',     label: 'Time Scale',          min: 0,    max: 3,    step: 0.01, def: 1.0,  group: 'Simulation' },
  { key: 'diskInner',     label: 'Disk Inner Radius',   min: 3,    max: 10,   step: 0.1,  def: 6.0,  group: 'Accretion Disk' },
  { key: 'diskOuter',     label: 'Disk Outer Radius',   min: 8,    max: 30,   step: 0.5,  def: 16.0, group: 'Accretion Disk' },
  { key: 'diskThickness', label: 'Disk Thickness',      min: 0.1,  max: 3,    step: 0.05, def: 0.9,  group: 'Accretion Disk' },
  { key: 'diskBrightness',label: 'Disk Brightness',     min: 0,    max: 10,   step: 0.1,  def: 1.3,  group: 'Accretion Disk' },
  { key: 'diskTemp',      label: 'Disk Temperature',    min: 0.3,  max: 2,    step: 0.05, def: 1.0,  group: 'Accretion Disk' },
  { key: 'diskOpacity',   label: 'Disk Opacity',        min: 0.1,  max: 5,    step: 0.1,  def: 1.5,  group: 'Accretion Disk' },
  { key: 'turbulence',    label: 'Turbulence',          min: 0,    max: 2,    step: 0.05, def: 1.0,  group: 'Accretion Disk' },
  { key: 'turbSpeed',     label: 'Turbulence Speed',    min: 0,    max: 3,    step: 0.05, def: 1.0,  group: 'Accretion Disk' },
  { key: 'doppler',       label: 'Doppler Beaming',     min: 0,    max: 2,    step: 0.05, def: 1.0,  group: 'Relativity' },
  { key: 'redshift',      label: 'Gravitational Redshift', min: 0, max: 2,    step: 0.05, def: 1.0,  group: 'Relativity' },
  { key: 'starBright',    label: 'Star Brightness',     min: 0,    max: 3,    step: 0.05, def: 1.3,  group: 'Background' },
  { key: 'milkyWay',      label: 'Milky Way',           min: 0,    max: 2,    step: 0.05, def: 0.3,  group: 'Background' },
  { key: 'bloomStrength', label: 'Bloom Strength',      min: 0,    max: 3,    step: 0.05, def: 0.5,  group: 'Post' },
  { key: 'bloomThreshold',label: 'Bloom Threshold',     min: 0,    max: 3,    step: 0.05, def: 1.4,  group: 'Post' },
  { key: 'exposure',      label: 'Exposure',            min: 0.2,  max: 3,    step: 0.05, def: 0.85, group: 'Post' },
  { key: 'vignette',      label: 'Vignette',            min: 0,    max: 1,    step: 0.02, def: 0.5,  group: 'Post' },
  { key: 'grain',         label: 'Film Grain',          min: 0,    max: 0.2,  step: 0.005,def: 0.04, group: 'Post' },
  { key: 'chroma',        label: 'Chromatic Aberration',min: 0,    max: 0.02, step: 0.0005,def: 0.004,group: 'Post' },
  { key: 'fov',           label: 'Field of View',       min: 30,   max: 100,  step: 1,    def: 60,   group: 'Camera' },
  { key: 'steps',         label: 'Ray Precision',       min: 128,  max: 1024, step: 32,   def: 512,  group: 'Quality' },
];

export const PARAM_KEYS = PARAMS.map(p => p.key);

// Quality tiers: integration steps, adaptive step scale, pixel-ratio cap, bloom resolution.
export const QUALITY = {
  standard:  { steps: 300, stepScale: 0.05,  dpr: 1.0, bloomRes: 0.5, label: 'Standard' },
  high:      { steps: 512, stepScale: 0.05,  dpr: 1.5, bloomRes: 1.0, label: 'High' },
  cinematic: { steps: 768, stepScale: 0.045, dpr: 2.0, bloomRes: 1.0, label: 'Cinematic' },
};
export const QUALITY_ORDER = ['standard', 'high', 'cinematic'];

export function defaultState() {
  const params = {};
  for (const p of PARAMS) params[p.key] = p.def;
  return {
    params,
    quality: 'high',
    debug: 0,
    cinematic: false,
    playing: true,
    music: false,
    preset: 0, // last camera preset index
  };
}

const LS_KEY = 'gargantua.state.v1';

// Merge saved/URL state over defaults. Returns { state, urlShot }.
export function loadState() {
  const state = defaultState();
  // 1) localStorage
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.params) for (const k of PARAM_KEYS) if (typeof saved.params[k] === 'number') state.params[k] = saved.params[k];
      if (QUALITY_ORDER.includes(saved.quality)) state.quality = saved.quality;
      if (typeof saved.debug === 'number') state.debug = saved.debug;
      if (typeof saved.cinematic === 'boolean') state.cinematic = saved.cinematic;
      if (typeof saved.playing === 'boolean') state.playing = saved.playing;
      if (typeof saved.music === 'boolean') state.music = saved.music;
      if (typeof saved.preset === 'number') state.preset = saved.preset;
    }
  } catch (e) { /* ignore corrupt state */ }

  // 2) URL query overrides (highest priority) — enables screenshot automation
  const url = new URLSearchParams(location.search);
  let shot = null;
  if (url.has('shot')) shot = url.get('shot');
  if (url.has('quality') && QUALITY_ORDER.includes(url.get('quality'))) state.quality = url.get('quality');
  if (url.has('debug')) { const d = parseInt(url.get('debug'), 10); if (!isNaN(d)) state.debug = d; }
  if (url.has('cinematic')) state.cinematic = url.get('cinematic') === '1';
  if (url.has('music')) state.music = url.get('music') === '1';
  if (url.has('t')) { const t = parseFloat(url.get('t')); if (!isNaN(t)) state.simTime = t; }
  for (const k of PARAM_KEYS) {
    if (url.has(k)) { const v = parseFloat(url.get(k)); if (!isNaN(v)) state.params[k] = v; }
  }
  // camera overrides
  state.cam = {};
  if (url.has('az')) state.cam.az = parseFloat(url.get('az'));
  if (url.has('el')) state.cam.el = parseFloat(url.get('el'));
  if (url.has('dist')) state.cam.dist = parseFloat(url.get('dist'));
  if (url.has('fov')) state.params.fov = parseFloat(url.get('fov'));
  return { state, urlShot: shot };
}

export function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      params: state.params,
      quality: state.quality,
      debug: state.debug,
      cinematic: state.cinematic,
      playing: state.playing,
      music: state.music,
      preset: state.preset,
    }));
  } catch (e) { /* storage may be unavailable */ }
}
