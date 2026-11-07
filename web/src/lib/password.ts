/** Client-side mirror of the server's password rules, for instant feedback. */
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'sarthiai', 'sarthiai123', '11111111', 'abcd1234', 'india123', 'welcome1', 'admin123']);

export function passwordProblems(p: string): string[] {
  const out: string[] = [];
  if (p.length < 8) out.push(`At least 8 characters (${p.length}/8).`);
  else if (!p.trim()) out.push('Cannot be only spaces.');
  else if (COMMON.has(p.trim().toLowerCase())) out.push('This password is too common.');
  return out;
}
