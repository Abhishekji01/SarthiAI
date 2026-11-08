/** Client-side mirror of the server's password rules, for instant feedback. */
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'sarthiai', 'sarthiai123', '11111111', 'abcd1234', 'india123', 'welcome1', 'admin123']);

export function passwordProblems(p: string): string[] {
  const out: string[] = [];
  if (p.length < 8) out.push(`At least 8 characters (${p.length}/8).`);
  else if (!p.trim()) out.push('Cannot be only spaces.');
  else if (COMMON.has(p.trim().toLowerCase())) out.push('This password is too common.');
  return out;
}

/** Rough strength for the hint under a new password (the server enforces the rules). */
export function passwordStrength(p: string): 'weak' | 'fair' | 'strong' {
  if (passwordProblems(p).length) return 'weak';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  const unique = new Set(p).size;
  if (p.length >= 14 && unique >= 8) return 'strong';
  if (p.length >= 10 && classes >= 3 && unique >= 6) return 'strong';
  if (p.length >= 10 || classes >= 3) return 'fair';
  return 'weak';
}
