import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app shell. The UI is the same web app (web/dist) running in a
 * WebView; it talks to the SarthiAI API at VITE_API_BASE_URL (set at build
 * time) or the server URL chosen in Profile ▸ Developer.
 *
 * For a local http:// API during development, build with CAP_ALLOW_HTTP=1.
 * Production builds should use an https:// API.
 */
const allowHttp = process.env.CAP_ALLOW_HTTP === '1';

const config: CapacitorConfig = {
  appId: 'in.sarthiai.app',
  appName: 'SarthiAI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: allowHttp,
  },
  android: {
    allowMixedContent: allowHttp,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#F6F1E7', showSpinner: false },
    LocalNotifications: { smallIcon: 'ic_stat_sarthi', iconColor: '#2944C2' },
  },
};

export default config;
