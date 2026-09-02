// GARGANTUA — camera rig: 4 view presets, cinematic loop, smooth transitions.
// Spherical convention: pos = dist * (cos(el)cos(az), cos(el)sin(az), sin(el)); el=0 is edge-on.

export const PRESETS = [
  { name: 'Classic',     az: 0.0,  el: 18, dist: 28, fov: 60 },
  { name: 'Overhead',    az: 0.0,  el: 72, dist: 32, fov: 55 },
  { name: 'Photon Ring', az: 0.0,  el: 3,  dist: 17, fov: 50 },
  { name: 'Orbit',       az: 40,   el: 32, dist: 24, fov: 60 },
];

const DEG = Math.PI / 180;

function sphericalToVec3(az, el, dist) {
  const e = el * DEG, a = az * DEG;
  return [dist * Math.cos(e) * Math.cos(a), dist * Math.cos(e) * Math.sin(a), dist * Math.sin(e)];
}

function vec3ToSpherical(x, y, z) {
  const dist = Math.hypot(x, y, z);
  const el = Math.asin(Math.max(-1, Math.min(1, z / dist))) / DEG;
  const az = Math.atan2(y, x) / DEG;
  return { az, el, dist };
}

const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.mode = 'orbit';            // 'orbit' | 'transition' | 'cinematic'
    this.trans = null;              // {from, to, t, dur}
    this.cineT = 0;
    this.fovTarget = 60;
  }

  currentSpherical() {
    const p = this.camera.position;
    return vec3ToSpherical(p.x, p.y, p.z);
  }

  applySpherical(az, el, dist) {
    const [x, y, z] = sphericalToVec3(az, el, dist);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setPreset(i) {
    const p = PRESETS[i];
    if (!p) return;
    this.mode = 'transition';
    this.trans = {
      from: this.currentSpherical(),
      to: { az: p.az, el: p.el, dist: p.dist },
      t: 0, dur: 1.6,
    };
    this.fovTarget = p.fov;
  }

  setCinematic(on) {
    if (on) {
      this.mode = 'cinematic';
      this.cineT = 0;
    } else {
      this.mode = 'orbit';
    }
  }

  // Cinematic path: slow orbit + elevation/dolly drift (smooth, non-repeating feel).
  cineSpherical(t) {
    const az = t * 0.12;
    const el = 22 + 16 * Math.sin(t * 0.06);
    const dist = 25 + 7 * Math.sin(t * 0.043 + 1.0);
    return { az, el, dist };
  }

  update(dt) {
    // fov easing
    const curFov = this.camera.fov;
    if (Math.abs(curFov - this.fovTarget) > 0.05) {
      this.camera.fov = curFov + (this.fovTarget - curFov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === 'cinematic') {
      this.cineT += dt;
      const s = this.cineSpherical(this.cineT);
      this.applySpherical(s.az, s.el, s.dist);
    } else if (this.mode === 'transition' && this.trans) {
      const tr = this.trans;
      tr.t += dt;
      const k = easeInOut(Math.min(1, tr.t / tr.dur));
      // shortest-path azimuth lerp
      let dAz = tr.to.az - tr.from.az;
      if (dAz > 180) dAz -= 360;
      if (dAz < -180) dAz += 360;
      const az = tr.from.az + dAz * k;
      const el = tr.from.el + (tr.to.el - tr.from.el) * k;
      const dist = tr.from.dist + (tr.to.dist - tr.from.dist) * k;
      this.applySpherical(az, el, dist);
      if (tr.t >= tr.dur) this.mode = 'orbit';
    }
    // 'orbit': OrbitControls drives the camera; nothing to do.
  }
}
