import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/usePageTitle';
import { LogoMark } from '../components/ui';

/** Shown for any address the app doesn't know, instead of silently going Home. */
export function NotFound({ signedIn }: { signedIn: boolean }) {
  usePageTitle('Page not found');
  return (
    <div className={signedIn ? 'page' : 'auth'}>
      <div className={signedIn ? 'empty' : 'auth-card'} style={{ textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}><LogoMark size={56} /></div>
        <h1>Page not found</h1>
        <p className="muted">This link may be old or mistyped. Nothing was changed.</p>
        <div className="stack" style={{ maxWidth: 280, margin: '16px auto 0' }}>
          {signedIn ? (
            <><Link to="/" className="btn block">Go to Home</Link><Link to="/discover" className="btn block ghost">Find opportunities</Link></>
          ) : (
            <Link to="/welcome" className="btn block">Go to SarthiAI</Link>
          )}
        </div>
      </div>
    </div>
  );
}
