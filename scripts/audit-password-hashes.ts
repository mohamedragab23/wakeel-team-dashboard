/**
 * Read-only audit: lists supervisor/admin rows with non-bcrypt passwords.
 * Does NOT modify Google Sheets.
 *
 * Usage: npm run audit:password-hashes
 */
import { config } from 'dotenv';
import path from 'path';
import { getSheetData } from '../lib/googleSheets';
import { isLegacyPlainStoredPassword } from '../lib/passwordMigrationSafety';
import { ADMIN_SHEET_TAB_CANDIDATES } from '../lib/adminsSheetParser';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const issues: Array<{ sheet: string; row: number; code: string; role: string }> = [];

  const supervisors = await getSheetData('المشرفين', false);
  for (let i = 1; i < supervisors.length; i++) {
    const code = String(supervisors[i]?.[0] ?? '').trim();
    const pwd = String(supervisors[i]?.[4] ?? '');
    if (!code) continue;
    if (isLegacyPlainStoredPassword(pwd)) {
      issues.push({ sheet: 'المشرفين', row: i + 1, code, role: 'supervisor' });
    }
  }

  for (const tab of ADMIN_SHEET_TAB_CANDIDATES) {
    const rows = await getSheetData(tab, false, `${tab}!A:ZZ`);
    for (let i = 1; i < rows.length; i++) {
      const code = String(rows[i]?.[0] ?? '').trim();
      const pwd = String(rows[i]?.[2] ?? '');
      if (!code) continue;
      if (isLegacyPlainStoredPassword(pwd)) {
        issues.push({ sheet: tab, row: i + 1, code, role: 'admin' });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        auditedAt: new Date().toISOString(),
        legacyPlainCount: issues.length,
        bcryptOnlyReady: issues.length === 0,
        issues,
      },
      null,
      2
    )
  );

  if (issues.length > 0) {
    console.warn(
      '[audit-password-hashes] Legacy plain-text passwords found. Users must log in once with PASSWORD_LEGACY_PLAIN_ENABLED=true to rehash, or update sheets manually.'
    );
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('[audit-password-hashes] failed:', e);
  process.exit(1);
});
