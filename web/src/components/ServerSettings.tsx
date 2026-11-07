import { useState } from 'react';
import { DEFAULT_SERVER_URL, getServerUrl, probeServer, resetServerUrl, setServerUrl, usingCustomServer } from '../lib/api';
import { trimUrl, validateServerUrl } from '../lib/serverConfig';
import { Field } from './ui';

/**
 * Developer-only server picker (dev builds and the unconfigured Android debug APK).
 * Save stays disabled until Test succeeds for exactly the URL in the box.
 */
export function ServerSettings({ onSaved }: { onSaved?: () => void }) {
  const [url, setUrl] = useState(usingCustomServer() ? getServerUrl() : '');
  const [tested, setTested] = useState<{ url: string; ok: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const candidate = trimUrl(url);
  const invalid = candidate ? validateServerUrl(candidate) : null;
  const testedOk = tested?.ok === true && tested.url === candidate;

  const test = async () => {
    setChecking(true);
    const ok = await probeServer(candidate);
    setTested({ url: candidate, ok });
    setChecking(false);
  };

  return (
    <>
      <Field label="API server URL" hint={`Developer setting. Leave empty to use the default${DEFAULT_SERVER_URL ? ` (${DEFAULT_SERVER_URL})` : ' (this website)'}. Must use https://, except http://10.0.2.2 or http://localhost in development.`}>
        <input className="input" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setTested(null); }} placeholder={DEFAULT_SERVER_URL || window.location.origin} aria-invalid={Boolean(invalid)} />
      </Field>
      {invalid && <p className="small" role="alert" style={{ color: 'var(--coral)', marginTop: -6 }}>{invalid}</p>}
      <div className="row">
        <button type="button" className="btn ghost" onClick={test} disabled={!candidate || Boolean(invalid) || checking}>{checking ? 'Checking…' : 'Test'}</button>
        {candidate ? (
          <button type="button" className="btn grow" disabled={!testedOk} onClick={async () => { await setServerUrl(candidate); onSaved?.(); window.location.reload(); }}>Save</button>
        ) : (
          <button type="button" className="btn grow" disabled={!usingCustomServer()} onClick={() => resetServerUrl()}>Use default server</button>
        )}
      </div>
      {tested && tested.url === candidate && (
        <p className="small" role="status" style={{ marginTop: 10 }}>{tested.ok ? 'Server reachable. You can save it now.' : 'Could not reach a SarthiAI server at that address, so it cannot be saved.'}</p>
      )}
    </>
  );
}

/** Shown next to a "cannot reach the server" error. */
export function NetworkErrorActions({ onRetry }: { onRetry?: () => void }) {
  if (usingCustomServer()) return <button type="button" className="btn small danger" onClick={() => resetServerUrl()}>Reset to default server</button>;
  return onRetry ? <button type="button" className="btn small danger" onClick={onRetry}>Retry</button> : null;
}
