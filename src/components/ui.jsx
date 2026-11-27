import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { sfx } from '../lib/sound.js';

export function Button({ variant = '', size = '', className = '', onClick, children, ...rest }) {
  return (
    <button className={`btn ${variant} ${size} ${className}`} onClick={e => { sfx.click(); onClick?.(e); }} {...rest}>
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} disabled={disabled} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Stepper({ value, onChange, min = -Infinity, max = Infinity, step = 1, unit, disabled, width }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = v => {
    let n = Number(v);
    if (!Number.isFinite(n)) n = value;
    n = Math.min(max, Math.max(min, n));
    n = Math.round(n / step) * step;
    n = Number(n.toFixed(4));
    setText(String(n)); if (n !== value) onChange(n);
  };
  return (
    <div className="stepper" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <button type="button" onClick={() => commit(value - step)} aria-label="decrease">−</button>
      <input value={text} style={width ? { width } : undefined} inputMode="decimal" onChange={e => setText(e.target.value)} onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(e.target.value); }} />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" onClick={() => commit(value + step)} aria-label="increase">+</button>
    </div>
  );
}

export function Seg({ value, options, onChange, disabled }) {
  return (
    <div className="seg" style={disabled ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
      {options.map(o => (
        <button type="button" key={o.value} className={value === o.value ? 'on' : ''} onClick={() => { sfx.click(); onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Chips({ values = [], options, onChange, disabled, allLabel = 'All' }) {
  const toggle = v => onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  return (
    <div className="chips" style={disabled ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
      <button type="button" className={`chip ${values.length === 0 ? 'on' : ''}`} onClick={() => onChange([])}>{allLabel}</button>
      {options.map(o => (
        <button type="button" key={o.value} className={`chip ${values.includes(o.value) ? 'on' : ''}`} onClick={() => toggle(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={wide ? { width: 'min(1040px, 100%)' } : undefined} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = '') => {
    const id = Math.random();
    setItems(x => [...x.slice(-3), { id, text, kind }]);
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{items.map(i => <div key={i.id} className={`toast ${i.kind}`}>{i.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function GavelIcon({ size = 34, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="gv-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffeaa0" /><stop offset="1" stopColor="#c08514" /></linearGradient>
        <linearGradient id="gv-w" x1="0" x2="1"><stop offset="0" stopColor="#8a4b12" /><stop offset="1" stopColor="#5a2c06" /></linearGradient>
      </defs>
      <g transform="rotate(-35 32 32)">
        <rect x="16" y="12" width="32" height="14" rx="3" fill="url(#gv-g)" />
        <rect x="14" y="14" width="4" height="10" rx="1.5" fill="#fff3c4" />
        <rect x="46" y="14" width="4" height="10" rx="1.5" fill="#fff3c4" />
        <rect x="29" y="25" width="6" height="28" rx="3" fill="url(#gv-w)" />
      </g>
      <rect x="10" y="52" width="44" height="7" rx="3.5" fill="url(#gv-w)" />
    </svg>
  );
}
