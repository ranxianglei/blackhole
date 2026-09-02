// GARGANTUA — main entry: renderer, raytracer, post pipeline, loop, hotkeys, recovery, screenshot API.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RAYTRACER_VERT, RAYTRACER_FRAG, POST_VERT, POST_FRAG } from './shaders.js';
import { PARAMS, QUALITY, QUALITY_ORDER, loadState, saveState } from './params.js';
import { PRESETS, CameraRig } from './camera.js';
import { buildHUD } from './hud.js';
import { AmbientAudio } from './audio.js';

const DEG = Math.PI / 180;
const { state, urlShot } = loadState();
const wantShot = !!urlShot;

// ---- DOM ----
const root = document.getElementById('app');
const overlay = document.getElementById('overlay');
function showOverlay(msg) { overlay.textContent = msg; overlay.style.display = 'flex'; }
function hideOverlay() { overlay.style.display = 'none'; }

// ---- GL state ----
let renderer, scene, camera, controls, rig, composer, rtMat, postPass, bloomPass;
let rtU, postU;
let rafId = 0;
let simTime = state.simTime || 0;
let lastT = performance.now();
let frames = 0, fpsAccum = 0, fps = 0;
let firstFrame = true;
const audio = new AmbientAudio();

function makeRTUniforms() {
  const u = {
    uCamPos: { value: new THREE.Vector3() },
    uCamMat: { value: new THREE.Matrix4() },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uTanFov: { value: Math.tan(30 * DEG) },
    uDebug: { value: state.debug },
    uSteps: { value: state.params.steps | 0 },
    uStepScale: { value: QUALITY[state.quality].stepScale },
    uDiskInner: { value: state.params.diskInner },
    uDiskOuter: { value: state.params.diskOuter },
    uDiskThickness: { value: state.params.diskThickness },
    uDiskBrightness: { value: state.params.diskBrightness },
    uDiskTemp: { value: state.params.diskTemp },
    uDiskOpacity: { value: state.params.diskOpacity },
    uTurbulence: { value: state.params.turbulence },
    uTurbSpeed: { value: state.params.turbSpeed },
    uDoppler: { value: state.params.doppler },
    uRedshift: { value: state.params.redshift },
    uStarBright: { value: state.params.starBright },
    uMilkyWay: { value: state.params.milkyWay },
  };
  return u;
}

function buildGL() {
  // renderer
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gl'),
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: wantShot,
  });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  // scene + fullscreen quad
  scene = new THREE.Scene();
  rtU = makeRTUniforms();
  rtMat = new THREE.ShaderMaterial({
    uniforms: rtU,
    vertexShader: RAYTRACER_VERT,
    fragmentShader: RAYTRACER_FRAG,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rtMat);
  quad.frustumCulled = false;
  scene.add(quad);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // perspective camera (drives the ray origin/direction)
  camera = new THREE.PerspectiveCamera(state.params.fov, 1, 0.1, 200);
  const cam = state.cam || {};
  const preset = PRESETS[state.preset] || PRESETS[0];
  const az = cam.az != null ? cam.az : preset.az;
  const el = cam.el != null ? cam.el : preset.el;
  const dist = cam.dist != null ? cam.dist : preset.dist;
  const e = el * DEG, a = az * DEG;
  camera.position.set(dist * Math.cos(e) * Math.cos(a), dist * Math.cos(e) * Math.sin(a), dist * Math.sin(e));
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 5;
  controls.maxDistance = 90;
  controls.target.set(0, 0, 0);
  controls.update();

  rig = new CameraRig(camera, controls);
  rig.fovTarget = state.params.fov;
  if (state.cinematic) rig.setCinematic(true);

  // composer: raytracer -> bloom -> post
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, ortho));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), state.params.bloomStrength, 0.6, state.params.bloomThreshold);
  composer.addPass(bloomPass);
  postPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uExposure: { value: state.params.exposure },
      uVignette: { value: state.params.vignette },
      uGrain: { value: state.params.grain },
      uChroma: { value: state.params.chroma },
    },
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
  });
  postU = postPass.uniforms;
  composer.addPass(postPass);

  resize();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[state.quality].dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  rtU.uRes.value.copy(size);
  postU.uRes.value.copy(size);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function syncUniforms() {
  const p = state.params;
  rtU.uDiskInner.value = p.diskInner;
  rtU.uDiskOuter.value = p.diskOuter;
  rtU.uDiskThickness.value = p.diskThickness;
  rtU.uDiskBrightness.value = p.diskBrightness;
  rtU.uDiskTemp.value = p.diskTemp;
  rtU.uDiskOpacity.value = p.diskOpacity;
  rtU.uTurbulence.value = p.turbulence;
  rtU.uTurbSpeed.value = p.turbSpeed;
  rtU.uDoppler.value = p.doppler;
  rtU.uRedshift.value = p.redshift;
  rtU.uStarBright.value = p.starBright;
  rtU.uMilkyWay.value = p.milkyWay;
  rtU.uSteps.value = p.steps | 0;
  rtU.uDebug.value = state.debug;
  rtU.uStepScale.value = QUALITY[state.quality].stepScale;
  postU.uExposure.value = p.exposure;
  postU.uVignette.value = p.vignette;
  postU.uGrain.value = p.grain;
  postU.uChroma.value = p.chroma;
  bloomPass.strength = p.bloomStrength;
  bloomPass.threshold = p.bloomThreshold;
}

// ---- HUD wiring ----
const hud = buildHUD(root, state, {
  onParam: (k, v) => { state.params[k] = v; syncUniforms(); if (k === 'fov') rig.fovTarget = v; saveState(state); },
  onQuality: (q) => { state.quality = q; applyQuality(); saveState(state); },
  onDebug: (d) => { state.debug = d; syncUniforms(); hud.syncDebug(); saveState(state); },
  onPreset: (i) => { state.preset = i; state.cinematic = false; rig.setCinematic(false); rig.setPreset(i); hud.syncPreset(); saveState(state); },
  onPlay: () => { state.playing = !state.playing; hud.setPlaying(state.playing); saveState(state); },
  onCinematic: () => { state.cinematic = !state.cinematic; rig.setCinematic(state.cinematic); hud.setCinematic(state.cinematic); saveState(state); },
  onMusic: () => { state.music = audio.toggle(); hud.setMusic(state.music); saveState(state); },
  onReset: () => { resetAll(); },
});

function applyQuality() {
  const q = QUALITY[state.quality];
  state.params.steps = q.steps;
  hud.setParam('steps', q.steps);
  syncUniforms();
  resize();
}

function resetAll() {
  // rebuild defaults
  for (const p of PARAMS) state.params[p.key] = p.def;
  state.quality = 'high'; state.debug = 0; state.cinematic = false; state.playing = true; state.preset = 0;
  rig.setCinematic(false);
  rig.setPreset(0);
  applyQuality();
  hud.setDebug(0); hud.setQuality('high'); hud.setPreset(0); hud.setPlaying(true); hud.setCinematic(false);
  syncUniforms();
  saveState(state);
}

// ---- animation loop ----
function animate(now) {
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (state.playing) simTime += dt * state.params.timeScale;

  rig.update(dt);
  camera.updateMatrixWorld();

  rtU.uTime.value = simTime;
  postU.uTime.value = simTime;
  rtU.uCamPos.value.copy(camera.position);
  rtU.uCamMat.value.copy(camera.matrixWorld);
  rtU.uTanFov.value = Math.tan(camera.fov * 0.5 * DEG);

  composer.render();

  if (firstFrame) { firstFrame = false; hideOverlay(); }
  frames++; fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    fps = Math.round(frames / fpsAccum);
    frames = 0; fpsAccum = 0;
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    hud.updateStatus({ fps, quality: state.quality, steps: state.params.steps | 0, w: size.x | 0, h: size.y | 0, debug: state.debug });
  }
}

// ---- hotkeys ----
function onKey(ev) {
  if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
  const k = ev.key.toLowerCase();
  if (k === ' ') { ev.preventDefault(); state.playing = !state.playing; hud.setPlaying(state.playing); saveState(state); }
  else if (k === 'c') { state.cinematic = !state.cinematic; rig.setCinematic(state.cinematic); hud.setCinematic(state.cinematic); saveState(state); }
  else if (k === 'q') { const i = QUALITY_ORDER.indexOf(state.quality); state.quality = QUALITY_ORDER[(i + 1) % 3]; applyQuality(); hud.setQuality(state.quality); saveState(state); }
  else if (k === 'h') { hud.togglePanel(); }
  else if (k === 'm') { state.music = audio.toggle(); hud.setMusic(state.music); saveState(state); }
  else if (k === 's') { screenshot(); }
  else if (k === 'r') { resetAll(); }
  else if (k === 'f') { toggleFullscreen(); }
  else if (k >= '0' && k <= '9') { state.debug = +k; syncUniforms(); hud.setDebug(+k); saveState(state); }
  else if (k >= '1' && k <= '4') { state.preset = +k - 1; state.cinematic = false; rig.setCinematic(false); rig.setPreset(+k - 1); hud.setPreset(+k - 1); saveState(state); }
}
window.addEventListener('keydown', onKey);

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

// ---- screenshot automation ----
function screenshot() {
  composer.render();
  return renderer.domElement.toDataURL('image/png');
}
window.GARGANTUA = {
  version: '1.0.0',
  screenshot,
  setParams: (obj) => { for (const k in obj) if (k in state.params) state.params[k] = obj[k]; syncUniforms(); saveState(state); },
  getState: () => JSON.parse(JSON.stringify(state)),
  setDebug: (d) => { state.debug = d; syncUniforms(); hud.setDebug(d); },
  setQuality: (q) => { if (QUALITY_ORDER.includes(q)) { state.quality = q; applyQuality(); hud.setQuality(q); } },
};

// ---- WebGL context recovery ----
function onLost(ev) { ev.preventDefault(); cancelAnimationFrame(rafId); showOverlay('WebGL context lost — recovering…'); }
function onRestored() {
  hideOverlay();
  // three.js re-inits the renderer; rebuild composer render targets + sizes
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), state.params.bloomStrength, 0.6, state.params.bloomThreshold);
    composer.addPass(bloomPass);
    postPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
        uExposure: { value: state.params.exposure }, uVignette: { value: state.params.vignette },
        uGrain: { value: state.params.grain }, uChroma: { value: state.params.chroma },
      },
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
    });
    postU = postPass.uniforms;
    composer.addPass(postPass);
    resize();
    lastT = performance.now();
    rafId = requestAnimationFrame(animate);
  } catch (e) { showOverlay('Failed to restore WebGL: ' + e.message); }
}

// ---- boot ----
function boot() {
  try {
    buildGL();
  } catch (e) {
    console.error('[GARGANTUA] init failed:', e);
    showOverlay('WebGL initialization failed: ' + e.message);
    return;
  }
  syncUniforms();
  applyQuality(); // sync step count + DPR to the selected quality tier on load
  saveState(state); // persist the resolved initial state (incl. URL overrides)
  audio.load();
  if (state.music) audio.setEnabled(true);
  window.addEventListener('resize', resize);
  // hide the loading overlay as soon as the first frame is on screen
  const canvas = renderer.domElement;
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  lastT = performance.now();
  rafId = requestAnimationFrame(animate);

  // screenshot automation: capture after first rendered frame
  if (wantShot) {
    requestAnimationFrame(() => {
      const dataUrl = screenshot();
      window.__GARGANTUA_SHOT__ = dataUrl;
      window.__GARGANTUA_READY__ = true;
      if (urlShot === '1' || urlShot === 'download') {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'gargantua.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    });
  } else {
    window.__GARGANTUA_READY__ = true;
  }
}

boot();
