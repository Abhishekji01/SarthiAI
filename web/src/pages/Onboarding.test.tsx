import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../lib/api';

const user = { id: 'u1', name: 'Isha Sharma', email: 'i@example.test', role: 'student', adminCollegeIds: [], profile: { degree: 'B.Tech', currentYear: 2, cgpa: 15 }, notificationPrefs: {}, onboardingCompletedAt: null, createdAt: '' };
vi.mock('../lib/session', () => ({ useUser: () => user, useSession: () => ({ setUser: vi.fn() }) }));
const updateProfile = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api: { updateProfile: (...a: unknown[]) => updateProfile(...a), colleges: () => Promise.resolve([]) } }));

import { Onboarding } from './Onboarding';

describe('H3: onboarding errors', () => {
  afterEach(() => { cleanup(); updateProfile.mockReset(); });

  it('blocks an invalid CGPA on step 2 with an inline message', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Your course' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Your course' })).toBeTruthy();
    const cgpa = screen.getByLabelText('CGPA (optional, out of 10)');
    expect(cgpa.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('CGPA must be between 0 and 10')).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(cgpa));
  });

  it('maps a server field error at Finish back to its step, field and focus', async () => {
    user.profile.cgpa = 8.2;
    updateProfile.mockRejectedValue(new ApiError(400, 'BAD_REQUEST', 'Some fields are invalid', [{ field: 'profile.cgpa', message: 'Use at most 2 decimal places' }]));
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await screen.findByText('Use at most 2 decimal places');
    expect(screen.getByRole('heading', { name: 'Your course' })).toBeTruthy();
    expect(screen.queryByText('Some fields are invalid')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('CGPA (optional, out of 10)')));
  });
});
