/**
 * Where to go after signing in. Only in-app paths are accepted ("/opportunity/…"),
 * never another site ("//evil.example", "https://…") or the sign-in screens.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p: string;
  try { p = decodeURIComponent(raw); } catch { return null; }
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\') || p.length > 300) return null;
  if (/^\/(welcome|reset-password|onboarding)(\/|\?|$)/.test(p)) return null;
  return p;
}

/** /welcome?next=<current path>, used when a signed-out visitor opens an app screen. */
export const welcomeWithNext = (path: string) => (path && path !== '/' ? `/welcome?next=${encodeURIComponent(path)}` : '/welcome');
