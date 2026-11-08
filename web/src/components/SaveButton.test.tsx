import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SaveButton } from './SaveButton';

function Harness() {
  const [saved, setSaved] = useState(false);
  return <SaveButton saved={saved} onToggle={() => setSaved(!saved)} />;
}

describe('L2: Save button state', () => {
  afterEach(cleanup);
  it('exposes aria-pressed and switches its name between Save and Saved', () => {
    render(<Harness />);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    const saved = screen.getByRole('button', { name: 'Saved' });
    expect(saved.getAttribute('aria-pressed')).toBe('true');
    expect(saved.getAttribute('title')).toBe('Remove from saved');
    fireEvent.click(saved);
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('aria-pressed')).toBe('false');
  });
});
