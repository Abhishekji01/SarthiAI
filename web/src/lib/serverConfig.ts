/**
 * Which API server the app talks to, and when a student may change it.
 *
 * Production builds always use the default server (same origin on the web,
 * VITE_API_BASE_URL in the Android app). A custom server URL is a developer
 * tool: it is only offered in dev builds (`vite dev`) and in builds made with
 * VITE_DEV_SERVER_SETTING=1 (the Android debug APK that has no server baked in).
 * Otherwise a stored override is ignored and deleted on startup, so nobody can
 * be locked out, or tricked into sending their password to another host.
 */

export interface BuildFlags {
  /** `vite dev`, or an explicitly flagged debug build. */
  overrideAllowed: boolean;
}

export const buildFlags: BuildFlags = {
  overrideAllowed: Boolean(import.meta.env.DEV) || import.meta.env.VITE_DEV_SERVER_SETTING === '1',
};

export const trimUrl = (u: string) => u.trim().replace(/\/+$/, '');

const LOCAL_HTTP = /^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

/** Returns an error message, or null when the URL may be used as a server. */
export function validateServerUrl(raw: string, flags: BuildFlags = buildFlags): string | null {
  const url = trimUrl(raw);
  if (!url) return 'Enter a server URL.';
  let parsed: URL;
  try { parsed = new URL(url); } catch { return 'That is not a valid URL.'; }
  if (parsed.username || parsed.password) return 'The URL must not contain a username or password.';
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) return 'Use only the server address, e.g. https://sarthiai.example.com';
  if (parsed.protocol === 'https:') return null;
  if (flags.overrideAllowed && LOCAL_HTTP.test(`${parsed.protocol}//${parsed.host}`)) return null;
  return 'The server must use https://. (In development, http://10.0.2.2 and http://localhost are allowed.)';
}

/**
 * The base URL to use at startup. A stored override is only honoured when
 * overrides are allowed and the URL is valid; otherwise it must be deleted.
 */
export function resolveBaseUrl(stored: string | null, defaultUrl: string, flags: BuildFlags = buildFlags) {
  if (!stored) return { baseUrl: defaultUrl, clearStored: false };
  if (!flags.overrideAllowed || validateServerUrl(stored, flags) !== null) return { baseUrl: defaultUrl, clearStored: true };
  return { baseUrl: trimUrl(stored), clearStored: false };
}

const originOf = (base: string) => {
  if (!base) return typeof window !== 'undefined' ? window.location.origin : '';
  try { return new URL(base).origin; } catch { return null; }
};

/** The session token is only sent to the default server, except in dev builds. */
export function shouldAttachToken(base: string, defaultUrl: string, flags: BuildFlags = buildFlags) {
  if (flags.overrideAllowed) return true;
  const a = originOf(base);
  return a !== null && a === originOf(defaultUrl);
}
