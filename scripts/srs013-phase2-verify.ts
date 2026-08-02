/**
 * SRS-013 Phase 2 — Rider Search — acceptance test runner.
 *
 * Hits a locally running `next dev` server (http://127.0.0.1:3000) with
 * hand-minted JWTs to verify the contract from SRS013_DESIGN_FREEZE.md
 * Phase 2 §6, mirroring `scripts/srs013-phase1-verify.ts`'s structure.
 *
 * Run: npx tsx scripts/srs013-phase2-verify.ts   (with `npm run dev` already running)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/jwtConfig';

// Defaults to a local `next dev` server; set VERIFY_BASE_URL to point this at
// production instead (same convention as scripts/srs013-phase3-verify.ts).
const BASE = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';

function mintToken(payload: Record<string, any>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '10m' });
}

const adminToken = mintToken({ role: 'admin', name: 'QA Admin', code: 'QA-ADMIN' });

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`✅ PASS — ${name}: ${detail}`);
  } else {
    failed++;
    console.log(`❌ FAIL — ${name}: ${detail}`);
  }
}

async function main() {
  console.log('=== SRS-013 Phase 2 — Acceptance Test Runner ===\n');

  // No token -> 401
  {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=workerId&q=877614`);
    check('Test 1: no token -> 401', res.status === 401, `status=${res.status}`);
  }

  // Bogus token -> 401
  {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=workerId&q=877614`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    check('Test 2: bogus token -> 401', res.status === 401, `status=${res.status}`);
  }

  // Capability check (no type/q) -- works regardless of flag state
  let enabled = false;
  {
    const res = await fetch(`${BASE}/api/rooster/riders/search`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json();
    enabled = Boolean(j.enabled);
    check(
      'Test 3: capability check shape',
      res.status === 200 && j.success === true && typeof j.enabled === 'boolean' && Array.isArray(j.availableTypes),
      `status=${res.status} enabled=${enabled} availableTypes=${JSON.stringify(j.availableTypes)}`
    );
  }

  // Flag off -> 503 (only meaningful if actually off in this env)
  if (!enabled) {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=workerId&q=877614`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json().catch(() => ({}));
    check('Test 4: flag off -> 503', res.status === 503 && j.enabled === false, `status=${res.status} body=${JSON.stringify(j)}`);
  } else {
    console.log('ℹ️  SKIP Test 4 (flag off->503): FEATURE_RIDER_SEARCH_ENABLED is true in this env.');
  }

  // Invalid type -> 400 (flag-independent check needs flag ON to get past the 503 short-circuit)
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=bogus&q=877614`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json().catch(() => ({}));
    check('Test 5: invalid type -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  } else {
    console.log('ℹ️  SKIP Test 5 (invalid type->400): requires flag ON.');
  }

  // Missing q -> 400
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=workerId&q=`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json().catch(() => ({}));
    check('Test 6: missing q -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  } else {
    console.log('ℹ️  SKIP Test 6 (missing q->400): requires flag ON.');
  }

  // Real search by a known Worker ID -> 200, merged profile shape, source tags present.
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=workerId&q=877614`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json().catch(() => ({}));
    const first = j?.results?.[0];
    check(
      'Test 7: real Worker ID search -> 200 + merged profile',
      res.status === 200 &&
        j.success === true &&
        Array.isArray(j.results) &&
        j.results.length >= 1 &&
        first?.workerId === '877614' &&
        typeof first?.fieldSources === 'object',
      `status=${res.status} name=${first?.name} workerId=${first?.workerId} fieldSources=${JSON.stringify(first?.fieldSources)}`
    );
  } else {
    console.log('ℹ️  SKIP Test 7 (real Worker ID search): requires flag ON + live Rooster auth.');
  }

  // Unknown Worker ID -> success:true, results:[] (clean not-found, not an error).
  // NOTE: must stay in-range for a real Rooster employee id (~6-8 digits) -- an
  // out-of-range numeric value (e.g. 12 digits) legitimately 409s server-side
  // (integer overflow), which we correctly map to invalid_search_term, not a bug.
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=workerId&q=1234567`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json().catch(() => ({}));
    check(
      'Test 8: unknown Worker ID -> 200 + empty results',
      res.status === 200 && j.success === true && Array.isArray(j.results) && j.results.length === 0,
      `status=${res.status} results=${JSON.stringify(j.results)}`
    );
  } else {
    console.log('ℹ️  SKIP Test 8 (unknown Worker ID): requires flag ON + live Rooster auth.');
  }

  // Name substring search -> should return at least one match via the client-side-filter fallback.
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/riders/search?type=name&q=Abanoub`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json().catch(() => ({}));
    check(
      'Test 9: name substring search -> 200 + >=1 result',
      res.status === 200 && j.success === true && Array.isArray(j.results) && j.results.length >= 1,
      `status=${res.status} count=${j.results?.length}`
    );
  } else {
    console.log('ℹ️  SKIP Test 9 (name search): requires flag ON + live Rooster auth.');
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
