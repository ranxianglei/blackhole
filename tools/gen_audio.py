#!/usr/bin/env python3
"""Generate a seamless-looping ambient drone for GARGANTUA (audio/ambient.wav).

Design: a warm harmonic stack on A1 (55 Hz) — all components are integer
multiples of the fundamental, so over the 24 s loop every sine completes an
integer number of cycles and the loop point is sample-exact. Slow integer-cycle
amplitude modulators add movement. A low-passed noise bed (crossfaded at the
loop boundary) adds "space" texture. Output is 16-bit mono WAV.
"""
import os
import wave
import struct
import numpy as np

SR = 44100
DUR = 24.0
N = int(SR * DUR)
t = np.arange(N) / SR

def sine(freq, phase=0.0):
    # freq must be an integer number of cycles over DUR for a seamless loop
    return np.sin(2 * np.pi * freq * t + phase)

out = np.zeros(N, dtype=np.float64)

# Harmonic stack on 55 Hz (A1): warm, consonant, all loop-periodic.
harmonics = [
    (55.0,  0.55, 1, 0.0),   # (freq, amp, mod_cycles, mod_phase)
    (110.0, 0.40, 2, 0.5),
    (165.0, 0.28, 1, 1.0),
    (220.0, 0.20, 3, 0.0),
    (275.0, 0.12, 2, 1.5),
    (330.0, 0.09, 1, 0.7),
    (440.0, 0.06, 4, 0.3),
    (550.0, 0.03, 2, 1.1),
]
for f, amp, mc, mp in harmonics:
    # slow amplitude modulation (integer cycles -> loop-safe), depth 0.35
    mod = 1.0 - 0.35 * (0.5 + 0.5 * sine(mc, mp))
    out += amp * mod * sine(f)

# A soft fifth shimmer (164.81 Hz is NOT loop-periodic, so use 165 already above).
# Add a gentle overall "breathing" envelope (1 cycle over the loop).
out *= 0.85 + 0.15 * sine(1, 0.0)

# Low-passed noise bed for texture.
rng = np.random.default_rng(1234)
noise = rng.standard_normal(N)
# simple one-pole low-pass (~500 Hz)
alpha = 1.0 - np.exp(-2 * np.pi * 500.0 / SR)
lp = np.zeros(N)
for i in range(1, N):
    lp[i] = lp[i - 1] + alpha * (noise[i] - lp[i - 1])
lp -= lp.mean()
lp /= (np.abs(lp).max() + 1e-9)
# crossfade the loop boundary so the noise is continuous
fade = int(SR * 1.0)  # 1 s crossfade
w = np.linspace(0, 1, fade)
lp[:fade] = lp[:fade] * (1 - w) + lp[N - fade:] * w
lp[-fade:] = lp[-fade:] * (1 - w[::-1]) + lp[:fade] * w[::-1]
out += 0.05 * lp

# normalize to ~0.5 peak, leave headroom
peak = np.abs(out).max()
out = out / peak * 0.5

# 16-bit mono WAV
path = os.path.join(os.path.dirname(__file__), '..', 'audio', 'ambient.wav')
path = os.path.abspath(path)
os.makedirs(os.path.dirname(path), exist_ok=True)
pcm = (out * 32767).astype(np.int16)
with wave.open(path, 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(pcm.tobytes())

print(f"wrote {path}  ({DUR}s, {SR}Hz, {N} samples, peak={peak:.3f})")
