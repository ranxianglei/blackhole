// GARGANTUA — optional ambient music (WebAudio). Loads audio/ambient.wav, loops it.
// Browsers require a user gesture to start audio; we arm on first interaction.

export class AmbientAudio {
  constructor(url = 'audio/ambient.wav') {
    this.url = url;
    this.ctx = null;
    this.gain = null;
    this.source = null;
    this.buffer = null;
    this.enabled = false;
    this.ready = false;
    this._armed = false;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.0;
      this.gain.connect(this.ctx.destination);
    }
  }

  async load() {
    try {
      this._ensureCtx();
      const res = await fetch(this.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arr);
      this.ready = true;
    } catch (e) {
      console.warn('[GARGANTUA] ambient audio unavailable:', e.message);
      this.ready = false;
    }
  }

  _startSource() {
    if (!this.buffer || this.source) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.gain);
    src.start(0);
    this.source = src;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) {
      this._ensureCtx();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._startSource();
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(0.5, t, 1.2); // gentle fade-in
    } else if (this.gain) {
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(0.0, t, 0.6);
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }
}
