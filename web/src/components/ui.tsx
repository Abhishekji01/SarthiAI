import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBack, IconX } from './icons';
import { ApiError } from '../lib/api';
import { NetworkErrorActions } from './ServerSettings';

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="120" fill="var(--hero)" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#FFFFFF" strokeWidth="18" opacity="0.25" />
      <path d="M256 92 L300 256 L256 420 L212 256 Z" fill="#FFFFFF" />
      <path d="M256 92 L300 256 L212 256 Z" fill="var(--mint)" />
      <circle cx="256" cy="256" r="22" fill="var(--hero)" stroke="#FFFFFF" strokeWidth="10" />
    </svg>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <LogoMark size={size} />
      <span style={{ fontSize: size * 0.62, fontWeight: 800, letterSpacing: '-0.02em' }}>SarthiAI</span>
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
        <h1>{title}</h1>
        {kicker && <p className="subtitle">{kicker}</p>}
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
      {error instanceof ApiError && error.code === 'NETWORK'
        ? <NetworkErrorActions onRetry={onRetry} />
        : onRetry && <button className="btn small danger" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/**
 * Label + control + optional hint and inline error. The hint and error are linked
 * with aria-describedby (not part of the label), and an error sets aria-invalid.
 */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  const auto = useId();
  if (!isValidElement(children)) {
    return (
      <label className="field">
        <span>{label}</span>
        {children}
        {error && <div className="field-error" role="alert">{error}</div>}
        {hint && <div className="hint">{hint}</div>}
      </label>
    );
  }
  const el = children as ReactElement<Record<string, unknown>>;
  const id = (el.props.id as string | undefined) ?? auto;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(el, { id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true } : {}) })}
      {error && <div id={`${id}-error`} className="field-error" role="alert">{error}</div>}
      {hint && <div id={`${id}-hint`} className="hint">{hint}</div>}
    </div>
  );
}

/** Chip-based editor for skills / interests / locations, with suggestions. */
export function TokenEditor({ id, label, tokens, onChange, suggestions = [], placeholder, max = 40, maxLength = 60, error }: {
  id?: string; label: string; tokens: string[]; onChange: (t: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number; maxLength?: number; error?: string | null;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const has = (t: string) => tokens.some((x) => x.toLowerCase() === t.toLowerCase());
  const add = (t: string) => {
    const v = t.trim().replace(/,$/, '').trim();
    setNote(null);
    if (!v) return setText('');
    if (v.length > maxLength) return setNote(`Keep each one under ${maxLength} characters.`);
    if (tokens.length >= max) return setNote(`You can add up to ${max}. Remove one to add another.`);
    if (!has(v)) onChange([...tokens, v]);
    setText('');
  };
  const remaining = suggestions.filter((s) => !has(s));
  const message = error ?? note;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
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
        id={inputId} className="input" value={text} placeholder={placeholder ?? 'Type and press Enter'}
        aria-invalid={message ? true : undefined} aria-describedby={message ? `${inputId}-error` : undefined}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
        onBlur={() => text && add(text)}
      />
      {message && <div id={`${inputId}-error`} className="field-error" role="alert">{message}</div>}
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
  // "**Title** — details" reads as a title with its details on the line below.
  const sentence = (s: string) => s.replace(/(^|[.·]\s+)([a-z])/g, (_, a: string, c: string) => a + c.toUpperCase());
  const item = (s: string, k: string) => {
    const m = s.match(/^\*\*([^*]+?):?\*\*\s*(?:[—–:-]\s+|$)(.*)$/) ;
    if (!m) return inline(s, k);
    return (
      <>
        <strong className="rt-title">{m[1]}</strong>
        {m[2] && <span className="rt-detail">{inline(sentence(m[2]), k)}</span>}
      </>
    );
  };
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split('\n').filter((l) => l.trim());
        const heading = lines.length === 1 && lines[0].match(/^#{1,6}\s+(.*)$/);
        if (heading) return <h4 key={bi} className="rt-heading">{inline(heading[1], `${bi}h`)}</h4>;
        if (lines.length === 1 && /^_[^_]+_$/.test(lines[0].trim())) return <p key={bi} className="rt-note">{lines[0].trim().slice(1, -1)}</p>;
        const bullets = lines.filter((l) => /^\s*([•\-*]|\d+[.)])\s+/.test(l));
        if (bullets.length && bullets.length === lines.length - (/:$/.test(lines[0]) ? 1 : 0)) {
          const intro = bullets.length < lines.length ? lines[0] : null;
          const ordered = /^\s*\d/.test(bullets[0]);
          const items = bullets.map((l, i) => <li key={i}>{item(l.replace(/^\s*([•\-*]|\d+[.)])\s+/, ''), `${bi}-${i}-`)}</li>);
          return (
            <div key={bi}>
              {intro && <p className="rt-intro">{inline(intro, `${bi}i`)}</p>}
              {ordered ? <ol className="rt-list">{items}</ol> : <ul className="rt-list">{items}</ul>}
            </div>
          );
        }
        return <p key={bi}>{lines.map((l, i) => <span key={i}>{i > 0 && <br />}{inline(l, `${bi}-${i}-`)}</span>)}</p>;
      })}
    </>
  );
}
