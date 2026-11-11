import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { runDailyJobs } from '../services/jobs';

/**
 * Entry point for the scheduler (Vercel Cron), which calls it with
 * `Authorization: Bearer <CRON_SECRET>`. It is not reachable with a user session.
 */
export const jobsRouter = Router();

function authorised(header: string | undefined, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

jobsRouter.get('/daily', async (req, res) => {
  const secret = env().CRON_SECRET;
  if (!secret) throw new AppError('SERVICE_UNAVAILABLE', 'Scheduled jobs are not configured. Set CRON_SECRET.');
  if (!authorised(req.header('authorization'), secret)) throw new AppError('UNAUTHENTICATED', 'Not allowed.');
  res.json({ data: await runDailyJobs() });
});
