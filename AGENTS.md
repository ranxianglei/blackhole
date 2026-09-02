# AGENTS.md — GARGANTUA (Schwarzschild Black Hole Raytracer)

Real-time GR black-hole raytracer. Native HTML/CSS/JS + ES Modules + **local**
Three.js. **No build step** — must run from a static server.

## Hard constraints (do not violate)
- The black hole MUST be rendered by integrating **Schwarzschild null
  geodesics in a fragment shader**. Never fake it with a black sphere, flat
  ring, texture, video, or screenshot.
- Keep Three.js **vendored locally** in `vendor/three/` (no CDN, no npm at
  runtime). The import map in `index.html` maps `three` and `three/addons/`
  to `vendor/`. If you upgrade three, re-copy the whole needed subtree
  (build + examples/jsm) and keep the relative import structure intact.
- No new runtime dependencies. No bundler.

## Where things live
- **Physics + all rendering**: `js/shaders.js` → `RAYTRACER_FRAG`. The geodesic
  is `x'' = -3 L² x / r⁵` (L²=|x×v|² conserved, M=G=c=1), RK4, adaptive
  `dt = uStepScale·r`. Horizon r=2, photon sphere r=3, b_crit=3√3.
- **Post** (bloom→CA→ACES→vignette→grain→sRGB): `js/shaders.js` → `POST_FRAG`
  + `js/main.js` composer. ACES/sRGB are done manually; renderer uses
  `NoToneMapping` + `LinearSRGBColorSpace` to avoid double tonemapping.
- **Params (21) + quality tiers + persistence + URL parse**: `js/params.js`.
- **Camera presets + cinematic**: `js/camera.js`.
- **HUD DOM**: `js/hud.js`. **Audio**: `js/audio.js`. **Entry**: `js/main.js`.

## Gotchas
- **SwiftShader (headless) is very slow** at high step counts / 1280×720.
  Test Cinematic tier at a small window (e.g. 640×360) or Standard quality.
  Real GPUs are fine.
- The raytracer reads the **perspective** camera's `position`/`matrixWorld`
  via uniforms (`uCamPos`, `uCamMat`); the fullscreen quad is rendered with an
  ortho camera. Don't mix these up.
- `uRes` must equal the **drawing-buffer** size (`renderer.getDrawingBufferSize`),
  updated on every resize/quality change.
- HUD sliders are matched by `data-key` (NOT by min/max/step — several params
  share identical ranges). Keep `data-key` in sync if you add params.
- Quality tier sets the `steps` param on load and on change (`applyQuality`);
  the manual "Ray Precision" slider can override it.
- State is saved to `localStorage` on load and on every interaction. URL query
  params override localStorage (highest priority) — this powers screenshots.

## Run / test
```bash
python3 -m http.server 8123        # then open http://localhost:8123
node tools/cdp_test.mjs            # single-URL headless check (0 errors expected)
node tools/cdp_batch.mjs           # presets / debug / quality
node tools/cdp_features.mjs        # cinematic / API / mobile / context recovery
node tools/cdp_api.mjs             # screenshot API / persistence
python3 tools/gen_audio.py         # regenerate audio/ambient.wav
```

## Definition of done
No console errors, no black screen, all presets/debug/quality/cinematic work,
screenshot API + persistence + mobile + WebGL-recovery verified, disk has real
3D volume (not a 2D plane).
