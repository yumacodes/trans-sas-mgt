import { Router } from 'express';
import { uuid, listQuerySchema, type NotificationDto } from '@tsm/shared';
import { getAuth } from '../middleware/auth';
import { pageMeta, pageWindow } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import { ok } from '../lib/respond';
import { iso } from '../lib/serialize';
import { parse } from '../lib/validate';

/** Each user's own notifications. Every query is limited to the signed-in user. */
export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const ctx = getAuth(req);
  const query = parse(listQuerySchema, req.query);
  const where = { userId: ctx.profileId };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageWindow(query) }),
    prisma.notification.count({ where }),
  ]);
  const data: NotificationDto[] = rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.readAt !== null,
    createdAt: iso(n.createdAt),
  }));
  ok(res, data, pageMeta(query, total));
});

notificationsRouter.get('/unread-count', async (req, res) => {
  const ctx = getAuth(req);
  ok(res, { count: await prisma.notification.count({ where: { userId: ctx.profileId, readAt: null } }) });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const ctx = getAuth(req);
  await prisma.notification.updateMany({
    where: { userId: ctx.profileId, readAt: null },
    data: { readAt: new Date() },
  });
  ok(res, { ok: true });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const ctx = getAuth(req);
  const id = parse(uuid, req.params.id);
  await prisma.notification.updateMany({
    where: { id, userId: ctx.profileId, readAt: null },
    data: { readAt: new Date() },
  });
  ok(res, { ok: true });
});
