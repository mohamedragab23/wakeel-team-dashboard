/**
 * SRS-012 Phase 0 — Okta Authentication API feasibility probe.
 *
 * Sends ONE real login attempt (username + password) to Okta's classic
 * Authentication API and reports what kind of response comes back —
 * WITHOUT ever triggering an OTP email send or attempting to complete the
 * login. This determines which of the SRS-012 design's risk scenarios
 * applies (classic engine w/ email factor vs. Identity Engine vs.
 * something else) before any further implementation.
 *
 * Requires (in .env.local, NOT pasted anywhere else):
 *   ROOSTER_OKTA_USERNAME=eg.wakeel.ext@talabat.com
 *   ROOSTER_OKTA_PASSWORD=...
 *
 * Usage: node scripts/phase0-okta-probe.mjs
 *
 * Safety: this script does NOT call any "verify"/"send" endpoint, does NOT
 * log the password, and does NOT persist anything anywhere. It only prints
 * the shape of Okta's response so we can decide the real implementation
 * plan.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const OKTA_ORIGIN = 'https://deliveryhero.okta.com';

async function main() {
  const username = process.env.ROOSTER_OKTA_USERNAME;
  const password = process.env.ROOSTER_OKTA_PASSWORD;

  if (!username || !password) {
    console.error('Missing ROOSTER_OKTA_USERNAME / ROOSTER_OKTA_PASSWORD in .env.local.');
    console.error('Add them there (never paste a password in chat) and re-run.');
    process.exit(1);
  }

  console.log(`Probing ${OKTA_ORIGIN}/api/v1/authn as ${username}...`);

  const res = await fetch(`${OKTA_ORIGIN}/api/v1/authn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username,
      password,
      options: { multiOptionalFactorEnroll: false, warnBeforePasswordExpired: false },
    }),
  });

  console.log('\nHTTP status:', res.status);
  const contentType = res.headers.get('content-type') || '';
  console.log('content-type:', contentType);

  if (!contentType.includes('json')) {
    const text = await res.text();
    console.log('\n⚠️  Non-JSON response — likely NOT the classic Authentication API.');
    console.log('This suggests Identity Engine (OIE) or a different login flow.');
    console.log('Body preview:', text.slice(0, 500));
    return;
  }

  const body = await res.json();
  // Redact anything that looks like a token/secret before printing.
  const redacted = JSON.parse(JSON.stringify(body));
  for (const key of ['stateToken', 'sessionToken', 'recoveryToken']) {
    if (redacted[key]) redacted[key] = `<redacted, length ${redacted[key].length}>`;
  }

  console.log('\nstatus field:', body.status);
  console.log('\nFull response shape (secrets redacted):');
  console.log(JSON.stringify(redacted, null, 2));

  if (body.status === 'MFA_REQUIRED' || body.status === 'MFA_CHALLENGE') {
    const factors = body._embedded?.factors || [];
    console.log('\n✅ Classic Authentication API confirmed. Available factors:');
    for (const f of factors) {
      console.log(` - factorType: ${f.factorType}, id: ${f.id}, provider: ${f.provider}`);
    }
    const emailFactor = factors.find((f) => f.factorType === 'email');
    console.log(
      emailFactor
        ? '\n✅ Email factor is available — matches the SRS-012 design as-is.'
        : '\n⚠️  No email factor found — design needs to target whichever factor IS available.'
    );
    console.log('\nStopping here on purpose (Phase 0 scope) — not triggering the send/verify step.');
  } else if (body.status === 'SUCCESS') {
    console.log('\n⚠️  Logged in with NO MFA challenge at all — unexpected given the OTP emails you receive.');
    console.log('Do not reuse this sessionToken from this probe output; re-run Phase 0 discussion with Cursor.');
  } else {
    console.log(`\n⚠️  Unexpected status "${body.status}" — needs manual review before proceeding.`);
  }
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
