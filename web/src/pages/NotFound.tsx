import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/usePageTitle';
import { LogoMark } from '../components/ui';
import { useT } from '../i18n';

/** Shown for any address the app doesn't know, instead of silently going Home. */
export function NotFound({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  usePageTitle(t('notFound.title'));
  return (
    <div className={signedIn ? 'page' : 'auth'}>
      <div className={signedIn ? 'empty' : 'auth-card'} style={{ textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}><LogoMark size={56} /></div>
        <h1>{t('notFound.title')}</h1>
        <p className="muted">{t('notFound.body')}</p>
        <div className="stack" style={{ maxWidth: 280, margin: '16px auto 0' }}>
          {signedIn ? (
            <><Link to="/" className="btn block">{t('notFound.home')}</Link><Link to="/discover" className="btn block ghost">{t('notFound.find')}</Link></>
          ) : (
            <Link to="/welcome" className="btn block">{t('notFound.site')}</Link>
          )}
        </div>
      </div>
    </div>
  );
}
