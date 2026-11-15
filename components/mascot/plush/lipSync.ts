"use client";

/* Three-free on purpose: re-exported from the package index (main bundle). */

/**
 * Optional: drive the mouth from real audio while it plays, instead of the
 * procedural flap. Pass the <audio>/<video> element that is speaking, or null.
 * Visemes are estimated from loudness and spectral balance — convincing at
 * mascot scale, though not phoneme-accurate.
 */
let lipSource: { analyser: AnalyserNode; time: Uint8Array<ArrayBuffer>; freq: Uint8Array<ArrayBuffer> } | null = null;
let audioCtx: AudioContext | null = null;
const wired = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export function setMascotLipSyncAudio(el: HTMLMediaElement | null) {
  if (!el) {
    lipSource = null;
    return;
  }
  audioCtx ??= new AudioContext();
  void audioCtx.resume();
  let src = wired.get(el);
  if (!src) {
    src = audioCtx.createMediaElementSource(el);
    wired.set(el, src);
  }
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.5;
  src.connect(analyser);
  analyser.connect(audioCtx.destination);
  lipSource = {
    analyser,
    time: new Uint8Array(analyser.fftSize),
    freq: new Uint8Array(analyser.frequencyBinCount),
  };
}

/** Returns [open, round(O), wide(E)] in 0…1, or null when no audio is attached. */
export function readAudioVisemes(): [number, number, number] | null {
  if (!lipSource) return null;
  const { analyser, time, freq } = lipSource;
  analyser.getByteTimeDomainData(time);
  let sum = 0;
  for (let i = 0; i < time.length; i++) {
    const v = (time[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / time.length);
  analyser.getByteFrequencyData(freq);
  // low (≈100–800 Hz) vs high (≈1.5–4 kHz) energy → rounded vs spread lips
  const bin = (hz: number) => Math.round((hz / (analyser.context.sampleRate / 2)) * freq.length);
  let lo = 0;
  let hi = 0;
  for (let i = bin(100); i < bin(800); i++) lo += freq[i];
  for (let i = bin(1500); i < bin(4000); i++) hi += freq[i];
  const total = lo + hi + 1;
  const open = Math.min(1, Math.max(0, (rms - 0.02) * 6));
  return [open, (lo / total) * open, (hi / total) * open];
}

