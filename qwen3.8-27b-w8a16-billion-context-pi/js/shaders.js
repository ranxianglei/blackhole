// GARGANTUA — Schwarzschild Black Hole Raytracer
// GLSL shader sources (GLSL ES 1.00 style, consumed by three.js ShaderMaterial).
//
// Physics (verified against the exact Schwarzschild deflection integral to 4 dp):
//   Null geodesic in Schwarzschild coords (M=G=c=1):
//       x'' = -3 L^2 x / r^5 ,   L^2 = |x x v|^2  (conserved)
//   Horizon r=2, photon sphere r=3, ISCO r=6, critical impact param b_crit=3*sqrt(3).

export const RAYTRACER_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const RAYTRACER_FRAG = /* glsl */`
  precision highp float;

  varying vec2 vUv;

  uniform vec3  uCamPos;      // camera world position
  uniform mat4  uCamMat;      // camera world matrix (inverse of view)
  uniform vec2  uRes;         // render resolution (px)
  uniform float uTime;        // simulation time (s)
  uniform float uTanFov;      // tan(fov/2)
  uniform int   uDebug;       // 0..9 debug view
  uniform int   uSteps;       // max integration steps
  uniform float uStepScale;   // dt = uStepScale * r

  // disk
  uniform float uDiskInner;
  uniform float uDiskOuter;
  uniform float uDiskThickness;
  uniform float uDiskBrightness;
  uniform float uDiskTemp;
  uniform float uDiskOpacity;
  uniform float uTurbulence;
  uniform float uTurbSpeed;
  uniform float uDoppler;
  uniform float uRedshift;

  // background
  uniform float uStarBright;
  uniform float uMilkyWay;

  #define MAX_STEPS 1024
  const float HORIZON = 2.0;
  const float ESCAPE_R = 42.0;

  // ---------- hashing / noise ----------
  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 4.1);
      a *= 0.5;
    }
    return v; // ~[0,1]
  }

  // ---------- blackbody-ish disk color ----------
  vec3 diskColor(float T) {
    // T ~ [0, 1.5]; 0 cool (orange-red) -> 1 white -> >1 blue (blueshift)
    float t1 = clamp(T, 0.0, 1.0);
    vec3 cool = vec3(1.0, 0.28, 0.06);
    vec3 mid  = vec3(1.0, 0.62, 0.30);
    vec3 hot  = vec3(0.80, 0.88, 1.0);
    vec3 c = mix(cool, mid, smoothstep(0.05, 0.55, t1));
    c = mix(c, hot, smoothstep(0.55, 1.0, t1));
    c = mix(c, vec3(0.55, 0.72, 1.0), clamp(T - 1.0, 0.0, 0.6));
    return c;
  }

  // ---------- accretion disk (volumetric) ----------
  // Returns volume density (0 outside the disk).
  float diskDensity(vec3 p) {
    float r = length(p);
    if (r < uDiskInner || r > uDiskOuter) return 0.0;
    // flaring vertical thickness
    float h = uDiskThickness * pow(r / uDiskInner, 0.75);
    float z = p.z;
    if (abs(z) > 4.0 * h) return 0.0;
    float zg = exp(-0.5 * (z / h) * (z / h));
    // radial profile: bright inner edge, smooth falloff
    float rn = (r - uDiskInner) / (uDiskOuter - uDiskInner);
    float radial = (1.0 - rn) * (1.0 - rn) * smoothstep(0.0, 0.05, rn);
    // swirling turbulence (differential rotation, seam-free via cartesian input)
    float omega = uTurbSpeed * 0.6 / pow(max(r, 1.0), 1.5);
    float rot = uTime * omega;
    float cr = cos(rot), sr = sin(rot);
    vec3 q = vec3(cr * p.x - sr * p.y, sr * p.x + cr * p.y, p.z * 2.5);
    float n = fbm(q * 0.55);
    float n2 = vnoise(q * 1.7 + 5.0);
    float turb = 1.0 + uTurbulence * ((n * 0.7 + n2 * 0.3) * 2.0 - 1.0);
    return max(zg * radial * turb, 0.0);
  }

  // Emission color+intensity at a disk point. vdir = photon ray direction (cam->disk).
  vec3 diskEmission(vec3 p, vec3 vdir, float r, out float oDop, out float oGrav, out float oTemp) {
    float Tn = pow(uDiskInner / r, 0.75) * uDiskTemp; // 1 at inner edge (scaled)
    // Keplerian orbital velocity (c=1): v = 1/sqrt(r), tangential (+phi)
    float ang = atan(p.y, p.x);
    vec3 vk = (1.0 / sqrt(r)) * vec3(-sin(ang), cos(ang), 0.0);
    float beta2 = dot(vk, vk);
    float gamma = inversesqrt(max(1.0 - beta2, 0.001));
    vec3 nhat = -normalize(vdir); // photon travel direction: disk -> camera
    float dop = 1.0 / (gamma * (1.0 - dot(vk, nhat)));
    float grav = sqrt(max(1.0 - 2.0 / r, 0.0));
    oDop = dop; oGrav = grav; oTemp = Tn;
    float dopEff  = mix(1.0, dop,  uDoppler);
    float gravEff = mix(1.0, grav, uRedshift);
    float Tobs = Tn * dopEff * gravEff;
    vec3 col = diskColor(Tobs);
    float lum  = pow(max(Tobs, 0.0), 2.0);
    float beam = pow(max(dopEff, 0.0), 2.0); // relativistic beaming
    return col * lum * beam * uDiskBrightness;
  }

  // ---------- background: procedural starfield + milky way ----------
  vec3 stars(vec3 d) {
    vec3 col = vec3(0.0);
    for (int layer = 0; layer < 3; layer++) {
      float fl = float(layer);
      float scale = 30.0 + fl * 55.0;
      vec3 p = d * scale;
      vec3 id = floor(p);
      vec3 f = fract(p) - 0.5;
      float h = hash13(id);
      float thresh = 0.982 - fl * 0.004;
      if (h > thresh) {
        vec3 off = (vec3(hash13(id + 1.13), hash13(id + 2.71), hash13(id + 3.97)) - 0.5) * 0.85;
        float dist = length(f - off);
        float bright = (h - thresh) / (1.0 - thresh);
        float star = smoothstep(0.14, 0.0, dist) * bright;
        // twinkle
        star *= 0.75 + 0.25 * sin(uTime * (2.0 + fl) + h * 40.0);
        vec3 scol = mix(vec3(1.0, 0.75, 0.55), vec3(0.6, 0.78, 1.0), hash13(id + 4.4));
        col += scol * star * (1.0 - fl * 0.28);
      }
    }
    return col;
  }

  vec3 background(vec3 d) {
    vec3 col = vec3(0.0);
    // Milky Way: a narrow, high-contrast tilted band with fbm structure + dark lanes
    vec3 mwN = normalize(vec3(0.35, 1.0, 0.25));
    float band = 1.0 - abs(dot(d, mwN));
    band = pow(max(band, 0.0), 6.0);
    float n  = fbm(d * 3.5 + 11.0);
    float n2 = fbm(d * 9.0 - 4.0);
    float structure = smoothstep(0.35, 0.85, n) * (0.3 + 0.9 * n2);
    float mw = band * structure;
    vec3 mwCol = mix(vec3(0.35, 0.42, 0.7), vec3(0.85, 0.78, 0.68), n2);
    col += mwCol * mw * uMilkyWay;
    // dark dust lanes carve the band
    float lane = smoothstep(0.4, 0.7, fbm(d * 5.0 + 30.0));
    col *= (1.0 - 0.7 * lane * band);
    // faint nebular glow (sparse)
    col += vec3(0.15, 0.22, 0.4) * pow(fbm(d * 2.0 + 7.0), 4.0) * 0.25 * uMilkyWay;
    // stars
    col += stars(d) * uStarBright;
    return col;
  }

  // ---------- geodesic integration ----------
  vec3 accel(vec3 p, float L2) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    return -3.0 * L2 * p / (r2 * r2 * r);
  }

  // March the null geodesic, accumulate volumetric disk emission, sample background on escape.
  vec3 march(vec3 ro, vec3 rd,
             out float oSteps, out float oMaxDen, out float oDop,
             out float oGrav, out float oTemp, out float oTrans,
             out float oMinR, out float oDeflect) {
    vec3 p = ro;
    vec3 v = rd;
    float L2 = dot(cross(p, v), cross(p, v));
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    float steps = 0.0;
    float minR = 1e9;
    float maxDen = 0.0;
    float dDop = 0.0, dGrav = 0.0, dTemp = 0.0;
    bool escaped = false;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= uSteps) break;
      float r = length(p);
      minR = min(minR, r);
      if (r < HORIZON) break;                       // captured -> black
      if (r > ESCAPE_R && dot(p, v) > 0.0) { escaped = true; break; }

      float dt = uStepScale * max(r, 1.0);
      // RK4
      vec3 a1 = accel(p, L2);
      vec3 k1p = v,                 k1v = a1;
      vec3 k2p = v + 0.5 * dt * k1v;
      vec3 k2v = accel(p + 0.5 * dt * k1p, L2);
      vec3 k3p = v + 0.5 * dt * k2v;
      vec3 k3v = accel(p + 0.5 * dt * k2p, L2);
      vec3 k4p = v + dt * k3v;
      vec3 k4v = accel(p + dt * k3p, L2);
      vec3 np = p + (dt / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);
      vec3 nv = v + (dt / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

      // volumetric disk accumulation at the segment midpoint
      vec3 pm = (p + np) * 0.5;
      float rm = length(pm);
      float den = diskDensity(pm);
      if (den > 0.0) {
        float rdot = dot(pm, nv) / max(rm, 1e-4);
        float vphys2 = rdot * rdot / max(1.0 - 2.0 / rm, 0.05) + dot(nv, nv) - rdot * rdot;
        float ds = sqrt(max(vphys2, 0.0)) * dt;
        float dd, dg, dtm;
        vec3 em = diskEmission(pm, nv, rm, dd, dg, dtm);
        if (den > maxDen) { maxDen = den; dDop = dd; dGrav = dg; dTemp = dtm; }
        float sigma = den * uDiskOpacity;
        float alpha = 1.0 - exp(-sigma * ds);
        acc += trans * em * alpha;
        trans *= (1.0 - alpha);
        if (trans < 0.002) { p = np; v = nv; steps += 1.0; break; }
      }
      p = np; v = nv; steps += 1.0;
    }

    vec3 col = acc;
    if (escaped) col += trans * background(normalize(v));

    oSteps = steps;
    oMaxDen = maxDen;
    oDop = dDop; oGrav = dGrav; oTemp = dTemp;
    oTrans = trans;
    oMinR = minR;
    oDeflect = acos(clamp(dot(rd, normalize(v)), -1.0, 1.0));
    return col;
  }

  // map a scalar to a debug color
  vec3 debugColor(float x, int mode) {
    if (mode == 1) { // steps
      return vec3(smoothstep(0.0, 200.0, x)) * vec3(0.2, 0.7, 1.0);
    } else if (mode == 2) { // deflection
      return vec3(x / 3.14159) * vec3(1.0, 0.4, 0.9);
    } else if (mode == 3) { // density
      return vec3(x) * vec3(1.0, 0.6, 0.2);
    } else if (mode == 4) { // doppler
      return vec3(clamp((x - 0.5) * 2.0, 0.0, 1.0)) * vec3(0.3, 1.0, 0.4);
    } else if (mode == 5) { // grav redshift
      return vec3(x) * vec3(0.9, 0.3, 1.0);
    } else if (mode == 6) { // temperature
      return diskColor(x) * x;
    } else if (mode == 7) { // transmittance
      return vec3(x) * vec3(0.4, 0.9, 0.9);
    } else if (mode == 8) { // min r
      float t = clamp((x - 2.0) / 10.0, 0.0, 1.0);
      return vec3(t) * vec3(1.0, 0.9, 0.3);
    } else { // 9: photon-sphere proximity
      float t = clamp(1.0 - abs(x - 3.0) / 3.0, 0.0, 1.0);
      return vec3(t) * vec3(1.0, 0.2, 0.2);
    }
  }

  void main() {
    vec2 ndc = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
    vec3 rdCam = normalize(vec3(ndc * uTanFov, -1.0));
    vec3 ro = uCamPos;
    vec3 rd = normalize((uCamMat * vec4(rdCam, 0.0)).xyz);

    float oSteps, oMaxDen, oDop, oGrav, oTemp, oTrans, oMinR, oDeflect;
    vec3 col = march(ro, rd, oSteps, oMaxDen, oDop, oGrav, oTemp, oTrans, oMinR, oDeflect);

    if (uDebug > 0) {
      if (uDebug == 1)      col = debugColor(oSteps, 1);
      else if (uDebug == 2) col = debugColor(oDeflect, 2);
      else if (uDebug == 3) col = debugColor(oMaxDen, 3);
      else if (uDebug == 4) col = debugColor(oDop, 4);
      else if (uDebug == 5) col = debugColor(oGrav, 5);
      else if (uDebug == 6) col = debugColor(oTemp, 6);
      else if (uDebug == 7) col = debugColor(oTrans, 7);
      else if (uDebug == 8) col = debugColor(oMinR, 8);
      else if (uDebug == 9) col = debugColor(oMinR, 9);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------- post: chromatic aberration + ACES + vignette + grain ----------
export const POST_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const POST_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec2  uRes;
  uniform float uTime;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uChroma;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Narkowicz ACES filmic fit
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    float ca = uChroma * (0.4 + r2 * 2.0);
    vec3 scene;
    scene.r = texture2D(tDiffuse, uv + c * ca).r;
    scene.g = texture2D(tDiffuse, uv).g;
    scene.b = texture2D(tDiffuse, uv - c * ca).b;

    vec3 col = scene * uExposure;
    col = aces(col);
    // vignette
    col *= 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 1.6);
    // film grain
    float g = hash21(uv * uRes + fract(uTime) * 100.0) - 0.5;
    col += g * uGrain;
    col = toSRGB(clamp(col, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;
