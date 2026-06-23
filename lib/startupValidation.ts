import { assertJwtSecretConfigured, isJwtSecretConfigured } from '@/lib/jwtConfig';
import { isTicketingDbConfigured } from '@/lib/ticketing/db/client';

export type StartupValidationReport = {
  jwtSecretConfigured: boolean;
  ticketingDbConfigured: boolean;
  googleSheetsSpreadsheetId: boolean;
  warnings: string[];
};

let validated = false;

/**
 * Runtime validation only — never reads or writes Google Sheets.
 * Ticketing is optional; core dashboard continues if Neon is absent.
 */
export function runStartupValidation(): StartupValidationReport {
  if (validated) {
    return {
      jwtSecretConfigured: isJwtSecretConfigured(),
      ticketingDbConfigured: isTicketingDbConfigured(),
      googleSheetsSpreadsheetId: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()),
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    try {
      assertJwtSecretConfigured();
    } catch (e) {
      console.error('[startup]', e instanceof Error ? e.message : e);
      throw e;
    }
  } else if (!isJwtSecretConfigured()) {
    warnings.push('JWT_SECRET not set — using dev fallback (local only)');
  }

  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()) {
    warnings.push('GOOGLE_SHEETS_SPREADSHEET_ID not set');
  }

  if (!isTicketingDbConfigured()) {
    warnings.push('TICKETING_DATABASE_URL not set — ticketing module returns 503; Sheets dashboard unaffected');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CRON_SECRET?.trim()) {
    warnings.push('CRON_SECRET not set — scheduled cron endpoints will return 401');
  }

  if (process.env.NODE_ENV === 'production' && process.env.PASSWORD_LEGACY_PLAIN_ENABLED === 'true') {
    warnings.push('PASSWORD_LEGACY_PLAIN_ENABLED=true — legacy plain-text passwords allowed (disable after bcrypt migration)');
  }

  if (warnings.length > 0) {
    console.warn('[startup] validation warnings:', warnings.join(' | '));
  } else {
    console.info('[startup] validation OK');
  }

  validated = true;
  return {
    jwtSecretConfigured: isJwtSecretConfigured(),
    ticketingDbConfigured: isTicketingDbConfigured(),
    googleSheetsSpreadsheetId: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()),
    warnings,
  };
}
