import { passwordProblems } from '../lib/password';

/** Live hint under a new-password field. The server applies the same rules. */
export function PasswordHint({ password }: { password: string }) {
  if (!password) return <>At least 8 characters. Avoid common passwords.</>;
  const problems = passwordProblems(password);
  return <span role="status" style={problems.length ? { color: 'var(--coral)' } : undefined}>{problems[0] ?? 'Looks good.'}</span>;
}
