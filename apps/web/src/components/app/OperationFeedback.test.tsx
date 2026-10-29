import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { OperationFeedbackProvider, SUCCESS_DELAY_MS, useOperation } from './OperationFeedback';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness({ fn, onDone }: { fn: () => Promise<unknown>; onDone: (r: unknown) => void }) {
  const { run } = useOperation();
  return (
    <button
      onClick={() =>
        run(fn, { pending: 'Saving client…', success: 'Client created', successDelayMs: 400 }).then(
          (r) => onDone({ ok: r }),
          (e) => onDone({ error: e }),
        )
      }
    >
      Submit
    </button>
  );
}

function setup(fn: () => Promise<unknown>) {
  const onDone = vi.fn();
  render(
    <OperationFeedbackProvider>
      <Harness fn={fn} onDone={onDone} />
    </OperationFeedbackProvider>,
  );
  return onDone;
}

describe('OperationFeedback', () => {
  it('shows the checkmark only after the server confirms success', async () => {
    const d = deferred<string>();
    const onDone = setup(() => d.promise);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Saving client…')).toBeInTheDocument();
    expect(screen.queryByTestId('operation-success')).not.toBeInTheDocument();

    await act(async () => d.resolve('saved'));
    expect(await screen.findByTestId('operation-success')).toBeInTheDocument();
    expect(screen.getByText('Client created')).toBeInTheDocument();

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ ok: 'saved' }), {
      timeout: SUCCESS_DELAY_MS + 2000,
    });
    // The overlay closes just after the caller is resolved, not in the same tick.
    await vi.waitFor(() => expect(screen.queryByText('Client created')).not.toBeInTheDocument());
  });

  it('shows an error, never a checkmark, when the operation fails', async () => {
    const error = new ApiError({ status: 500, code: 'INTERNAL', message: 'Your changes were not saved.' });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('second try');
    const onDone = setup(fn);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Your changes were not saved.')).toBeInTheDocument();
    expect(screen.queryByTestId('operation-success')).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    // Retrying re-runs the same request function (same idempotency key captured in it).
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('operation-success')).toBeInTheDocument();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ ok: 'second try' }), {
      timeout: SUCCESS_DELAY_MS + 2000,
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects to the caller when the user closes the error', async () => {
    const error = new ApiError({ status: 409, code: 'CONFLICT', message: 'Already changed.' });
    const onDone = setup(() => Promise.reject(error));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ error }));
  });

  it('hands field validation errors back to the form without an overlay', async () => {
    const error = new ApiError({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Check the fields.',
      fields: { name: 'Client name is required.' },
    });
    const onDone = setup(() => Promise.reject(error));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ error }));
    expect(screen.queryByText('Check the fields.')).not.toBeInTheDocument();
  });

  it('refuses a second submission while one is in progress', async () => {
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const onDone = setup(fn);
    const button = screen.getByRole('button', { name: 'Submit' });
    await userEvent.click(button);
    // The overlay blocks the page; even a programmatic second click must not re-run.
    act(() => button.click());
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith({ error: expect.any(Error) }));
    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve('ok'));
  });
});
