/**
 * SRS-012 Layer 3 — Okta's classic Authentication API client.
 *
 * Confirmed live (2026-07-27) against deliveryhero.okta.com: username +
 * password → MFA_REQUIRED with a single `email` factor → trigger send →
 * poll Gmail for the code → verify → sessionToken. No browser, no JS
 * execution — three plain HTTP calls, matching this repo's existing
 * fetch-only architecture.
 *
 * This module only talks to Okta. It never touches Cloudflare Access or
 * the app itself — see `oktaSessionExchange.ts` for the next step
 * (sessionToken → fresh app cookies).
 */
import { logStructured } from '@/lib/requestTrace';

export type EmailFactor = {
  id: string;
  verifyUrl: string;
};

export type OktaLoginStartResult =
  | { success: true; stateToken: string; emailFactor: EmailFactor; expiresAt: string }
  | { success: false; reason: string };

export type OktaTriggerResult =
  | { success: true; stateToken: string }
  | { success: false; reason: string };

export type OktaVerifyResult =
  | { success: true; sessionToken: string }
  | { success: false; reason: string };

function oktaOrigin(): string {
  return process.env.ROOSTER_OKTA_ORIGIN?.trim() || 'https://deliveryhero.okta.com';
}

/**
 * Step 1: POST /api/v1/authn with username + password.
 * Expects `MFA_REQUIRED` with exactly the email factor this tenant is
 * configured with (confirmed: no push/other factors on this account).
 */
export async function startOktaLogin(username: string, password: string): Promise<OktaLoginStartResult> {
  try {
    const res = await fetch(`${oktaOrigin()}/api/v1/authn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        username,
        password,
        options: { multiOptionalFactorEnroll: false, warnBeforePasswordExpired: false },
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logStructured('error', 'rooster_okta_login_start_failed', { status: res.status, bodyPreview: body.slice(0, 200) });
      return { success: false, reason: `authn_http_${res.status}` };
    }

    const body = await res.json();

    if (body.status !== 'MFA_REQUIRED' && body.status !== 'MFA_CHALLENGE') {
      logStructured('warn', 'rooster_okta_login_unexpected_status', { status: body.status });
      return { success: false, reason: `unexpected_status_${body.status}` };
    }

    const factors: any[] = body._embedded?.factors || [];
    const emailFactor = factors.find((f) => f.factorType === 'email');
    if (!emailFactor) {
      logStructured('error', 'rooster_okta_login_no_email_factor', { availableFactors: factors.map((f) => f.factorType) });
      return { success: false, reason: 'no_email_factor_configured' };
    }

    return {
      success: true,
      stateToken: body.stateToken,
      emailFactor: { id: emailFactor.id, verifyUrl: emailFactor._links.verify.href },
      expiresAt: body.expiresAt,
    };
  } catch (err: any) {
    logStructured('error', 'rooster_okta_login_start_exception', { error: err?.message || String(err) });
    return { success: false, reason: `exception: ${err?.message || String(err)}` };
  }
}

/**
 * Step 2: POST the factor's verify link with only `stateToken` (no
 * passCode) — this is what actually triggers Okta to send the OTP email.
 */
export async function triggerEmailFactorSend(emailFactor: EmailFactor, stateToken: string): Promise<OktaTriggerResult> {
  try {
    const res = await fetch(emailFactor.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ stateToken }),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (body.status !== 'MFA_CHALLENGE') {
      logStructured('error', 'rooster_okta_trigger_send_failed', { status: body.status });
      return { success: false, reason: `unexpected_status_${body.status}` };
    }
    logStructured('info', 'rooster_okta_otp_send_triggered', {});
    return { success: true, stateToken: body.stateToken || stateToken };
  } catch (err: any) {
    logStructured('error', 'rooster_okta_trigger_send_exception', { error: err?.message || String(err) });
    return { success: false, reason: `exception: ${err?.message || String(err)}` };
  }
}

/**
 * Step 3 (after the OTP code has been obtained — see gmailOtpReader.ts):
 * POST the passCode to the same verify link → SUCCESS + sessionToken.
 */
export async function verifyEmailFactorOtp(emailFactor: EmailFactor, stateToken: string, passCode: string): Promise<OktaVerifyResult> {
  try {
    const res = await fetch(emailFactor.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ stateToken, passCode }),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (body.status !== 'SUCCESS' || !body.sessionToken) {
      logStructured('warn', 'rooster_okta_otp_verify_failed', { status: body.status, errorSummary: body.errorSummary });
      return { success: false, reason: body.errorSummary || `unexpected_status_${body.status}` };
    }
    logStructured('info', 'rooster_okta_otp_verify_ok', {});
    return { success: true, sessionToken: body.sessionToken };
  } catch (err: any) {
    logStructured('error', 'rooster_okta_otp_verify_exception', { error: err?.message || String(err) });
    return { success: false, reason: `exception: ${err?.message || String(err)}` };
  }
}
