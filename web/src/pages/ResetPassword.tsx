import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { Field, LogoMark } from '../components/ui';
import { PasswordHint } from '../components/PasswordHint';
import { usePageTitle } from '../lib/usePageTitle';

/** Opened from the emailed link: /reset-password?token=… */
export function ResetPassword() {
  usePageTitle('Reset password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { adoptSession } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.resetPassword(token, password);
      await adoptSession(r.token, r.user);
      navigate('/', { replace: true });
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? (err.details as { message: string }[]) : [];
      setError(details.length ? [...new Set(details.map((d) => d.message))].join(' ') : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="hero-mark"><LogoMark size={56} /></div>
        <h1 style={{ marginTop: 12 }}>Choose a new password</h1>
        {!token ? (
          <>
            <div className="notice coral" role="alert">This reset link is incomplete. Open the link from your email again, or request a new one.</div>
            <Link to="/welcome" className="btn block ghost" style={{ marginTop: 16 }}>Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={submit} noValidate style={{ marginTop: 12 }}>
            <p className="small muted">After this, you’ll be signed out on every other device.</p>
            <Field label="New password" hint={<PasswordHint password={password} />}>
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </Field>
            <Field label="Confirm new password">
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-invalid={mismatch} />
            </Field>
            {mismatch && <p className="small" role="alert" style={{ color: 'var(--coral)', marginTop: -6 }}>The passwords don’t match.</p>}
            {error && <div className="notice coral" role="alert" style={{ marginBottom: 14 }}>{error} {/expired|invalid/i.test(error) && <Link to="/welcome">Request a new link</Link>}</div>}
            <button className="btn block" disabled={busy || password.length < 8 || password !== confirm}>{busy ? 'Saving…' : 'Save new password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
