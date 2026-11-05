import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../lib/session';
import { IconBriefcase, IconChat, IconCompass, IconHome, IconMegaphone, IconRoute, IconUser } from './icons';
import { Wordmark } from './ui';

/** Phone: 4 tabs in a floating dark bar. Profile is reached from the avatar on Home. */
const TABS = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/discover', label: 'Find', icon: IconCompass },
  { to: '/sarthi', label: 'Ask', icon: IconChat },
  { to: '/applications', label: 'Applied', icon: IconBriefcase },
];

export function Layout() {
  const { user } = useSession();
  const isAdmin = user?.role === 'college_admin' || user?.role === 'platform_admin';
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand"><Wordmark size={30} /></div>
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon /> {label === 'Ask' ? 'Ask Sarthi' : label}</NavLink>
        ))}
        <NavLink to="/roadmap"><IconRoute /> Roadmap</NavLink>
        {isAdmin && <NavLink to="/admin"><IconMegaphone /> Campus admin</NavLink>}
        <div className="spacer" />
        <NavLink to="/profile"><IconUser /> {user?.name.split(' ')[0] ?? 'Profile'}</NavLink>
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon size={22} /> {label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
