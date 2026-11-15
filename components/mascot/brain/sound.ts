/**
 * Tiny synthesized sound set (no audio files): pop, chime, hmm, giggle,
 * snore. Off by default; it only plays after the user turned sound on, and
 * the AudioContext is created lazily on a user gesture (autoplay policy).
 */

export type SoundName = "pop" | "chime" | "hmm" | "giggle" | "snore" | "whoosh";

let ctx: AudioContext | null = null;
let enabled = false;
let master: GainNode | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) ensure();
}

export function soundEnabled() {
  return enabled;
}

function ensure() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", glide = 0, vol = 1) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + glide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(start: number, dur: number, freq: number, vol = 0.5) {
  if (!ctx || !master) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(start);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + 0.01;
  switch (name) {
    case "pop":
      tone(420, t, 0.12, "sine", 520, 0.9);
      break;
    case "chime":
      tone(880, t, 0.5, "sine", 0, 0.6);
      tone(1320, t + 0.09, 0.6, "sine", 0, 0.45);
      break;
    case "hmm":
      tone(180, t, 0.45, "triangle", 30, 0.35);
      tone(360, t, 0.45, "sine", 60, 0.15);
      break;
    case "giggle":
      for (let i = 0; i < 4; i++) tone(700 + i * 60, t + i * 0.07, 0.06, "sine", 200, 0.5);
      break;
    case "snore":
      noise(t, 1.1, 260, 0.5);
      break;
    case "whoosh":
      noise(t, 0.35, 1200, 0.25);
      break;
  }
}
