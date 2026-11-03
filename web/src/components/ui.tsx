import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBack, IconX } from './icons';

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--accent)" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="var(--paper)" strokeWidth="18" opacity="0.35" />
      <path d="M256 92 L300 256 L256 420 L212 256 Z" fill="var(--paper)" />
      <path d="M256 92 L300 256 L212 256 Z" fill="var(--coral)" />
      <circle cx="256" cy="256" r="22" fill="var(--accent)" stroke="var(--paper)" strokeWidth="10" />
    </svg>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <LogoMark size={size} />
      <span className="serif" style={{ fontSize: size * 0.72, fontWeight: 700 }}>Sarthi<span style={{ color: 'var(--accent)' }}>AI</span></span>
    </div>
  );
}

export function TopBar({ title, back, actions, kicker }: { title: ReactNode; back?: boolean | string; actions?: ReactNode; kicker?: string }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" aria-label="Back" onClick={() => (typeof back === 'string' ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <IconBack />
        </button>
      )}
      <div className="grow">
        {kicker && <p className="kicker" style={{ marginBottom: 2 }}>{kicker}</p>}
        <h1>{title}</h1>
      </div>
      {actions}
    </header>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="grabber" />
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><IconX size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status" aria-live="polite">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Skeleton({ height = 96, count = 3 }: { height?: number; count?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" style={{ height }} />)}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <div className="small muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="notice coral" role="alert">
      <div className="grow">{error.message}</div>
      {onRetry && <button className="btn small danger" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

/** Chip-based editor for skills / interests / locations, with suggestions. */
export function TokenEditor({ label, tokens, onChange, suggestions = [], placeholder, max = 40 }: {
  label: string; tokens: string[]; onChange: (t: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number;
}) {
  const [text, setText] = useState('');
  const has = (t: string) => tokens.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (t: string) => {
    const v = t.trim().replace(/,$/, '');
    if (v && !has(v) && tokens.length < max) onChange([...tokens, v]);
    setText('');
  };
  const remaining = suggestions.filter((s) => !has(s));
  return (
    <div className="field">
      <span>{label}</span>
      {tokens.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {tokens.map((t) => (
            <button type="button" key={t} className="chip on" onClick={() => onChange(tokens.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
              {t} <span className="x">×</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="input" value={text} placeholder={placeholder ?? 'Type and press Enter'}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
        onBlur={() => text && add(text)}
      />
      {remaining.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {remaining.slice(0, 12).map((s) => <button type="button" key={s} className="chip" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>;
}

/** Minimal, safe markdown for assistant replies: **bold**, _italic_, bullets, numbered lists, paragraphs. */
export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string, k: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
    return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={`${k}${i}`}>{p.slice(2, -2)}</strong>
      : p.length > 2 && p.startsWith('_') && p.endsWith('_') ? <em key={`${k}${i}`}>{p.slice(1, -1)}</em> : p));
  };
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split('\n').filter((l) => l.trim());
        const bullets = lines.filter((l) => /^\s*([•\-*]|\d+[.)])\s+/.test(l));
        if (bullets.length && bullets.length === lines.length - (/:$/.test(lines[0]) ? 1 : 0)) {
          const intro = bullets.length < lines.length ? lines[0] : null;
          const ordered = /^\s*\d/.test(bullets[0]);
          const items = bullets.map((l, i) => <li key={i}>{inline(l.replace(/^\s*([•\-*]|\d+[.)])\s+/, ''), `${bi}-${i}-`)}</li>);
          return (
            <div key={bi}>
              {intro && <p style={{ marginBottom: 4 }}>{inline(intro, `${bi}i`)}</p>}
              {ordered ? <ol>{items}</ol> : <ul>{items}</ul>}
            </div>
          );
        }
        return <p key={bi}>{lines.map((l, i) => <span key={i}>{i > 0 && <br />}{inline(l, `${bi}-${i}-`)}</span>)}</p>;
      })}
    </>
  );
}
