import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useSession } from '../lib/session';
import { syncReminders } from '../lib/reminders';
import type { ChatReply, ProposedAction } from '../lib/types';
import { RichText, TopBar, useToast } from '../components/ui';
import { IconCheck, IconSend, IconChat } from '../components/icons';

interface Msg { role: 'user' | 'assistant'; content: string; reply?: ChatReply; quick?: boolean }

const STARTERS = [
  'What should I apply to this month?',
  'Which deadlines are coming up for me?',
  'What should I do next?',
  'Find machine learning internships',
  'Scholarships I might be eligible for',
];

const KEY = 'sarthi.chat';
const loadHistory = (): Msg[] => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); } catch { return []; } };

export function Sarthi() {
  const [params] = useSearchParams();
  const about = params.get('about');
  const aboutTitle = params.get('title');
  const status = useAsync(() => api.aiStatus(), []);
  const [messages, setMessages] = useState<Msg[]>(loadHistory);
  const [text, setText] = useState(about && aboutTitle ? `Am I eligible for "${aboutTitle}", and what should I prepare?` : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-30))); } catch { /* ignore */ } }, [messages]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const aiAvailable = status.data?.available !== false;

  const send = async (content: string) => {
    const msg = content.trim();
    if (!msg || busy) return;
    setText('');
    setError(null);
    const history: Msg[] = [...messages, { role: 'user', content: msg }];
    setMessages(history);
    setBusy(true);
    try {
      let reply: ChatReply;
      let quick = false;
      if (aiAvailable) {
        try {
          reply = await api.chat(history.map((m) => ({ role: m.role, content: m.content })).slice(-20), about ?? undefined);
        } catch (e) {
          if (!(e instanceof ApiError && e.isAIUnavailable)) throw e;
          reply = await api.quick(msg);
          quick = true;
        }
      } else {
        reply = await api.quick(msg);
        quick = true;
      }
      setMessages([...history, { role: 'assistant', content: reply.reply, reply, quick }]);
    } catch (e) {
      setError((e as Error).message);
      setMessages(history);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <TopBar title="Ask Sarthi" kicker={aiAvailable ? 'AI guide · answers from your real data' : 'Quick answers mode'} actions={
        messages.length > 0 ? <button className="btn small ghost" onClick={() => { setMessages([]); setError(null); }}>New chat</button> : undefined
      } />
      {status.data && !status.data.available && (
        <div className="notice accent" style={{ marginBottom: 12 }}>
          The AI model isn’t configured on this server, so Sarthi gives quick answers straight from your SarthiAI data (deadlines, matches, next steps, search).
        </div>
      )}

      {messages.length === 0 && (
        <div className="card soft" style={{ marginBottom: 16 }}>
          <div className="row" style={{ marginBottom: 8 }}><span className="ask-icon"><IconChat size={22} /></span><h3 style={{ margin: 0 }}>Namaste! I’m Sarthi.</h3></div>
          <p className="small muted">I find verified opportunities, check eligibility criterion by criterion, and plan next steps. I only state facts I can find in SarthiAI — dates and amounts are fact-checked before you see them. You can write in English or Hindi.</p>
          <div className="chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
        </div>
      )}

      <div className="chat" aria-live="polite">
        {messages.map((m, i) => (m.role === 'user'
          ? <div key={i} className="bubble user">{m.content}</div>
          : <AssistantBubble key={i} m={m} />))}
        {busy && <div className="bubble assistant typing" aria-label="Sarthi is thinking"><span /><span /><span /></div>}
        <div ref={end} />
      </div>
      {error && <div className="notice coral" role="alert" style={{ marginTop: 12 }}>{error}</div>}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea className="input grow" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Sarthi anything…" aria-label="Message Sarthi"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} maxLength={4000} />
        <button className="btn" style={{ width: 46, padding: 0 }} aria-label="Send" disabled={busy || !text.trim()}><IconSend size={18} /></button>
      </form>
    </div>
  );
}

function AssistantBubble({ m }: { m: Msg }) {
  const r = m.reply;
  return (
    <div className="bubble assistant">
      <RichText text={m.content} />
      {r?.grounding?.status === 'unverified' && r.grounding.unverifiedClaims.length > 0 && (
        <div className="notice amber small" style={{ marginTop: 8 }}>Couldn’t verify: {r.grounding.unverifiedClaims.join(', ')}. Check these on the official source.</div>
      )}
      {r?.proposedActions.map((a) => <ActionCard key={a.id} a={a} />)}
      {r && r.citations.length > 0 && (
        <div className="chips" style={{ marginTop: 10 }}>
          {r.citations.slice(0, 8).map((c) => <Link key={c.opportunityId} to={`/opportunity/${c.opportunityId}`} className="tag accent">{c.title.length > 40 ? `${c.title.slice(0, 38)}…` : c.title}</Link>)}
          {r.citations.length > 8 && <span className="tag">+{r.citations.length - 8} more in the answer</span>}
        </div>
      )}
      {r && (
        <p className="tiny faint" style={{ margin: '8px 0 0' }}>
          {m.quick ? 'Quick answer · no AI' : `AI${r.grounding?.status === 'corrected' ? ' · facts auto-corrected' : r.grounding?.status === 'verified' ? ' · facts checked' : ''}`} · confirm on official sources
        </p>
      )}
    </div>
  );
}

/** Sarthi only proposes; nothing changes until the student confirms here. */
function ActionCard({ a }: { a: ProposedAction }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const confirm = async () => {
    setState('busy');
    try {
      if (a.type === 'save_opportunity') await api.save(a.opportunityId!);
      else if (a.type === 'track_application') {
        await api.createApplication({ opportunityId: a.opportunityId, nextAction: a.nextAction ?? undefined });
        if (user) syncReminders(user).catch(() => {});
      } else if (a.type === 'draft_email') {
        const d = await api.draftEmail({ opportunityId: a.opportunityId! });
        navigate(`/drafts/${d.id}`);
      } else if (a.type === 'generate_roadmap') {
        await api.generateRoadmap(a.goal!, a.opportunityId);
        navigate('/roadmap');
      }
      setState('done');
      toast('Done');
    } catch (e) {
      setErr((e as Error).message);
      setState('error');
    }
  };
  return (
    <div className="card" style={{ marginTop: 10, padding: 12 }}>
      <p className="faint" style={{ marginBottom: 4 }}>Needs your confirmation</p>
      <p className="small" style={{ fontWeight: 600 }}>{a.label}</p>
      {a.nextAction && <p className="small muted">Next action: {a.nextAction}</p>}
      {state === 'done' ? <span className="tag jade"><IconCheck size={12} /> Done</span> : (
        <button className="btn small" onClick={confirm} disabled={state === 'busy'}>{state === 'busy' ? 'Working…' : 'Confirm'}</button>
      )}
      {state === 'error' && <p className="small" style={{ color: 'var(--coral)', marginTop: 6 }}>{err}</p>}
    </div>
  );
}
