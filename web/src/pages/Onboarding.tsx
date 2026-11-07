import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSession, useUser } from '../lib/session';
import { CollegePicker, draftFrom, EducationFields, InterestFields, PreferenceFields, toPatch, type Draft } from '../components/ProfileForm';
import { LogoMark } from '../components/ui';
import { FIELD_STEP, fieldErrorsFromServer, firstErrorField, focusField, validateAll, validateStep, type FieldErrors } from '../lib/profileValidation';

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
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    // Editing a field clears its error.
    setErrors((e) => { const next = { ...e }; for (const k of Object.keys(p)) delete next[k as keyof FieldErrors]; if ('college' in p || 'customCollege' in p) delete next.college; return next; });
  };

  /** Shows errors on the step that owns the first one, and focuses that field. */
  const showErrors = (e: FieldErrors) => {
    setErrors(e);
    const first = firstErrorField(e);
    if (first) {
      setStep(FIELD_STEP[first]);
      focusField(first);
    }
  };

  const next = () => {
    const e = validateStep(step, draft, { requireCore: true });
    if (Object.keys(e).length) return showErrors(e);
    setErrors({});
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  };

  const finish = async (skip = false) => {
    if (!skip) {
      const e = validateAll(draft, { requireCore: true });
      if (Object.keys(e).length) return showErrors(e);
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile(skip ? { completeOnboarding: true } : toPatch(draft, user, true));
      setUser(updated);
      navigate('/', { replace: true });
    } catch (e) {
      const fieldErrors = e instanceof ApiError ? fieldErrorsFromServer(e.details) : {};
      if (Object.keys(fieldErrors).length) showErrors(fieldErrors);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page no-nav with-footer" style={{ maxWidth: 620 }}>
      <div className="row between" style={{ marginBottom: 20 }}>
        <LogoMark size={36} />
        <button className="link-btn" onClick={() => finish(true)} disabled={busy}>Skip for now</button>
      </div>
      <div className="steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((_, i) => <div key={i} className={i <= step ? 'done' : ''} />)}
      </div>
      <p className="faint">Step {step + 1} of {STEPS.length}</p>
      <h1>{step === 0 ? `Welcome, ${user.name.split(' ')[0]}. ` : ''}{STEPS[step].title}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{STEPS[step].sub}</p>

      {step === 0 && <CollegePicker draft={draft} set={set} errors={errors} />}
      {step === 1 && <EducationFields draft={draft} set={set} errors={errors} />}
      {step === 2 && <InterestFields draft={draft} set={set} errors={errors} />}
      {step === 3 && <PreferenceFields draft={draft} set={set} errors={errors} />}

      <div className="bottom-bar">
        {/* Inside the sticky footer, so it is never hidden behind it. */}
        {error && <div className="notice coral bottom-bar-error" role="alert">{error}</div>}
        {step > 0 && <button className="btn ghost" onClick={() => { setErrors({}); setStep(step - 1); }} disabled={busy}>Back</button>}
        {step < STEPS.length - 1
          ? <button className="btn grow" onClick={next}>Continue</button>
          : <button className="btn grow" onClick={() => finish()} disabled={busy}>{busy ? 'Saving…' : 'Finish'}</button>}
      </div>
    </div>
  );
}
