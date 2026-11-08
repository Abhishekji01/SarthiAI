import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { SessionProvider } from './lib/session';
import { ToastProvider } from './components/ui';
import { isNative } from './lib/platform';
// Bundled font (works offline in the Android app; not loaded from Google Fonts).
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './styles.css';
import { I18nProvider } from './i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <SessionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SessionProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Installable PWA in browsers (the Android app ships its files inside the APK).
if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
