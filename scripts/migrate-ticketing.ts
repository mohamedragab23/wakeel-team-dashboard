/**
 * Apply ticketing database schema (PostgreSQL).
 * Usage: TICKETING_DATABASE_URL=postgresql://... npm run migrate:ticketing
 */
import 'dotenv/config';
import { closeTicketingDb, isTicketingDbConfigured, runTicketingMigrations } from '../lib/ticketing/db/client';

async function main() {
  if (!isTicketingDbConfigured()) {
    console.error('Set TICKETING_DATABASE_URL before running migrations.');
    process.exit(1);
  }
  console.log('Applying ticketing schema…');
  await runTicketingMigrations();
  console.log('Done.');
  await closeTicketingDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
