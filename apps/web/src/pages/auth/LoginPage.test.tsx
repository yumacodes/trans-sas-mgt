import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { fakeAuth } from '@/test/authMock';

const setSession = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { setSession: (...a: unknown[]) => setSession(...a) } },
  supabaseConfigured: true,
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => fakeAuth({ status: 'signedOut' }) }));

const post = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a) } };
});

const { ApiError } = await import('@/lib/api');
const { default: LoginPage, INVALID_CREDENTIALS_MESSAGE, signInErrorMessage } = await import(
  './LoginPage'
);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  post.mockReset();
  setSession.mockReset();
});

describe('LoginPage', () => {
  it('shows required-field messages without calling the API', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your username or email address.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/username or email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(post).not.toHaveBeenCalled();
  });

  it('signs in with a username and hands the session to Supabase', async () => {
    post.mockResolvedValueOnce({ accessToken: 'access', refreshToken: 'refresh' });
    setSession.mockResolvedValueOnce({ error: null });
    renderLogin();
    await userEvent.type(screen.getByLabelText(/username or email/i), 'dev');
    await userEvent.type(screen.getByLabelText(/^password/i), 'correct-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' }),
    );
    expect(post).toHaveBeenCalledWith('/auth/login', {
      identifier: 'dev',
      password: 'correct-password-1',
    });
  });

  it("shows the server's invalid-credentials message", async () => {
    post.mockRejectedValueOnce(
      new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS_MESSAGE }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/username or email/i), 'ama@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(INVALID_CREDENTIALS_MESSAGE)).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
  });

  it('toggles password visibility', async () => {
    renderLogin();
    const input = screen.getByLabelText(/^password/i);
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('maps auth errors to friendly messages', () => {
    expect(signInErrorMessage({ status: 429, message: 'Too many' })).toMatch(/too many sign-in attempts/i);
    expect(signInErrorMessage({ message: 'Email not confirmed' })).toMatch(/not been confirmed/i);
    expect(signInErrorMessage({ message: 'Failed to fetch' })).toMatch(/connection was interrupted/i);
  });
});
