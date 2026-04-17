import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const [row] = await sql<[{ ok: number }]>`SELECT 1::int AS ok`;
    return { status: 'ok', db: row?.ok === 1 ? 'up' : 'down' };
  });
}
