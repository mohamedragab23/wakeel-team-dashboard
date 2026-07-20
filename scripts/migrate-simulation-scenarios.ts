/**
 * Apply Digital Twin simulation_scenarios schema (PostgreSQL / Neon).
 * Usage: TICKETING_DATABASE_URL=postgresql://... npx tsx scripts/migrate-simulation-scenarios.ts
 */
import 'dotenv/config';
import { closeTicketingDb, isTicketingDbConfigured } from '../lib/ticketing/db/client';
import { ensureSimulationSchema } from '../lib/strategicOps/digitalTwin/persistence/neonStore';

async function main() {
  if (!isTicketingDbConfigured()) {
    console.error('Set TICKETING_DATABASE_URL before running migrations.');
    process.exit(1);
  }
  console.log('Applying simulation_scenarios schema…');
  await ensureSimulationSchema();
  console.log('Done.');
  await closeTicketingDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
