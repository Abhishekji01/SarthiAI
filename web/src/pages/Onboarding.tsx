import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSession, useUser } from '../lib/session';
import { CollegePicker, draftFrom, EducationFields, InterestFields, PreferenceFields, toPatch, type Draft } from '../components/ProfileForm';
import { LogoMark } from '../components/ui';

const STEPS = [
  { title: 'Where do you study?', sub: 'Campus notices and college-only opportunities depend on this.' },
  { title: 'Your course', sub: 'Eligibility checks compare these with each listing’s official criteria.' },
  { title: 'Skills & goals', sub: 'Sarthi ranks matches by what you know and where you want to go.' },
  { title: 'Preferences', sub: 'All optional. You can change everything later in Profile.' },
];

export function Onboarding() {
  const user = useUser();
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const finish = async (skip = false) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile(skip ? { completeOnboarding: true } : toPatch(draft, user, true));
      setUser(updated);
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <div className="row between" style={{ marginBottom: 20 }}>
        <LogoMark size={36} />
        <button className="link-btn" onClick={() => finish(true)} disabled={busy}>Skip for now</button>
      </div>
      <div className="steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((_, i) => <div key={i} className={i <= step ? 'done' : ''} />)}
      </div>
      <p className="kicker">Step {step + 1} of {STEPS.length}</p>
      <h1>{step === 0 ? `Welcome, ${user.name.split(' ')[0]}. ` : ''}{STEPS[step].title}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{STEPS[step].sub}</p>

      {step === 0 && <CollegePicker draft={draft} set={set} />}
      {step === 1 && <EducationFields draft={draft} set={set} />}
      {step === 2 && <InterestFields draft={draft} set={set} />}
      {step === 3 && <PreferenceFields draft={draft} set={set} />}

      {error && <div className="notice coral" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      <div className="bottom-bar">
        {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
        {step < STEPS.length - 1
          ? <button className="btn grow" onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn grow" onClick={() => finish()} disabled={busy}>{busy ? 'Saving…' : 'Finish'}</button>}
      </div>
    </div>
  );
}
