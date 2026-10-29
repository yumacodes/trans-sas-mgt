import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { purgeExpiredIdempotencyRecords } from './middleware/idempotency';
import { syncPermissionCatalogue } from './services/permission-catalogue';

const config = env();
// Keep the permission table in step with the catalogue shipped in this build.
await syncPermissionCatalogue(prisma);
const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(`API listening on http://localhost:${config.PORT}`);
});

// Idempotency records are only needed long enough to absorb retries.
const purgeTimer = setInterval(
  () => {
    purgeExpiredIdempotencyRecords().catch((err: unknown) =>
      logger.warn({ err }, 'idempotency purge failed'),
    );
  },
  60 * 60 * 1000,
);
purgeTimer.unref();

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
