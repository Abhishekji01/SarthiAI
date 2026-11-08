import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { usePageTitle } from '../lib/usePageTitle';
import { LogoMark } from '../components/ui';

/** Opened from the confirmation email: /verify-email?token=… (signed in or out). */
export function VerifyEmail() {
  usePageTitle('Confirm email');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, refreshUser } = useSession();
  const [state, setState] = useState<'checking' | 'done' | 'error'>(token ? 'checking' : 'error');
  const [message, setMessage] = useState(token ? '' : 'This link is incomplete. Open the link from your email again.');
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api.verifyEmail(token)
      .then(async () => { setState('done'); if (user) await refreshUser().catch(() => {}); })
      .catch((e) => { setState('error'); setMessage((e as Error).message); });
  }, [token, user, refreshUser]);
  return (
    <div className="auth">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center' }}><LogoMark size={56} /></div>
        <h1 style={{ marginTop: 12 }}>{state === 'done' ? 'Email confirmed' : state === 'checking' ? 'Confirming…' : 'Link didn’t work'}</h1>
        <p className="muted" role="status">{state === 'done' ? 'Thanks! SarthiAI can now email you reminders and alerts.' : message}</p>
        <Link to={user ? '/' : '/welcome'} className="btn block" style={{ marginTop: 16 }}>{user ? 'Go to Home' : 'Sign in'}</Link>
      </div>
    </div>
  );
}
