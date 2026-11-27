// Decides between the 3D reveal and the animated 2D card (weak phones, no WebGL, reduced motion).
import { prefs } from '../lib/storage.js';

let webgl = null;
export function canUse3D() {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    webgl = !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { webgl = false; }
  return webgl;
}

export function isWeakDevice() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return mem <= 2 || (mobile && (mem <= 4 || cores <= 4));
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 'auto' | '3d' | '2d' preference -> actual mode for this device. */
export function revealMode() {
  const pref = prefs.get('reveal', 'auto');
  if (pref === '2d' || !canUse3D()) return '2d';
  if (pref === '3d') return '3d';
  if (reduced() || isWeakDevice() || sessionStorage.getItem('the-auction:slow3d')) return '2d';
  return '3d';
}

export function markSlow() { try { sessionStorage.setItem('the-auction:slow3d', '1'); } catch { /* */ } }
