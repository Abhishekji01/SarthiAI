import { useState, type FormEvent } from 'react';
import { useSession } from '../lib/session';
import { api, ApiError, serverOverrideAllowed } from '../lib/api';
import { Field, LogoMark, Sheet } from '../components/ui';
import { NetworkErrorActions, ServerSettings } from '../components/ServerSettings';
import { PasswordHint } from '../components/PasswordHint';
import { IconCheck, IconSettings } from '../components/icons';
import { usePageTitle } from '../lib/usePageTitle';

const POINTS = [
  'Verified scholarships, internships & fellowships — every listing cites its official source',
  'Criterion-by-criterion eligibility checks you can trust',
  'Sarthi, an AI guide that only answers from real data',
];

export function Welcome({ notice, networkError }: { notice?: string; networkError?: boolean }) {
  const { signIn, register } = useSession();
  const [mode, setMode] = useState<'start' | 'signin' | 'register' | 'forgot' | 'forgotSent'>('start');
  const [sentMessage, setSentMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  usePageTitle(mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' || mode === 'forgotSent' ? 'Reset password' : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        const r = await api.forgotPassword(email.trim());
        setSentMessage(r.message);
        setMode('forgotSent');
      } else if (mode === 'register') await register(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError && err.details && Array.isArray(err.details) ? (err.details as { message: string }[]).map((d) => d.message).join(' ') : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="row between">
          <div className="hero-mark"><LogoMark size={72} /></div>
          {serverOverrideAllowed && <button className="icon-btn" aria-label="Server settings" onClick={() => setServerOpen(true)}><IconSettings size={18} /></button>}
        </div>
        <p className="faint">SarthiAI</p>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>Your future,{' '}<br />guided.</h1>
        {mode === 'start' ? (
          <>
            <ul className="list" style={{ margin: '20px 0 28px' }}>
              {POINTS.map((p) => (
                <li key={p} className="row" style={{ alignItems: 'flex-start', padding: '10px 0', border: 0 }}>
                  <span className="crit-status met" style={{ width: 22, height: 22 }}><IconCheck size={14} /></span>
                  <span className="muted">{p}</span>
                </li>
              ))}
            </ul>
            {notice && <div className="notice amber" role="alert" style={{ marginBottom: 16 }}><span className="grow">{notice}</span>{networkError && <NetworkErrorActions onRetry={() => window.location.reload()} />}</div>}
            <div className="stack">
              <button className="btn block" onClick={() => setMode('register')}>Create a free account</button>
              <button className="btn block ghost" onClick={() => setMode('signin')}>I already have an account</button>
            </div>
          </>
        ) : mode === 'forgotSent' ? (
          <div style={{ marginTop: 20 }} role="status">
            <h2>Check your email</h2>
            <p className="muted">{sentMessage}</p>
            <p className="small faint">Didn’t get it? Check spam, or wait a minute and try again.</p>
            <button type="button" className="btn block ghost" onClick={() => { setMode('signin'); setError(null); }}>Back to sign in</button>
          </div>
        ) : mode === 'forgot' ? (
          <form onSubmit={submit} style={{ marginTop: 20 }} noValidate>
            <h2>Reset your password</h2>
            <p className="small muted">Enter the email you signed up with. We’ll send a link to choose a new password.</p>
            <Field label="Email"><input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            {error && <div className="notice coral" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
            <button className="btn block" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" className="link-btn" onClick={() => { setMode('signin'); setError(null); }}>Back to sign in</button>
            </p>
          </form>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 20 }} noValidate>
            {notice && mode === 'signin' && <div className="notice amber" role="alert" style={{ marginBottom: 16 }}><span className="grow">{notice}</span>{networkError && <NetworkErrorActions onRetry={() => window.location.reload()} />}</div>}
            {mode === 'register' && (
              <Field label="Full name"><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            )}
            <Field label="Email"><input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password" hint={mode === 'register' ? <PasswordHint password={password} /> : undefined}>
              <input className="input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} />
            </Field>
            {mode === 'signin' && (
              <p className="small" style={{ margin: '-6px 0 14px', textAlign: 'right' }}>
                <button type="button" className="link-btn" onClick={() => { setMode('forgot'); setError(null); }}>Forgot password?</button>
              </p>
            )}
            {error && <div className="notice coral" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
            <button className="btn block" disabled={busy || !email || !password || (mode === 'register' && (!name.trim() || password.length < 8))}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
            <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
              {mode === 'register' ? 'Already have an account? ' : 'New to SarthiAI? '}
              <button type="button" className="link-btn" onClick={() => { setMode(mode === 'register' ? 'signin' : 'register'); setError(null); }}>
                {mode === 'register' ? 'Sign in' : 'Create an account'}
              </button>
            </p>
            {mode === 'register' && <p className="tiny faint" style={{ textAlign: 'center' }}>Your profile stays private. Income and home state are optional and never shared with the AI or your college.</p>}
          </form>
        )}
      </div>
      {serverOverrideAllowed && (
        <Sheet open={serverOpen} onClose={() => setServerOpen(false)} title="Server (developer)">
          <ServerSettings />
        </Sheet>
      )}
    </div>
  );
}
