import { ingestPokemonTcg } from '../src/ingestors/pokemontcg.js';
import { ingestEbaySold } from '../src/ingestors/ebaySold.js';
import { sql } from '../src/db/client.js';
import { logger } from '../src/lib/logger.js';

type Target = 'pokemontcg' | 'ebay' | 'all';

function parseTarget(): Target {
  const arg = process.argv[2];
  if (arg !== 'pokemontcg' && arg !== 'ebay' && arg !== 'all') {
    console.error('usage: tsx scripts/run-ingest.ts <pokemontcg|ebay|all>');
    process.exit(1);
  }
  return arg;
}

async function main() {
  const target = parseTarget();
  logger.info({ target }, 'starting ingest');

  if (target === 'pokemontcg' || target === 'all') {
    const res = await ingestPokemonTcg();
    logger.info({ res }, 'pokemontcg ingest done');
  }

  if (target === 'ebay' || target === 'all') {
    const res = await ingestEbaySold();
    logger.info({ res }, 'ebay ingest done');
  }

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  logger.error({ err }, 'ingest failed');
  await sql.end({ timeout: 5 });
  process.exit(1);
});
