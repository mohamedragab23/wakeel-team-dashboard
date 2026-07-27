/**
 * SRS-012 Phase 1 — ONE-TIME Gmail OAuth bootstrap.
 *
 * Run this locally, once, to grant this project's Gmail-reading code
 * read-only access to mohamed.ragab2398@gmail.com and obtain a long-lived
 * refresh_token to store in Vercel env vars. This script NEVER runs in
 * production and is not called from any cron/route.
 *
 * Prerequisite (you do this once in Google Cloud Console — see chat):
 *   1. Enable the "Gmail API" on a GCP project.
 *   2. Configure the OAuth consent screen (External, scope: gmail.readonly).
 *   3. Create an OAuth Client ID of type "Desktop app".
 *   4. Put its Client ID / Secret in .env.local as:
 *        GMAIL_OAUTH_CLIENT_ID=...
 *        GMAIL_OAUTH_CLIENT_SECRET=...
 *
 * Usage: node scripts/gmail-oauth-bootstrap.mjs
 * It will print a URL — open it, log in as mohamed.ragab2398@gmail.com,
 * approve, then paste the resulting "code" back into this terminal.
 */
import dotenv from 'dotenv';
import readline from 'readline';
import { google } from 'googleapis';

dotenv.config({ path: '.env.local' });

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// Standard out-of-band redirect for Desktop-app OAuth clients.
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function main() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Missing GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET in .env.local.');
    console.error('Create an OAuth Client (Desktop app type) in Google Cloud Console first.');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh_token
    prompt: 'consent', // forces a refresh_token even on repeat runs
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in a browser where you are logged into mohamed.ragab2398@gmail.com:\n');
  console.log(authUrl);
  console.log('\n2. Approve access. Google will show you a code (or redirect — since this is a "Desktop app"');
  console.log('   client, it should show the code directly on the page).\n');

  const code = await prompt('3. Paste the code here and press Enter: ');

  const { tokens } = await oauth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error('\n⚠️  No refresh_token returned. This usually means you already granted consent before');
    console.error('   without "prompt=consent" forcing a new one. Revoke access at');
    console.error('   https://myaccount.google.com/permissions and re-run this script.');
    process.exit(1);
  }

  console.log('\n✅ Success. Add these to your Vercel project env vars (Production + Preview):\n');
  console.log(`GMAIL_OAUTH_CLIENT_ID=${clientId}`);
  console.log(`GMAIL_OAUTH_CLIENT_SECRET=${clientSecret}`);
  console.log(`GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\nAlso add the same three to your local .env.local for testing.');
  console.log('\nThis refresh_token does not expire from mere time passing, but Google may invalidate it if:');
  console.log('- you revoke access manually,');
  console.log('- the OAuth consent screen stays in "Testing" mode for >7 days without use (rare here, since');
  console.log('  the recovery engine will exercise it periodically), or');
  console.log('- you change the requested scopes later (would need a fresh consent).');
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
