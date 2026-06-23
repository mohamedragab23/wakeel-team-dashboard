# Password Security Audit Report (Phase 4D)

**Date:** 2026-06-23 (post-migration)  
**Command:** `npm run audit:password-hashes`  
**Method:** Read-only audit after Phase 3 bcrypt migration.

---

## Executive summary

| Metric | Value |
|--------|-------|
| Total accounts audited | **27** |
| bcrypt (`$2*`) accounts | **27** |
| Legacy plain-text accounts | **0** |
| bcrypt coverage | **100%** |
| Readiness score | **10 / 10** |
| `bcryptOnlyReady` | **true** |

*See [PASSWORD_MIGRATION_REPORT.md](./PASSWORD_MIGRATION_REPORT.md) for migration execution details.*

---

## Executive summary (pre-migration snapshot)

| Metric | Value |
|--------|-------|
| Total accounts audited | **27** |
| bcrypt (`$2*`) accounts | **12** |
| Legacy plain-text accounts | **15** |
| bcrypt coverage | **44%** |
| Readiness score | **4.4 / 10** |
| `bcryptOnlyReady` | **false** |

---

## Audit scope

| Sheet | Role | Password column |
|-------|------|---------------|
| المشرفين | Supervisor | Column E (index 4) |
| Admins / admins | Admin | Column C (index 2) |

Admin tab candidates not found in spreadsheet: `Admin`, `admin`, `الأدمن`, `الادمن` (expected — actual tabs: `Admins`, `admins`).

---

## Legacy plain-text accounts (15)

### Supervisors (13)

| Row | Code |
|-----|------|
| 7 | WA-006 |
| 8 | WA-007 |
| 11 | WA-010 |
| 12 | WA-011 |
| 13 | WA-012 |
| 14 | WA-013 |
| 15 | WA-014 |
| 17 | Ain shams |
| 18 | El rehab city |
| 19 | Mansoura |
| 20 | Tagammoa golden square |
| 21 | Heliopolis |
| 22 | Nasr city |

### Admins (2 entries, 1 unique code)

| Row | Code | Sheet |
|-----|------|-------|
| 5 | WA-014 | Admins |
| 5 | WA-014 | admins |

---

## bcrypt accounts (12)

Supervisors rows **2–6, 9–10, 16** (6 accounts) plus additional supervisors with `$2` hashes not in legacy list, and **~5 admin** accounts without legacy flag (Admins rows 2–4, 6 excluding WA-014).

---

## Weak hash check

| Check | Result |
|-------|--------|
| bcrypt cost factor | Not audited per-hash (read-only row scan only) |
| Empty passwords | Excluded from legacy count |
| Non-bcrypt non-plain | None detected |

---

## Migration readiness

| Step | Status |
|------|--------|
| `PASSWORD_LEGACY_PLAIN_ENABLED=true` during migration | Documented in Phase 3 |
| Login-time rehash (`lib/passwordRehash.ts`) | **Exists** |
| `npm run audit:password-hashes` | **Available** |
| bcrypt-only default (`lib/passwordUtils.ts`) | **Active** unless legacy flag set |

### Recommended migration path

1. Deploy with `PASSWORD_LEGACY_PLAIN_ENABLED=true` temporarily.
2. Each legacy user logs in once → bcrypt written to their row only.
3. Re-run audit until `legacyPlainCount: 0`.
4. Remove legacy flag.

**No bulk sheet password rewrite** — per-user login rehash only.

---

## Risk level

| Risk | Level |
|------|-------|
| Legacy plain-text in Sheets | **HIGH** |
| bcrypt-only enforcement without migration | **HIGH** (locks out legacy users) |
| Post-migration bcrypt-only | **LOW** |

---

## Sign-off

| Requirement | Met |
|-------------|-----|
| Read-only audit | Yes |
| No password modification | Yes |
| No user modification | Yes |
| Google Sheets data unchanged by audit | Yes |
