/**
 * One-time bcrypt migration for legacy plain-text passwords in Google Sheets.
 * Only updates password cells (column E supervisors, column C admins).
 *
 * Usage:
 *   npm run migrate:passwords -- --dry-run
 *   npm run migrate:passwords
 */
import { config } from 'dotenv';
import path from 'path';
import { getSheetData, updateSheetRange } from '../lib/googleSheets';
import { hashPassword } from '../lib/passwordUtils';
import { isLegacyPlainStoredPassword } from '../lib/passwordMigrationSafety';
import { ADMIN_SHEET_TAB_CANDIDATES } from '../lib/adminsSheetParser';({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const dryRun = process.argv.includes('--dry-run');

type Migrated = { sheet: string; row: number; code: string; role: string };

async function migrateSupervisors(): Promise<Migrated[]> {
  const migrated: Migrated[] = [];
  const rows = await getSheetData('المشرفين', false);
  for (let i = 1; i < rows.length; i++) {
    const code = String(rows[i]?.[0] ?? '').trim();
    const pwd = String(rows[i]?.[4] ?? '');
    if (!code || !isLegacyPlainStoredPassword(pwd)) continue;

    const hashed = await hashPassword(pwd);
    if (!dryRun) {
      const updated = [...rows[i]];
      updated[4] = hashed;
      await updateSheetRange('المشرفين', `A${i + 1}:Z${i + 1}`, [updated]);
    }
    migrated.push({ sheet: 'المشرفين', row: i + 1, code, role: 'supervisor' });
  }
  return migrated;
}

async function migrateAdmins(): Promise<Migrated[]> {
  const migrated: Migrated[] = [];
  for (const tab of ADMIN_SHEET_TAB_CANDIDATES) {
    const rows = await getSheetData(tab, false, `${tab}!A:ZZ`);
    if (rows.length < 2) continue;
    for (let i = 1; i < rows.length; i++) {
      const code = String(rows[i]?.[0] ?? '').trim();
      const pwd = String(rows[i]?.[2] ?? '');
      if (!code || !isLegacyPlainStoredPassword(pwd)) continue;

      const hashed = await hashPassword(pwd);
      if (!dryRun) {
        const updated = [...rows[i]];
        if (updated.length > 2) updated[2] = hashed;
        await updateSheetRange(tab, `A${i + 1}:ZZ${i + 1}`, [updated]);
      }
      migrated.push({ sheet: tab, row: i + 1, code, role: 'admin' });
    }
  }
  return migrated;
}

async function main() {
  const supervisors = await migrateSupervisors();
  const admins = await migrateAdmins();
  const all = [...supervisors, ...admins];

  console.log(
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        dryRun,
        migratedCount: all.length,
        supervisors: supervisors.length,
        admins: admins.length,
        accounts: all.map((m) => ({ sheet: m.sheet, row: m.row, code: m.code, role: m.role })),
        bcryptOnlyReady: all.length === 0 ? 'already' : dryRun ? 'pending-run' : 'verify-with-audit',
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log('[migrate-passwords-bcrypt] Dry run — no sheet writes.');
  } else if (all.length > 0) {
    console.log(`[migrate-passwords-bcrypt] Migrated ${all.length} password(s) to bcrypt.`);
  }
}

main().catch((e) => {
  console.error('[migrate-passwords-bcrypt] failed:', e);
  process.exit(1);
});
