import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAuth } from '@/test/authMock';

const signOut = vi.fn();
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ ...fakeAuth(), signOut }),
}));

const { OperationFeedbackProvider } = await import('@/components/app/OperationFeedback');
const { useSignOutConfirm } = await import('./useSignOutConfirm');

function Trigger() {
  const { requestSignOut, signOutDialog } = useSignOutConfirm();
  return (
    <>
      <button onClick={requestSignOut}>Sign out</button>
      {signOutDialog}
    </>
  );
}

/** The hook reads the operation overlay from context, so the provider wraps it. */
function Subject() {
  return (
    <OperationFeedbackProvider>
      <Trigger />
    </OperationFeedbackProvider>
  );
}

beforeEach(() => {
  signOut.mockReset();
  signOut.mockResolvedValue(undefined);
});

describe('sign out', () => {
  it('asks first and stays signed in when cancelled', async () => {
    render(<Subject />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Sign out?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out on confirmation and reports it in the centre overlay', async () => {
    render(<Subject />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('operation-success')).toBeInTheDocument();
    expect(screen.getByText('Logged out')).toBeInTheDocument();
  });
});
