import { IconBookmark } from './icons';

/**
 * Bookmark toggle. Screen readers hear "Save, toggle button, not pressed" or
 * "Saved, toggle button, pressed"; the tooltip says what a tap will do.
 */
export function SaveButton({ saved, onToggle, disabled }: { saved: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${saved ? 'active' : ''}`} aria-pressed={saved} aria-label={saved ? 'Saved' : 'Save'}
      title={saved ? 'Remove from saved' : 'Save'} onClick={onToggle} disabled={disabled}>
      <IconBookmark size={18} filled={saved} />
    </button>
  );
}
