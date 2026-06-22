import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

let sql: ReturnType<typeof postgres> | null = null;

export function isTicketingDbConfigured(): boolean {
  return Boolean(process.env.TICKETING_DATABASE_URL?.trim());
}

export function getTicketingSql(): ReturnType<typeof postgres> {
  const url = process.env.TICKETING_DATABASE_URL?.trim();
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
