# GARGANTUA — Schwarzschild Black Hole Raytracer

A full-screen, real-time **general-relativistic raytracer** of a non-rotating
(Schwarzschild) black hole, built from scratch with native HTML/CSS/JavaScript,
ES Modules and a locally-vendored Three.js. No build step — serve the folder and
open it.

The entire image is produced by a single **fullscreen fragment shader** that
integrates **null geodesics** of the Schwarzschild metric per pixel. There is no
black sphere, no flat ring, no texture, no video, no screenshot — the event
horizon, photon ring, lensed disk and starfield are all *computed*.

---

## Quick start

Any static file server works (ES Modules require `http://`, not `file://`):

```bash
cd ~/projects/blackhole
python3 -m http.server 8123
# → open http://localhost:8123
```

Alternatives:

```bash
npx serve .            # or
npx http-server -p 8123
```

> Requires a WebGL-capable browser (Chrome/Edge/Firefox/Safari). A GPU is
> strongly recommended; software rendering (SwiftShader) works but is slow at
> high quality.

---

## What you see (and why it's real)

| Feature | How it's produced |
|---|---|
| **Event horizon** | Rays with `r < 2` (in units where `M=G=c=1`) are captured → pure black shadow. The shadow's edge is the photon sphere's critical impact parameter `b_crit = 3√3 ≈ 5.196`. |
| **Photon ring** | Rays skimming `r = 3` loop around the hole before escaping, forming the thin bright ring at the shadow's edge. |
| **Gravitational lensing** | Every ray is bent by the geodesic equation; the background starfield and the far side of the disk are warped into the halo/Einstein-ring images above and below the shadow. |
| **Volumetric accretion disk** | A 3D volume (flaring Gaussian thickness + swirling fbm turbulence), integrated front-to-back with Beer–Lambert absorption — not a 2D plane. Multiple disk crossings (near, far, top, bottom) accumulate naturally. |
| **Doppler beaming** | Keplerian orbital velocity `v = 1/√r`; the approaching side is blueshifted and beamed (`δ³`), the receding side dimmed — the classic asymmetric Gargantua look. |
| **Gravitational redshift** | Photon energy scaled by `√(1 − 2/r)`; inner-disk light is redshifted/dimmed. |
| **Procedural starfield + Milky Way** | Hash-based 3D star layers (twinkling) + a tilted fbm galactic band with dark dust lanes. |
| **Dynamic turbulence** | Differential-rotation swirl (`ω ∝ r^-1.5`) advects the fbm density, so the disk churns over time. |

### Post pipeline
HDR render → **UnrealBloom** (thresholded) → custom pass: **chromatic
aberration**, **ACES** filmic tonemap, **vignette**, **film grain**, sRGB
encode. The black hole stays deep black; the disk stays hot and bright.

---

## Physics core (verified)

Null geodesics in Schwarzschild coordinates (`M = G = c = 1`), vector form:

```
x'' = -3 L² x / r⁵ ,     L² = |x × v|²   (conserved)
```

- Horizon `r = 2`, photon sphere `r = 3`, ISCO `r = 6`, `b_crit = 3√3`.
- Integrated with **RK4** and adaptive step `dt = stepScale · r` (smaller near
  the hole where bending is strongest).
- **Verified** against the exact Schwarzschild deflection integral (mpmath,
  30-digit) to 4 decimal places: `b=10 → 33.8272°` (exact) vs `33.8271°`
  (sim); `b=8 → 49.2016°` vs `49.2015°`; `b=6 → 98.5137°` vs `98.5135°`.
  See `tmp/verify_geodesic.py`, `tmp/definitive2.py`.

---

## Controls

**Mouse / touch:** drag to orbit, wheel / pinch to zoom (OrbitControls).

**Keyboard:**

| Key | Action |
|---|---|
| `Space` | Play / pause time |
| `C` | Toggle cinematic camera loop |
| `1`–`4` | Camera presets (Classic / Overhead / Photon Ring / Orbit) |
| `0`–`9` | Debug views |
| `Q` | Cycle quality (Standard → High → Cinematic) |
| `H` | Show / hide control panel |
| `M` | Toggle ambient music |
| `S` | Save PNG screenshot |
| `R` | Reset all settings |
| `F` | Toggle fullscreen |

### Debug views
`0` Beauty · `1` Steps · `2` Deflection angle · `3` Disk density · `4` Doppler
factor · `5` Gravitational redshift · `6` Temperature · `7` Transmittance ·
`8` Min radius · `9` Photon-sphere proximity.

### Quality tiers
| Tier | Steps | Pixel-ratio cap |
|---|---|---|
| Standard | 300 | 1.0× |
| High | 512 | 1.5× |
| Cinematic | 768 | 2.0× (Retina) |

---

## Parameters (21)

| Group | Parameter | Range | Default |
|---|---|---|---|
| Simulation | Time Scale | 0–3 | 1.0 |
| Accretion Disk | Disk Inner Radius | 3–10 | 6.0 |
| Accretion Disk | Disk Outer Radius | 8–30 | 16.0 |
| Accretion Disk | Disk Thickness | 0.1–3 | 0.9 |
| Accretion Disk | Disk Brightness | 0–10 | 1.3 |
| Accretion Disk | Disk Temperature | 0.3–2 | 1.0 |
| Accretion Disk | Disk Opacity | 0.1–5 | 1.5 |
| Accretion Disk | Turbulence | 0–2 | 1.0 |
| Accretion Disk | Turbulence Speed | 0–3 | 1.0 |
| Relativity | Doppler Beaming | 0–2 | 1.0 |
| Relativity | Gravitational Redshift | 0–2 | 1.0 |
| Background | Star Brightness | 0–3 | 1.3 |
| Background | Milky Way | 0–2 | 0.3 |
| Post | Bloom Strength | 0–3 | 0.5 |
| Post | Bloom Threshold | 0–3 | 1.4 |
| Post | Exposure | 0.2–3 | 0.85 |
| Post | Vignette | 0–1 | 0.5 |
| Post | Film Grain | 0–0.2 | 0.04 |
| Post | Chromatic Aberration | 0–0.02 | 0.004 |
| Camera | Field of View | 30–100 | 60 |
| Quality | Ray Precision (steps) | 128–1024 | 512 |

Settings persist to `localStorage` and can be overridden via URL (below).

---

## URL / screenshot automation API

Every parameter, camera angle, quality and debug view can be set via query
string — ideal for headless capture and sharing exact views.

```
?az=0&el=18&dist=28&fov=60&t=5&quality=high&debug=0&diskBrightness=2.0
```

- `az` / `el` / `dist` — camera azimuth (°), elevation (°), distance.
- `t` — simulation time (deterministic turbulence/stars).
- `quality` — `standard` | `high` | `cinematic`.
- `debug` — `0`–`9`.
- any of the 21 parameter keys (e.g. `doppler`, `diskThickness`).

**Screenshot modes:**

```
?shot=1          # auto-download gargantua.png after first frame
?shot=dataurl    # set window.__GARGANTUA_SHOT__ = "data:image/png;base64,…"
```

**JS API** (available as `window.GARGANTUA` once `window.__GARGANTUA_READY__`
is `true`):

```js
GARGANTUA.screenshot()      // → data URL (PNG)
GARGANTUA.setParams({ diskBrightness: 3, doppler: 1.5 })
GARGANTUA.getState()        // → full state object
GARGANTUA.setDebug(2)
GARGANTUA.setQuality('cinematic')
```

Example headless capture (Chromium):

```
chromium --headless --screenshot=out.png --window-size=1280,720 \
  "http://localhost:8123/?az=0&el=18&dist=28&fov=60&t=5&quality=high"
```

---

## Project structure

```
blackhole/
├── index.html              # entry: import map + canvas + HUD root
├── css/style.css           # HUD / overlay styling
├── js/
│   ├── main.js             # renderer, composer, loop, hotkeys, recovery, API
│   ├── shaders.js          # raytracer + post GLSL (the physics lives here)
│   ├── params.js           # 21 params, quality tiers, persistence, URL parse
│   ├── camera.js           # 4 presets + cinematic loop + transitions
│   ├── hud.js              # DOM HUD (sliders, debug, presets, toggles)
│   └── audio.js            # WebAudio ambient music
├── vendor/three/           # locally vendored three.js (r185) + addons
├── audio/ambient.wav       # generated seamless-loop ambient drone
├── tools/
│   ├── gen_audio.py        # regenerates audio/ambient.wav
│   ├── cdp_test.mjs        # single-URL headless test (console + screenshot)
│   ├── cdp_batch.mjs       # batch: presets / debug / quality
│   ├── cdp_features.mjs    # cinematic / API / mobile / context-recovery
│   └── cdp_api.mjs         # screenshot API / persistence / steps-per-quality
└── tmp/                    # test screenshots + physics verification scripts
```

---

## Testing

Headless-Chromium CDP harnesses (no puppeteer needed; use the system
`chromium-browser`):

```bash
python3 -m http.server 8123 &
node tools/cdp_test.mjs     "http://localhost:8123/index.html" tmp/shot.png
node tools/cdp_batch.mjs    # presets, debug views, quality tiers
node tools/cdp_features.mjs # cinematic, JS API, mobile/Retina, context recovery
node tools/cdp_api.mjs      # screenshot API, persistence, steps-per-quality
```

**Results (Chromium 142, SwiftShader software GL):**

- ✅ Boots with **0 console errors / 0 exceptions** (only a harmless favicon 404).
- ✅ No black screen — overlay hides after first frame.
- ✅ All 4 camera presets render correctly.
- ✅ Debug views 0–9 render (deflection field shows the photon-sphere ring).
- ✅ Quality tiers apply correct step counts (300 / 512 / 768) + DPR caps.
- ✅ Cinematic loop moves the camera.
- ✅ `GARGANTUA.screenshot()` / `setParams()` / `getState()` work.
- ✅ `?shot=dataurl` sets a valid PNG data URL.
- ✅ Mobile/Retina: canvas = viewport × min(devicePixelRatio, tier cap).
- ✅ WebGL context lost → overlay; restored → composer rebuilt, rendering resumes.
- ✅ State persists to `localStorage` and survives reload.
- ✅ Doppler-off (`doppler=0&redshift=0`) yields a symmetric disk (beaming is real).

> Note: at 1280×720 the Cinematic tier (768 steps) is very slow under
> SwiftShader (software GL). On a real GPU it runs interactively.

---

## Audio

`audio/ambient.wav` is a 24 s seamless-looping ambient drone (a harmonic stack
on A1 with slow integer-cycle amplitude modulation + low-passed noise, so the
loop point is sample-exact). Regenerate with:

```bash
python3 tools/gen_audio.py
```

Music is off by default and starts only after a user gesture (browser policy);
toggle with `M` or the 🎵 button.
