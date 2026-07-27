/**
 * OAuth2 client for reading a PERSONAL Gmail inbox (mohamed.ragab2398@gmail.com).
 *
 * Deliberately separate from `lib/googleSheetsAuth.ts`: that file uses a
 * Service Account, which works for Sheets/Drive but CANNOT access a
 * personal (non-Workspace) Gmail inbox — domain-wide delegation only works
 * for Google Workspace-managed accounts. This uses a real 3-legged OAuth2
 * client instead, authorized once via `scripts/gmail-oauth-bootstrap.mjs`
 * (never run in production), producing a long-lived `refresh_token`.
 *
 * Scope: `gmail.readonly` only — this code never sends, deletes, or
 * modifies anything in the inbox, and never touches the existing
 * Apps-Script/Telegram forwarding setup.
 */
import { google } from 'googleapis';

export function isGmailOAuthConfigured(): boolean {
  return !!(
    process.env.GMAIL_OAUTH_CLIENT_ID?.trim() &&
    process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim() &&
    process.env.GMAIL_OAUTH_REFRESH_TOKEN?.trim()
  );
}

export function getGmailClient() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail OAuth not configured. Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN ' +
        '(see scripts/gmail-oauth-bootstrap.mjs for the one-time setup).'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}
