import { createApp } from './app';
import { env } from './config/env';
import { logger } from './shared/logger';
import { pool } from './shared/db';

const app = createApp();

/**
 * Managed platforms (Railway, Render, Fly, Heroku) assign a port via `PORT`
 * and expect the process to bind it — a hardcoded port means the health
 * check never passes and the deploy is marked failed.
 *
 * Binding `0.0.0.0` rather than the default is equally load-bearing: inside
 * a container, listening on localhost makes the service unreachable from the
 * platform's router, which presents as a timeout rather than a clear error.
 */
const port = Number(process.env.PORT) || env.API_PORT;

const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`UltisPro API listening on port ${port} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);

  server.close(() => {
    pool
      .end()
      .then(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Error closing database pool');
        process.exit(1);
      });
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
