import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sql } from '../src/db/client.js';
import { logger } from '../src/lib/logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '..', 'src', 'db', 'schema.sql');

async function main() {
  logger.info({ schemaPath }, 'applying schema');
  const ddl = await readFile(schemaPath, 'utf8');
  await sql.unsafe(ddl);
  logger.info('schema applied');
  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  logger.error({ err }, 'bootstrap failed');
  await sql.end({ timeout: 5 });
  process.exit(1);
});
