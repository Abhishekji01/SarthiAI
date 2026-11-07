import { useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { IconX } from './icons';

const KEY = 'sarthi.verifyBannerHidden';

/** Gentle reminder until the email is confirmed. Everything works meanwhile; only emails wait. */
export function VerifyEmailBanner() {
  const { user } = useSession();
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  if (!user || user.emailVerified !== false || hidden) return null;
  const resend = async () => {
    setState('sending');
    try { await api.resendVerification(); setState('sent'); } catch (e) { setMessage((e as Error).message); setState('error'); }
  };
  return (
    <div style={{ padding: '12px 16px 0' }}>
    <div className="notice accent banner small" role="region" aria-label="Confirm your email">
      <span className="grow">
        {state === 'sent' ? `We sent a new link to ${user.email}.` : state === 'error' ? message : <>Confirm <strong>{user.email}</strong> so SarthiAI can email you reminders and alerts.</>}
      </span>
      {state !== 'sent' && <button type="button" className="btn small secondary" onClick={resend} disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Resend link'}</button>}
      <button type="button" className="icon-btn" aria-label="Hide for now" onClick={() => { setHidden(true); try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } }}><IconX size={16} /></button>
    </div>
    </div>
  );
}
