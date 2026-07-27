/**
 * SRS-013 Phase 1 — Automatic Shift Import — acceptance test runner.
 *
 * Hits a locally running `next dev` server (http://127.0.0.1:3000) with
 * hand-minted JWTs (same secret the server reads from .env.local) to verify
 * the contract from SRS013_DESIGN_FREEZE.md Phase 1 §6 without needing a
 * real login or a live Rooster call for every case.
 *
 * Run: npx tsx scripts/srs013-phase1-verify.ts   (with `npm run dev` already running)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/jwtConfig';

const BASE = 'http://127.0.0.1:3000';

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
  console.log('=== SRS-013 Phase 1 — Acceptance Test Runner ===\n');

  // Test 6: No token -> 401
  {
    const res = await fetch(`${BASE}/api/rooster/shifts/import`, { method: 'POST' });
    check('Test 6a: no token -> 401', res.status === 401, `status=${res.status}`);
  }

  // Test 6b: bogus token -> 401
  {
    const res = await fetch(`${BASE}/api/rooster/shifts/import`, {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    check('Test 6b: bogus token -> 401', res.status === 401, `status=${res.status}`);
  }

  // GET status-check with valid admin token (works regardless of flag state)
  let enabled = false;
  let zones: string[] = [];
  {
    const res = await fetch(`${BASE}/api/rooster/shifts/import`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await res.json();
    enabled = Boolean(j.enabled);
    zones = Array.isArray(j.zones) ? j.zones : [];
    check(
      'GET status-check: 200 + shape',
      res.status === 200 && j.success === true && typeof j.enabled === 'boolean' && Array.isArray(j.zones),
      `status=${res.status} enabled=${enabled} zones=${JSON.stringify(zones)}`
    );
  }

  // Test 1: flag off -> POST 503 (only meaningful if actually off in this env)
  if (!enabled) {
    const res = await fetch(`${BASE}/api/rooster/shifts/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: 'Alexandria', startDate: '2026-07-01', endDate: '2026-07-07' }),
    });
    const j = await res.json().catch(() => ({}));
    check('Test 1: flag off -> 503', res.status === 503 && j.enabled === false, `status=${res.status} body=${JSON.stringify(j)}`);
  } else {
    console.log('ℹ️  SKIP Test 1 (flag off->503): FEATURE_SHIFT_IMPORT_ENABLED is true in this env.');
  }

  // Test 3: date range validation (45-day span -> 400), using a token + flag-independent path:
  // we force the flag on for this one call via a temp env override is not possible cross-process,
  // so this only runs meaningfully when the flag is already on. If off, the 503 branch short-circuits
  // before validation runs -- so we only assert 400 here when enabled is true, to avoid a false negative.
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/shifts/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: zones[0] || 'Alexandria', startDate: '2026-06-01', endDate: '2026-07-16' }), // 45 days
    });
    const j = await res.json().catch(() => ({}));
    check('Test 3: 45-day range -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  } else {
    console.log('ℹ️  SKIP Test 3 (45-day range->400): requires flag ON (validation runs after the flag check).');
  }

  // Test: unknown zone -> 400 (only meaningful when enabled, same reasoning as above)
  if (enabled) {
    const res = await fetch(`${BASE}/api/rooster/shifts/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: 'Nonexistent-Zone-QA', startDate: '2026-07-01', endDate: '2026-07-02' }),
    });
    const j = await res.json().catch(() => ({}));
    check('Test: unknown zone -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  } else {
    console.log('ℹ️  SKIP (unknown zone->400): requires flag ON.');
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
