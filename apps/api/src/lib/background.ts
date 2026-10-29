import { waitUntil } from '@vercel/functions';
import { logger } from './logger';

/**
 * Continue work after the response has been sent.
 *
 * On a long-running server the promise simply keeps running. On Vercel the function
 * instance is frozen as soon as it responds, so the platform has to be told to keep
 * the invocation alive — otherwise a message send would stop half-way through its
 * recipients. Work must still finish within the function's configured maxDuration
 * (see vercel.json), and anything left unfinished stays retryable in the database.
 */
export function runAfterResponse(label: string, task: Promise<unknown>) {
  const guarded = task.catch((err: unknown) => logger.error({ err }, `${label} failed`));
  if (process.env.VERCEL) {
    waitUntil(guarded);
    return;
  }
  void guarded;
}
