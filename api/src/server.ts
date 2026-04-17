import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { sql } from './db/client.js';
import { healthRoutes } from './routes/health.js';
import { setRoutes } from './routes/sets.js';
import { cardRoutes } from './routes/cards.js';

async function buildApp() {
  const app = Fastify({ loggerInstance: logger });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 300, // per minute per IP; Phase 0 is internal, loose is fine
    timeWindow: '1 minute',
  });

  await app.register(healthRoutes);
  await app.register(setRoutes);
  await app.register(cardRoutes);

  app.setErrorHandler((err, _req, reply) => {
    logger.error({ err }, 'unhandled error');
    reply.code(500).send({ error: { code: 'internal_error', message: 'something went wrong' } });
  });

  return app;
}

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ host: '0.0.0.0', port: config.PORT });
    logger.info({ port: config.PORT }, 'api server listening');
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
