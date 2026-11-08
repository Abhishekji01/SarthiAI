import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/session';
import { api, ApiError, serverOverrideAllowed } from '../lib/api';
import { isNative } from '../lib/platform';
import { safeNext } from '../lib/next';
import { Field, LogoMark, Sheet } from '../components/ui';
import { NetworkErrorActions, ServerSettings } from '../components/ServerSettings';
import { PasswordHint } from '../components/PasswordHint';
import { IconCheck, IconSettings } from '../components/icons';
import { usePageTitle } from '../lib/usePageTitle';
import { useT } from '../i18n';

const POINTS = ['welcome.point1', 'welcome.point2', 'welcome.point3'] as const;

export function Welcome({ notice, networkError }: { notice?: string; networkError?: boolean }) {
  const { signIn, register } = useSession();
  const t = useT();
  const [params] = useSearchParams();
  // Arriving from a shared link or an app screen: go straight to the form.
  const [mode, setMode] = useState<'start' | 'signin' | 'register' | 'forgot' | 'forgotSent'>(params.get('mode') === 'register' ? 'register' : params.get('next') ? 'signin' : 'start');
  const [sentMessage, setSentMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [google, setGoogle] = useState(false);
  // Google sign-in is a web flow behind a server feature flag; the Android app uses email for now.
  useEffect(() => { if (!isNative) api.authConfig().then((c) => setGoogle(c.googleSignIn)).catch(() => {}); }, []);
  const nextPath = safeNext(params.get('next'));
  const googleHref = `/api/auth/google/start${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`;
  const googleError = { google: 'Google sign-in didn’t work. Try again, or use your email and password.', google_cancelled: 'Google sign-in was cancelled.', google_off: 'Google sign-in is not available right now.' }[params.get('error') ?? ''];
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
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{t('welcome.tagline1')}{' '}<br />{t('welcome.tagline2')}</h1>
        {mode === 'start' ? (
          <>
            <ul className="list" style={{ margin: '20px 0 28px' }}>
              {POINTS.map((p) => (
                <li key={p} className="row" style={{ alignItems: 'flex-start', padding: '10px 0', border: 0 }}>
                  <span className="crit-status met" style={{ width: 22, height: 22 }}><IconCheck size={14} /></span>
                  <span className="muted">{t(p)}</span>
                </li>
              ))}
            </ul>
            {notice && <div className="notice amber" role="alert" style={{ marginBottom: 16 }}><span className="grow">{notice}</span>{networkError && <NetworkErrorActions onRetry={() => window.location.reload()} />}</div>}
            {googleError && <div className="notice coral" role="alert" style={{ marginBottom: 16 }}>{googleError}</div>}
            <div className="stack">
              {google && <a className="btn block secondary" href={googleHref}><GoogleMark /> {t('welcome.google')}</a>}
              <button className="btn block" onClick={() => setMode('register')}>{t('welcome.create')}</button>
              <button className="btn block ghost" onClick={() => setMode('signin')}>{t('welcome.haveAccount')}</button>
            </div>
          </>
        ) : mode === 'forgotSent' ? (
          <div style={{ marginTop: 20 }} role="status">
            <h2>{t('welcome.checkEmail')}</h2>
            <p className="muted">{sentMessage}</p>
            <p className="small faint">{t('welcome.noEmail')}</p>
            <button type="button" className="btn block ghost" onClick={() => { setMode('signin'); setError(null); }}>{t('welcome.backToSignIn')}</button>
          </div>
        ) : mode === 'forgot' ? (
          <form onSubmit={submit} style={{ marginTop: 20 }} noValidate>
            <h2>{t('welcome.resetTitle')}</h2>
            <p className="small muted">{t('welcome.resetHelp')}</p>
            <Field label={t('welcome.email')}><input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            {error && <div className="notice coral" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
            <button className="btn block" disabled={busy || !email.trim()}>{busy ? t('welcome.sending') : t('welcome.sendLink')}</button>
            <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" className="link-btn" onClick={() => { setMode('signin'); setError(null); }}>{t('welcome.backToSignIn')}</button>
            </p>
          </form>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 20 }} noValidate>
            {notice && mode === 'signin' && <div className="notice amber" role="alert" style={{ marginBottom: 16 }}><span className="grow">{notice}</span>{networkError && <NetworkErrorActions onRetry={() => window.location.reload()} />}</div>}
            {mode === 'register' && (
              <Field label={t('welcome.fullName')}><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            )}
            <Field label={t('welcome.email')}><input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label={t('welcome.password')} hint={mode === 'register' ? <PasswordHint password={password} /> : undefined}>
              <input className="input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} />
            </Field>
            {google && <a className="btn block secondary" href={googleHref} style={{ marginBottom: 14 }}><GoogleMark /> {t('welcome.google')}</a>}
            {googleError && <div className="notice coral" role="alert" style={{ marginBottom: 14 }}>{googleError}</div>}
            {mode === 'signin' && (
              <p className="small" style={{ margin: '-6px 0 14px', textAlign: 'right' }}>
                <button type="button" className="link-btn" onClick={() => { setMode('forgot'); setError(null); }}>{t('welcome.forgot')}</button>
              </p>
            )}
            {error && <div className="notice coral" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
            <button className="btn block" disabled={busy || !email || !password || (mode === 'register' && (!name.trim() || password.length < 8))}>
              {busy ? t('welcome.wait') : mode === 'register' ? t('welcome.createAccount') : t('welcome.signIn')}
            </button>
            <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
              {mode === 'register' ? t('welcome.already') : t('welcome.newHere')}
              <button type="button" className="link-btn" onClick={() => { setMode(mode === 'register' ? 'signin' : 'register'); setError(null); }}>
                {mode === 'register' ? t('welcome.signIn') : t('welcome.createLink')}
              </button>
            </p>
            {mode === 'register' && <p className="tiny faint" style={{ textAlign: 'center' }}>{t('welcome.privacyNote')}</p>}
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

/** Google's "G" mark (official colours), shown only on the Continue with Google button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
