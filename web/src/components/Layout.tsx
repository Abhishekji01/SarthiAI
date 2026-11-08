import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../lib/session';
import { IconBriefcase, IconChat, IconCompass, IconHome, IconMegaphone, IconRoute, IconUser } from './icons';
import { Wordmark } from './ui';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import { useT } from '../i18n';

/** Phone: 5 tabs in a floating dark bar (Roadmap included, as on desktop). Profile is reached from the avatar on Home. */
const TABS = [
  { to: '/', key: 'nav.home', icon: IconHome, end: true },
  { to: '/discover', key: 'nav.find', icon: IconCompass },
  { to: '/sarthi', key: 'nav.ask', icon: IconChat },
  { to: '/applications', key: 'nav.applied', icon: IconBriefcase },
  { to: '/roadmap', key: 'nav.roadmap', icon: IconRoute },
] as const;

export function Layout() {
  const { user } = useSession();
  const t = useT();
  const isAdmin = user?.role === 'college_admin' || user?.role === 'platform_admin';
  return (
    <div className="app">
      <nav className="sidebar" aria-label={t('nav.main')}>
        <div className="brand"><Wordmark size={30} /></div>
        {TABS.map(({ to, key, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest}><Icon /> {t(key === 'nav.ask' ? 'nav.askSarthi' : key)}</NavLink>
        ))}
        {isAdmin && <NavLink to="/admin"><IconMegaphone /> {t('nav.admin')}</NavLink>}
        <div className="spacer" />
        <NavLink to="/profile"><IconUser /> {user?.name.split(' ')[0] ?? 'Profile'}</NavLink>
      </nav>
      <main className="main">
        <VerifyEmailBanner />
        <Outlet />
      </main>
      <nav className="tabbar" aria-label={t('nav.main')}>
        {TABS.map(({ to, key, icon: Icon, ...rest }) => (
          <NavLink key={to} to={to} end={'end' in rest}><Icon size={22} /> {t(key)}</NavLink>
        ))}
      </nav>
    </div>
  );
}
