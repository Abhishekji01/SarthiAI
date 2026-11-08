import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { usePageTitle } from '../lib/usePageTitle';
import { openExternal } from '../lib/platform';
import { DOC_KINDS, formatBytes, kindLabel } from '../lib/documents';
import { ErrorState, Field, Progress, Skeleton, TopBar, useToast } from '../components/ui';
import { IconCheck, IconDoc, IconExternal, IconShield, IconTrash } from '../components/icons';

/** Private document vault + "what I have" checklist. Files are visible only to the student. */
export function Documents() {
  usePageTitle('Your documents');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.documents(), []);
  const [kind, setKind] = useState('income_certificate');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { await api.uploadDocument(kind, file); toast('Uploaded'); reload(); } catch (e) { toast((e as Error).message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const toggleHave = async (k: string, have: boolean) => {
    if (!data) return;
    setData({ ...data, have: have ? [...data.have, k] : data.have.filter((x) => x !== k) });
    try { await api.setDocumentHave(k, have); } catch (e) { toast((e as Error).message); reload(); }
  };

  return (
    <div className="page">
      <TopBar title="Your documents" kicker="Private · only you can see these" back="/profile" />
      {loading && !data ? <Skeleton count={3} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data ? null : (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Upload to your vault</h2>
            <p className="small muted">PDF, JPG or PNG, up to {formatBytes(data.usage.maxFileBytes)} each. Downloads use links that expire after 5 minutes.</p>
            <Field label="What is it?">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                {DOC_KINDS.filter((d) => d.storable).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                <option value="other">Other</option>
              </select>
            </Field>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" hidden aria-hidden="true" tabIndex={-1} data-testid="vault-file" onChange={(e) => upload(e.target.files?.[0])} />
            <button type="button" className="btn block" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : 'Choose a file to upload'}</button>
            <p className="tiny faint" style={{ marginTop: 10 }}>{data.usage.files} of {data.usage.maxFiles} files · {formatBytes(data.usage.bytes)} of {formatBytes(data.usage.maxTotalBytes)} used</p>
            <Progress value={data.usage.bytes} total={data.usage.maxTotalBytes} />
          </section>

          <div className="notice accent small" style={{ marginTop: 12 }}>
            <IconShield size={18} />
            <span className="grow">For your safety, keep Aadhaar and bank documents off SarthiAI. Upload them only on the official scholarship portal. You can still tick them below.</span>
          </div>

          {data.documents.length > 0 && (
            <section className="section">
              <h2>In your vault</h2>
              <ul className="list card" style={{ padding: '2px 16px' }}>
                {data.documents.map((d) => (
                  <li key={d.id} className="row small" style={{ padding: '10px 0' }}>
                    <IconDoc size={18} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                    <span className="grow"><strong>{d.fileName}</strong><span className="faint" style={{ display: 'block' }}>{kindLabel(d.kind)} · {formatBytes(d.size)}</span></span>
                    <button type="button" className="icon-btn" aria-label={`Download ${d.fileName}`} onClick={async () => { try { openExternal((await api.documentLink(d.id)).url); } catch (e) { toast((e as Error).message); } }}><IconExternal size={18} /></button>
                    <button type="button" className="icon-btn" aria-label={`Delete ${d.fileName}`} onClick={async () => { try { await api.deleteDocument(d.id); setData({ ...data, documents: data.documents.filter((x) => x.id !== d.id) }); toast('Deleted'); } catch (e) { toast((e as Error).message); } }}><IconTrash size={18} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="section">
            <h2>Documents I have</h2>
            <p className="small faint" style={{ marginTop: -4 }}>Used for the checklist on each scholarship. Uploading a file ticks it for you.</p>
            <ul className="list card" style={{ padding: '2px 16px' }}>
              {DOC_KINDS.map((d) => {
                const have = data.have.includes(d.key);
                return (
                  <li key={d.key} className="row small" style={{ padding: '8px 0' }}>
                    <span className="grow">{d.label}</span>
                    <button type="button" className={`chip ${have ? 'on' : ''}`} aria-pressed={have} aria-label={`I have: ${d.label}`} onClick={() => toggleHave(d.key, !have)}>{have && <IconCheck size={14} />} I have it</button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
