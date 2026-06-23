import { createHash } from 'crypto';

export function hashRow(row: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

export function hashTab(rows: unknown[][]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
