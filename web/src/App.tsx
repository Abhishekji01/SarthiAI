import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { useSession } from './lib/session';
import { isNative } from './lib/platform';
import { Layout } from './components/Layout';
import { LogoMark, Skeleton } from './components/ui';
import { Welcome } from './pages/Welcome';
import { Home } from './pages/Home';
import { Discover } from './pages/Discover';
import { OpportunityDetail } from './pages/OpportunityDetail';

// Less-used screens load on demand to keep first paint fast on phones.
const Onboarding = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.Onboarding })));
const Sarthi = lazy(() => import('./pages/Sarthi').then((m) => ({ default: m.Sarthi })));
const RoadmapPage = lazy(() => import('./pages/Roadmap').then((m) => ({ default: m.RoadmapPage })));
const Applications = lazy(() => import('./pages/Applications').then((m) => ({ default: m.Applications })));
const Drafts = lazy(() => import('./pages/Drafts').then((m) => ({ default: m.Drafts })));
const DraftEditor = lazy(() => import('./pages/Drafts').then((m) => ({ default: m.DraftEditor })));
const ProfilePage = lazy(() => import('./pages/Profile').then((m) => ({ default: m.ProfilePage })));
const EditProfile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.EditProfile })));
const Plan = lazy(() => import('./pages/Plan').then((m) => ({ default: m.Plan })));
const Saved = lazy(() => import('./pages/Saved').then((m) => ({ default: m.Saved })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));

function useNativeChrome() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isNative) return;
    SplashScreen.hide().catch(() => {});
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: dark ? '#111613' : '#F6F1E7' }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!isNative) return;
    // Android back button: go back inside the app; exit from a top-level tab.
    const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
      const top = ['/', '/discover', '/sarthi', '/roadmap', '/applications', '/welcome'].includes(location.pathname);
      if (canGoBack && !top) navigate(-1);
      else if (location.pathname !== '/' && location.pathname !== '/welcome') navigate('/');
      else CapApp.exitApp();
    });
    return () => { sub.then((s) => s.remove()); };
  }, [location.pathname, navigate]);
}

function Splash() {
  return <div className="auth"><div style={{ textAlign: 'center' }}><LogoMark size={64} /><p className="faint" style={{ marginTop: 12 }}>Loading…</p></div></div>;
}

export function App() {
  const { state } = useSession();
  useNativeChrome();
  if (state.status === 'loading') return <Splash />;
  if (state.status === 'signedOut') {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome notice={state.notice} />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }
  const needsOnboarding = !state.user.onboardingCompletedAt;
  return (
    <Suspense fallback={<div className="page"><Skeleton /></div>}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<Layout />}>
          <Route index element={needsOnboarding ? <Navigate to="/onboarding" replace /> : <Home />} />
          <Route path="discover" element={<Discover />} />
          <Route path="opportunity/:id" element={<OpportunityDetail />} />
          <Route path="sarthi" element={<Sarthi />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="plan" element={<Plan />} />
          <Route path="applications" element={<Applications />} />
          <Route path="saved" element={<Saved />} />
          <Route path="drafts" element={<Drafts />} />
          <Route path="drafts/:id" element={<DraftEditor />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="admin/*" element={<Admin />} />
        </Route>
        <Route path="/welcome" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
