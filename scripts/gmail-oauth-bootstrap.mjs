/**
 * SRS-012 Phase 1 — ONE-TIME Gmail OAuth bootstrap.
 *
 * Run this locally, once, to grant this project's Gmail-reading code
 * read-only access to your personal Gmail inbox and obtain a long-lived
 * refresh_token to store in Vercel env vars. This script NEVER runs in
 * production and is not called from any cron/route.
 *
 * Uses the "loopback" OAuth flow (RFC 8252) required by modern Google
 * "Desktop app" OAuth clients — Google deprecated the old copy/paste
 * out-of-band (OOB) code flow. This script starts a tiny local HTTP
 * server, opens/prints the consent URL, and automatically captures the
 * authorization code when Google redirects your browser back to
 * http://localhost:<port> after you approve access — no manual code
 * copy/paste needed.
 *
 * Prerequisite (done once in Google Cloud Console):
 *   1. Enable the "Gmail API" on a GCP project.
 *   2. Configure the OAuth consent screen (External, scope: gmail.readonly,
 *      and add your own Gmail address under "Test users" while the app is
 *      unpublished/Testing).
 *   3. Create an OAuth Client ID of type "Desktop app".
 *   4. Put its Client ID / Secret in .env.local as:
 *        GMAIL_OAUTH_CLIENT_ID=...
 *        GMAIL_OAUTH_CLIENT_SECRET=...
 *
 * Usage: node scripts/gmail-oauth-bootstrap.mjs
 */
import dotenv from 'dotenv';
import http from 'http';
import { google } from 'googleapis';

dotenv.config({ path: '.env.local' });

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CALLBACK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes to complete the browser consent

async function main() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('Missing GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET in .env.local.');
    console.error('Create an OAuth Client (Desktop app type) in Google Cloud Console first.');
    process.exit(1);
  }

  // Start the loopback server first so we know which port to register.
  let port;
  const portPromise = new Promise((r) => { port = r; });
  const codePromise = new Promise((resolveCode, rejectCode) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        code
          ? '<html><body style="font-family:sans-serif;padding:40px"><h2>✅ Done — you can close this tab and go back to the terminal.</h2></body></html>'
          : `<html><body style="font-family:sans-serif;padding:40px"><h2>❌ ${error || 'No code received'} — go back to the terminal.</h2></body></html>`
      );
      setImmediate(() => server.close());
      if (code) resolveCode(code);
      else rejectCode(new Error(error || 'No authorization code received'));
    });
    server.listen(0, '127.0.0.1', () => port(server.address().port));
    server.on('error', rejectCode);
    setTimeout(() => {
      server.close();
      rejectCode(new Error('Timed out waiting for the browser consent redirect (5 min).'));
    }, CALLBACK_TIMEOUT_MS);
  });

  const listenPort = await portPromise;
  const redirectUri = `http://localhost:${listenPort}`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh_token
    prompt: 'consent', // forces a refresh_token even on repeat runs
    scope: SCOPES,
  });

  console.log('\n1. Open this URL in a browser logged into the Gmail account you want to read OTPs from:\n');
  console.log(authUrl);
  console.log('\n2. Approve access. Your browser will redirect back automatically — no code to copy.');
  console.log('   Waiting for that redirect (up to 5 minutes)...\n');

  const code = await codePromise;

  const { tokens } = await oauth2Client.getToken(code);

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
  console.log('- the OAuth consent screen stays in "Testing" mode for >7 days without any use (the recovery');
  console.log('  engine will exercise it periodically, which resets this clock), or');
  console.log('- you change the requested scopes later (would need a fresh consent).');
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
