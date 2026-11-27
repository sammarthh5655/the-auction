// Synthesised sound effects (Web Audio) - no audio files, nothing copyrighted.
import { prefs } from './storage.js';

let ctx = null;
let master = null;
const listeners = new Set();

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const isMuted = () => prefs.get('muted', false);
export function setMuted(m) { prefs.set('muted', m); listeners.forEach(f => f(m)); }
export function onMuteChange(f) { listeners.add(f); return () => listeners.delete(f); }

function tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, slide = 0, delay = 0 }) {
  const c = ac(); if (!c || isMuted()) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.3, freq = 1200, q = 0.8, delay = 0, type = 'bandpass', sweep = 0 }) {
  const c = ac(); if (!c || isMuted()) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() { ac(); },
  click() { tone({ freq: 900, type: 'triangle', dur: 0.05, vol: 0.12 }); },
  bid() { tone({ freq: 660, type: 'triangle', dur: 0.09, vol: 0.22 }); tone({ freq: 990, type: 'triangle', dur: 0.12, vol: 0.18, delay: 0.06 }); },
  rivalBid() { tone({ freq: 520, type: 'square', dur: 0.06, vol: 0.07 }); },
  tick() { tone({ freq: 1500, type: 'square', dur: 0.025, vol: 0.06 }); },
  going() { tone({ freq: 784, type: 'sine', dur: 0.35, vol: 0.22 }); tone({ freq: 1175, type: 'sine', dur: 0.5, vol: 0.12, delay: 0.02 }); },
  hammer() {
    tone({ freq: 140, type: 'sine', dur: 0.35, vol: 0.9, slide: -90 });
    noise({ dur: 0.12, vol: 0.6, freq: 2400, q: 0.6 });
    tone({ freq: 70, type: 'triangle', dur: 0.5, vol: 0.5, delay: 0.02 });
  },
  sold() {
    this.hammer();
    noise({ dur: 2.2, vol: 0.18, freq: 900, q: 0.4, delay: 0.15, sweep: 800 });          // crowd swell
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.12, delay: 0.25 + i * 0.09 }));
  },
  unsold() { tone({ freq: 392, type: 'sawtooth', dur: 0.35, vol: 0.08, slide: -150 }); tone({ freq: 294, type: 'sawtooth', dur: 0.5, vol: 0.08, slide: -120, delay: 0.25 }); },
  reveal(big) {
    noise({ dur: big ? 2.6 : 1.6, vol: 0.12, freq: 300, q: 0.7, sweep: 2400, type: 'lowpass' }); // whoosh rise
    tone({ freq: 55, type: 'sine', dur: big ? 2.2 : 1.2, vol: 0.4, slide: 40 });
    if (big) [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.8, vol: 0.1, delay: 1.2 + i * 0.12 }));
  },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.6, vol: 0.15, delay: i * 0.11 })); },
  error() { tone({ freq: 180, type: 'square', dur: 0.12, vol: 0.1 }); },
};

// Optional auctioneer voice (Web Speech API)
export function say(text) {
  if (isMuted() || !prefs.get('voice', true) || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.08; u.pitch = 0.9; u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
