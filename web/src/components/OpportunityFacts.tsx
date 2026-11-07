import { useState } from 'react';
import { DEFAULT_SERVER_URL } from '../lib/api';
import { isNative, openExternal, shareLink } from '../lib/platform';
import { AVAILABILITY_LABEL, clipAtWord, formatDate, formatMoney, tidyEnding } from '../lib/format';
import type { Opportunity } from '../lib/types';
import { IconExternal, IconShare } from './icons';
import { useToast } from './ui';

type Facts = Pick<Opportunity, 'deadline' | 'availability' | 'stipend' | 'award' | 'duration' | 'workMode' | 'location' | 'eligibleYears' | 'eligibleDegrees' | 'minimumCGPA'>;

/** The listing's key facts as label/value pairs (same on the public and signed-in pages). */
export function opportunityFacts(o: Facts): [string, string][] {
  const money = [o.stipend && ['Stipend', formatMoney(o.stipend)], o.award && ['Award', formatMoney(o.award)]].filter(Boolean) as [string, string | null][];
  return [
    ['Deadline', o.deadline ? formatDate(o.deadline) : 'Not published'],
    ['Status', AVAILABILITY_LABEL[o.availability]],
    ...money.map(([k, v]) => [k, v ?? 'Not stated'] as [string, string]),
    ...(o.duration ? [['Duration', o.duration] as [string, string]] : []),
    ['Mode', o.workMode === 'not_applicable' ? 'Not applicable' : o.workMode === 'unknown' ? 'Not stated' : o.workMode[0].toUpperCase() + o.workMode.slice(1)],
    ...(o.location?.description || o.location?.city ? [['Where', o.location.description ?? [o.location.city, o.location.state].filter(Boolean).join(', ')] as [string, string]] : o.location?.isNationwide ? [['Where', 'Across India'] as [string, string]] : []),
    ...(o.eligibleYears.length ? [['Years', o.eligibleYears.map((y) => `Year ${y}`).join(', ')] as [string, string]] : []),
    ...(o.eligibleDegrees.length ? [['Degrees', o.eligibleDegrees.join(', ')] as [string, string]] : []),
    ...(o.minimumCGPA != null ? [['Min. CGPA', String(o.minimumCGPA)] as [string, string]] : []),
  ];
}

const DESCRIPTION_PREVIEW = 600;

/** Official text, collapsed to a whole-word preview, with the source always one tap away. */
export function OfficialDescription({ text, sourceUrl }: { text: string; sourceUrl: string }) {
  const [open, setOpen] = useState(false);
  const full = tidyEnding(text);
  const long = full.length > DESCRIPTION_PREVIEW + 80;
  return (
    <section className="section">
      <h2>From the official source</h2>
      <p className="muted prewrap small" id="official-description">{open || !long ? full : clipAtWord(full, DESCRIPTION_PREVIEW)}</p>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        {long && <button type="button" className="link-btn small" aria-expanded={open} aria-controls="official-description" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>}
        <button type="button" className="link-btn small" onClick={() => openExternal(sourceUrl)}>Read it on the official source <IconExternal size={14} /></button>
      </div>
    </section>
  );
}

/** Every listing cites its official source(s) and when SarthiAI last checked them. */
export function SourceSection({ o }: { o: Pick<Opportunity, 'verificationStatus' | 'lastVerifiedAt' | 'datesRefreshedAt' | 'isStale' | 'sourceUrl' | 'additionalSources'> & { verificationNotes?: string | null } }) {
  return (
    <section className="section">
      <h2>Source & verification</h2>
      <div className="card soft small">
        <p><strong>{o.verificationStatus === 'verified' ? 'Verified' : 'Not yet verified'}</strong>{o.lastVerifiedAt && ` · checked ${formatDate(o.lastVerifiedAt)}`}{o.datesRefreshedAt && ` · dates refreshed ${formatDate(o.datesRefreshedAt)}`}</p>
        {o.verificationNotes && <p className="muted">{o.verificationNotes}</p>}
        {o.isStale && <p style={{ color: 'var(--amber)' }}>Last verified over 30 days ago — details may have changed.</p>}
        <div className="stack">
          {[{ label: 'Official source', url: o.sourceUrl }, ...o.additionalSources].map((s) => (
            <button key={s.url} className="link-btn row" onClick={() => openExternal(s.url)}><IconExternal size={16} /> {s.label}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Public link to a listing. The Android app shares the web address of its server, not its own. */
export function publicUrl(path: string) {
  const base = isNative ? DEFAULT_SERVER_URL : window.location.origin;
  return `${base}${path}`;
}

/** Web Share API (or the Android share sheet); copies the link when sharing isn't available. */
export function ShareButton({ o }: { o: Pick<Opportunity, 'id' | 'title' | 'organization'> }) {
  const toast = useToast();
  const share = async () => {
    const r = await shareLink({ title: o.title, text: `${o.title} — ${o.organization} (on SarthiAI)`, url: publicUrl(`/opportunity/${o.id}`) });
    if (r === 'copied') toast('Link copied');
    else if (r === 'failed') toast('Could not share this link');
  };
  return <button type="button" className="icon-btn" aria-label="Share" title="Share" onClick={share}><IconShare size={18} /></button>;
}
