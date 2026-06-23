# Password Migration Report (Phase 3)

**Date:** 2026-06-23  
**Method:** bcrypt hash of legacy plain-text password cells only  
**Backup before migration:** `exports/sheets-backup-2026-06-23T14-48-27-014Z`

---

## Executive summary

| Metric | Before | After |
|--------|-------:|------:|
| Legacy plain-text accounts | **15** | **0** |
| bcrypt accounts | 12 | **27** |
| bcrypt coverage | 44% | **100%** |
| `bcryptOnlyReady` | false | **true** |
| Readiness score | 4.4/10 | **10/10** |

**Verdict: PASS** — all legacy passwords migrated to bcrypt.

---

## What was done

1. **Read-only backup** — `npm run backup:sheets`
2. **Pre-audit** — `npm run audit:password-hashes` → 15 legacy rows
3. **Dry run** — `npm run migrate:passwords -- --dry-run` → 15 accounts
4. **Migration** — `npm run migrate:passwords` → **14 password cells updated**
5. **Post-audit** — `legacyPlainCount: 0`, `bcryptOnlyReady: true`

Only password columns were modified (supervisors col E, admins col C). No user rows deleted. No other sheet data changed.

---

## Migrated accounts (14 cells)

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

### Admins (1)

| Sheet | Row | Code |
|-------|-----|------|
| Admins | 5 | WA-014 |

*Pre-audit listed `admins` tab duplicate for WA-014; only `Admins` tab exists in spreadsheet — post-audit confirms 0 legacy rows.*

---

## Production configuration

| Setting | Value |
|---------|-------|
| `PASSWORD_LEGACY_PLAIN_ENABLED` | **Not set** (bcrypt-only — correct) |
| Login-time rehash | Still active as safety net (`lib/passwordRehash.ts`) |

**No Vercel env change required** — migration completed without legacy login flag.

---

## User impact

- **Passwords unchanged** — same credentials work; only storage format is bcrypt
- Users can log in immediately with existing passwords
- No forced password reset

---

## Rollback

Restore password cells from backup:

```
exports/sheets-backup-2026-06-23T14-48-27-014Z/
```

Tabs: `المشرفين`, `Admins` — password columns only.

---

## Commands

```bash
npm run audit:password-hashes      # verify zero legacy
npm run migrate:passwords -- --dry-run
npm run migrate:passwords            # one-time migration (already executed)
```

---

## Sign-off

| Policy | Met |
|--------|-----|
| bcrypt migration complete | Yes |
| `bcryptOnlyReady: true` | Yes |
| Backup before migration | Yes |
| Strategic Ops / business logic unchanged | Yes |

---

## Next phases

| Phase | Task | Status |
|-------|------|--------|
| 1 | Redis | Complete |
| 2 | Sentry | Complete |
| **3** | Password migration | **Complete** |
| 4 | Daily backup cron | Next |
| 5 | Neon read replica | Design only |
