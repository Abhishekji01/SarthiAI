import { personInitials } from '../lib/format';
import { IconUser } from './icons';

/** The student's avatar: the same initials on every screen, or an icon if the name has no letters. */
export function Avatar({ name, size }: { name: string; size?: number }) {
  const text = personInitials(name);
  return (
    <span className="avatar" aria-hidden="true" style={size ? { width: size, height: size, fontSize: Math.round(size * 0.4) } : undefined}>
      {text ?? <IconUser size={size ? Math.round(size * 0.5) : 18} />}
    </span>
  );
}
