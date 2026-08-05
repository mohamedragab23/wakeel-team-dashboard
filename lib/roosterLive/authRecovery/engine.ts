/**
 * SRS-012 ? Layer 3: full Authentication Recovery Engine.
 *
 * Last resort, tried only after Layer 1 (dhh_token mint) and Layer 2
 * (silent Cloudflare Access session replay) have both failed ? i.e. the
 * underlying Okta SSO session itself is genuinely dead, not just
 * CF_Authorization's own 24h JWT.
 *
 * Performs the FULL login: username + password ? Okta email-OTP
 * challenge ? reads the OTP from Gmail automatically (no human) ? submits
 * it ? exchanges the resulting sessionToken for fresh app cookies. Proven
 * live end-to-end on 2026-07-27 (manually-supplied OTP for that one
 * validation run); this module is the automated version of that same,
 * already-proven chain.
 *
 * Every step returns a structured `reason` on failure ? nothing throws
 * unhandled, matching the rest of this codebase's convention. The caller
 * (`authRefresh.ts`) is responsible for persisting the result and for the
 * "Telegram only on total failure" alerting behavior.
 */
import { logStructured } from '@/lib/requestTrace';
import { getRoosterAppOrigin, getRoosterKeepAliveUrl } from '@/lib/roosterLive/tokenProvider';
import { captureFreshCloudflareAuthorizeState, exchangeSessionTokenForAppCookies } from './oktaSessionExchange';
import { startOktaLogin, triggerEmailFactorSend, verifyEmailFactorOtp } from './oktaAuthnClient';
import { waitForOktaOtpEmail } from './gmailOtpReader';
import { isGmailImapConfigured } from '@/lib/gmailImap';

export type FullRecoveryResult = { success: true; appCookieHeader: string } | { success: false; reason: string };

/** Both the Okta credential and the Gmail IMAP OTP-reading piece must be configured. */
export function isFullAuthRecoveryConfigured(): boolean {
  const hasOktaCreds = !!(process.env.ROOSTER_OKTA_USERNAME?.trim() && process.env.ROOSTER_OKTA_PASSWORD?.trim());
  return hasOktaCreds && isGmailImapConfigured();
}

export async function recoverRoosterAuthFully(): Promise<FullRecoveryResult> {
  const username = process.env.ROOSTER_OKTA_USERNAME?.trim();
  const password = process.env.ROOSTER_OKTA_PASSWORD?.trim();
  if (!username || !password) {
    return { success: false, reason: 'okta_credentials_not_configured' };
  }
  if (!isGmailImapConfigured()) {
    return { success: false, reason: 'gmail_imap_not_configured' };
  }

  logStructured('warn', 'rooster_full_recovery_attempt', {
    message: 'Layers 1+2 failed ? attempting full Okta login + Gmail OTP recovery.',
  });

  const appOrigin = getRoosterAppOrigin();
  const appUrl = getRoosterKeepAliveUrl();

  const state = await captureFreshCloudflareAuthorizeState(appOrigin, appUrl);
  if (!state) {
    return { success: false, reason: 'cf_authorize_state_capture_failed' };
  }

  const loginAttemptStartedAt = Date.now();

  const start = await startOktaLogin(username, password);
  if (!start.success) {
    return { success: false, reason: start.reason };
  }

  const trigger = await triggerEmailFactorSend(start.emailFactor, start.stateToken);
  if (!trigger.success) {
    return { success: false, reason: trigger.reason };
  }

  const otp = await waitForOktaOtpEmail({ sinceEpochMs: loginAttemptStartedAt });
  if (!otp.success) {
    return { success: false, reason: otp.reason };
  }

  const verify = await verifyEmailFactorOtp(start.emailFactor, trigger.stateToken, otp.code);
  if (!verify.success) {
    return { success: false, reason: verify.reason };
  }

  const exchange = await exchangeSessionTokenForAppCookies(state, verify.sessionToken, appOrigin);
  if (!exchange.success) {
    return { success: false, reason: exchange.reason };
  }

  logStructured('info', 'rooster_full_recovery_ok', {
    message: 'Recovered from a fully-dead session automatically via Okta login + Gmail OTP ? no human involved.',
  });
  return { success: true, appCookieHeader: exchange.appCookieHeader };
}
