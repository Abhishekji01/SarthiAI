import { passwordProblems, passwordStrength } from '../lib/password';

const LABEL = { weak: 'Weak — add more characters or words', fair: 'Fair — a longer passphrase is stronger', strong: 'Strong' };

/** Live hint under a new-password field. The server applies the same rules. */
export function PasswordHint({ password }: { password: string }) {
  if (!password) return <>At least 8 characters. Avoid common passwords; a short phrase of words works well.</>;
  const problems = passwordProblems(password);
  if (problems.length) return <span role="status" style={{ color: 'var(--coral)' }}>{problems[0]}</span>;
  const s = passwordStrength(password);
  return (
    <span role="status" className="row" style={{ gap: 8 }}>
      <span className={`strength strength-${s}`} aria-hidden="true"><i /><i /><i /></span>
      Strength: {LABEL[s]}
    </span>
  );
}
