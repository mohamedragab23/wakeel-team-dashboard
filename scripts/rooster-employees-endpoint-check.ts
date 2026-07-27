/**
 * SRS-013 Phase 2 validation — READ-ONLY probe of the newly-identified
 * Rider Search endpoint against the REAL Rooster backend, using ONLY the
 * existing, already-in-production auth layer (`getRoosterLiveHeaders()`).
 *
 * This script does NOT hardcode or store any of the credentials the user
 * captured manually (Bearer token / cookies / refresh token from their own
 * browser session) — it exclusively reuses whatever Cookie header is
 * already configured for this project (env or Google Sheet `cron_config`),
 * exactly the same headers `runRoosterLiveSync()` uses every minute in
 * production.
 *
 * Purpose: confirm the endpoint shape (status code, response JSON schema,
 * pagination behavior, filter behavior) so SRS013 can be updated with a
 * verified contract instead of an assumed one. This is validation only —
 * no product code (API route / UI) is added by this script.
 *
 * Usage: npx tsx scripts/rooster-employees-endpoint-check.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getRoosterLiveHeaders, getRoosterAppOrigin } from '@/lib/roosterLive/tokenProvider';
import { smartRefreshRoosterAuth } from '@/lib/roosterLive/authRefresh';

type ProbeCase = {
  label: string;
  query: Record<string, string>;
};

async function probe(origin: string, headers: Record<string, string>, c: ProbeCase) {
  const qs = new URLSearchParams(c.query).toString();
  const url = `${origin}/api/rooster/v3/employees?${qs}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      cache: 'no-store',
    });
    const durationMs = Date.now() - startedAt;
    const contentType = res.headers.get('content-type') || '';
    let bodyPreview: unknown = null;
    let fieldNames: string[] = [];
    let sampleCount: number | null = null;

    if (contentType.toLowerCase().includes('json')) {
      const json: any = await res.json().catch(() => null);
      // Try to find the array of records regardless of envelope shape
      const arr: any[] | null = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.items)
            ? json.items
            : Array.isArray(json?.results)
              ? json.results
              : Array.isArray(json?.content)
                ? json.content
                : null;

      if (arr) {
        sampleCount = arr.length;
        if (arr[0] && typeof arr[0] === 'object') {
          fieldNames = Object.keys(arr[0]);
          const first: any = arr[0];
          if (Array.isArray(first.contracts) && first.contracts[0] && typeof first.contracts[0] === 'object') {
            console.log('NESTED contracts[0] FIELD NAMES:', Object.keys(first.contracts[0]));
          }
          if (first.active_contract && typeof first.active_contract === 'object') {
            console.log('NESTED active_contract FIELD NAMES:', Object.keys(first.active_contract));
          }
          if (first.bank_data && typeof first.bank_data === 'object') {
            console.log('NESTED bank_data FIELD NAMES:', Object.keys(first.bank_data));
          }
          if (first.reporting_to && typeof first.reporting_to === 'object') {
            console.log('NESTED reporting_to FIELD NAMES:', Object.keys(first.reporting_to));
          }
        }
        // Also surface any response-level pagination metadata if the envelope has it
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          const topKeys = Object.keys(json).filter((k) => !['data', 'items', 'results', 'content'].includes(k));
          if (topKeys.length) console.log('TOP-LEVEL ENVELOPE KEYS (pagination metadata?):', topKeys);
        }
      } else if (json && typeof json === 'object') {
        fieldNames = Object.keys(json);
      }
      // Redact any values before printing -- we only want field NAMES/shape, never real PII.
      bodyPreview = arr ? `[array of ${arr.length} object(s)]` : '[object -- see fieldNames]';
      // Error envelopes (status/error/message/path/exception) contain zero PII --
      // safe to print in full, and essential for documenting failure handling.
      if (json && typeof json === 'object' && 'status' in json && 'error' in json) {
        console.log('ERROR BODY (safe -- no PII):', {
          status: json.status,
          error: json.error,
          message: json.message,
          path: json.path,
          exception: json.exception,
        });
      }
    } else {
      const text = await res.text().catch(() => '');
      bodyPreview = text.slice(0, 200);
    }

    console.log('---');
    console.log('CASE:', c.label);
    console.log('URL:', url.replace(/(\?|&)([^=]+)=[^&]*/g, (m, p1, p2) => `${p1}${p2}=<redacted-in-log-only-if-value>`));
    console.log('STATUS:', res.status, res.statusText, `(${durationMs}ms)`);
    console.log('CONTENT-TYPE:', contentType);
    console.log('RATE-LIMIT HEADERS:', {
      'x-ratelimit-limit': res.headers.get('x-ratelimit-limit'),
      'x-ratelimit-remaining': res.headers.get('x-ratelimit-remaining'),
      'retry-after': res.headers.get('retry-after'),
    });
    console.log('ALL RESPONSE HEADER NAMES:', Array.from(res.headers.keys()));
    console.log('X-TOTAL-COUNT / X-TOTAL / TOTAL-COUNT:', {
      'x-total-count': res.headers.get('x-total-count'),
      'x-total': res.headers.get('x-total'),
      'total-count': res.headers.get('total-count'),
    });
    console.log('SAMPLE COUNT:', sampleCount);
    console.log('FIELD NAMES:', fieldNames);
    console.log('BODY PREVIEW:', bodyPreview);
  } catch (err: any) {
    console.log('---');
    console.log('CASE:', c.label, '=> THREW:', err?.message || String(err));
  }
}

async function resolveHeaders(): Promise<Record<string, string>> {
  const baseHeaders = await getRoosterLiveHeaders();
  // Match production exactly: live-riders sync always mints a fresh dhh_token
  // (Layer 1) via the same Okta endpoint before calling any Rooster API --
  // the employees endpoint appears to require this too (first probe without
  // it returned the Cloudflare Access sign-in HTML page, not JSON).
  const outcome = await smartRefreshRoosterAuth(baseHeaders);
  if (!outcome.headers) {
    throw new Error(`smartRefreshRoosterAuth failed to produce usable headers: ${outcome.failureReason}`);
  }
  return outcome.headers;
}

async function main() {
  const headers = await resolveHeaders();
  const origin = getRoosterAppOrigin();
  console.log('Using origin:', origin);
  console.log('Using header keys (names only, never values):', Object.keys(headers));

  const cases: ProbeCase[] = [
    {
      label: 'List active-contract employees, page 0 size 2 (no search term) -- shape probe',
      query: { filter_status: 'active_contract', with_contracts: 'true', page: '0', size: '2' },
    },
    {
      label: 'Pagination probe: page 1 size 1',
      query: { filter_status: 'active_contract', with_contracts: 'true', page: '1', size: '1' },
    },
  ];

  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop
    await probe(origin, headers, c);
  }

  console.log('\nDone. No search_id used in this pass (avoids needing a real known ID); re-run with a real');
  console.log('Worker ID via CLI arg to validate search_id + with_field=id_number, e.g.:');
  console.log('  npx tsx scripts/rooster-employees-endpoint-check.ts <worker_id>');
}

const cliSearchId = process.argv[2];
if (cliSearchId) {
  (async () => {
    const headers = await resolveHeaders();
    const origin = getRoosterAppOrigin();
    await probe(origin, headers, {
      label: `Search by id_number = <cli arg, not logged>`,
      query: { search_id: cliSearchId, with_field: 'id_number', filter_status: 'active_contract', with_contracts: 'true', page: '0', size: '5' },
    });
  })().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
} else {
  main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  });
}
