import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { IconCheck, IconDoc } from './icons';
import { useToast } from './ui';

/**
 * "Documents you'll need" for one listing: its own list (quoted from the source),
 * plus documents its criteria usually need. Ticks are shared with the vault.
 */
export function DocumentChecklist({ opportunityId }: { opportunityId: string }) {
  const toast = useToast();
  const { data, setData } = useAsync(() => api.opportunityDocuments(opportunityId), [opportunityId]);
  if (!data?.length) return null;
  const toggle = async (kind: string, have: boolean) => {
    setData(data.map((i) => (i.kind === kind ? { ...i, have } : i)));
    try { await api.setDocumentHave(kind, have); } catch (e) { toast((e as Error).message); setData(data); }
  };
  const ready = data.filter((i) => i.have).length;
  return (
    <section className="section">
      <div className="section-head"><h2>Documents you’ll need</h2><Link to="/documents">Your documents</Link></div>
      <p className="small faint" style={{ marginTop: -4 }}>{ready} of {data.length} ready. Always check the official source for the full list.</p>
      <ul className="list card" style={{ padding: '2px 16px' }}>
        {data.map((d) => (
          <li key={d.label} className="row small" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
            <IconDoc size={18} style={{ color: 'var(--ink-3)', flexShrink: 0, marginTop: 2 }} />
            <span className="grow">
              {d.label}
              {d.source === 'criterion' && <span className="faint" style={{ display: 'block' }}>Usually needed to prove: {d.because}</span>}
              {d.uploads.length > 0 && <span className="faint" style={{ display: 'block' }}>In your vault</span>}
            </span>
            {d.kind ? (
              <button type="button" className={`chip ${d.have ? 'on' : ''}`} aria-pressed={d.have} onClick={() => toggle(d.kind!, !d.have)}>
                {d.have && <IconCheck size={14} />} I have it
              </button>
            ) : <span className="tag">Check source</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
