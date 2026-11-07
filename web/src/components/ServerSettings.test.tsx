import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiError, getServerUrl, loadClientState } from '../lib/api';
import { ErrorState } from './ui';

describe('Reset to default server (H1)', () => {
  const reload = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, origin: 'http://localhost:3000', reload } });
  });
  afterEach(() => { cleanup(); reload.mockReset(); });

  it('clears a custom server and reloads from a "cannot reach server" error', async () => {
    localStorage.setItem('sarthi.serverUrl', 'https://unreachable.example.com');
    await loadClientState();
    expect(getServerUrl()).toBe('https://unreachable.example.com');

    render(<ErrorState error={new ApiError(0, 'NETWORK', 'Cannot reach the SarthiAI server')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default server' }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(localStorage.getItem('sarthi.serverUrl')).toBeNull();
    expect(getServerUrl()).toBe('');
  });

  it('offers Retry instead when no custom server is set', async () => {
    await loadClientState();
    const retry = vi.fn();
    render(<ErrorState error={new ApiError(0, 'NETWORK', 'Cannot reach the SarthiAI server')} onRetry={retry} />);
    expect(screen.queryByRole('button', { name: 'Reset to default server' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
});
