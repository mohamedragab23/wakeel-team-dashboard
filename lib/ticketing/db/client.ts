import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

let sql: ReturnType<typeof postgres> | null = null;

function getTicketingDatabaseUrl(): string | undefined {
  const ticketingUrl = process.env.TICKETING_DATABASE_URL?.trim();
  // The Vercel export substitutes this marker for sensitive values. The
  // original production setup used POSTGRES_URL for both variables.
  if (ticketingUrl && /^\[SENSITIVE\]$/.test(ticketingUrl)) {
    return process.env.POSTGRES_URL?.trim();
  }
  return ticketingUrl;
}

export function isTicketingDbConfigured(): boolean {
  return Boolean(getTicketingDatabaseUrl());
}

export function getTicketingSql(): ReturnType<typeof postgres> {
  const url = getTicketingDatabaseUrl();
  if (!url) {
    throw new Error(
      'TICKETING_DATABASE_URL is not configured. See docs/operations-ticketing/MIGRATION.md'
    );
  }
  if (!sql) {
    sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sql;
}

export async function runTicketingMigrations(): Promise<void> {
  const db = getTicketingSql();
  const schemaPath = join(process.cwd(), 'lib', 'ticketing', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  await db.unsafe(schema);
}

export async function closeTicketingDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
