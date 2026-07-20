# SRS-008 — Operational Validation & Production Certification (100%)

## Principle

**System Works → System Proven** when Production Certificate = **PASS**.

## Surfaces

| Surface | Path |
|---------|------|
| Validation Center | `/admin/strategic-ops/validation-center` |
| Production Certification | `/admin/strategic-ops/certification` |
| KPI Explorer | `/admin/strategic-ops/kpi-explorer` |
| Trust Center | `/admin/strategic-ops/trust-center` |
| API | `GET /api/strategic-ops/ops-validation` (`?live=0` to skip Sheets) |
| History | `GET /api/strategic-ops/ops-validation?history=1` |
| Cron | `GET /api/cron/ops-validation` (daily 04:30 UTC via `vercel.json`) |
| CLI | `npm run test:ops-validation` |

## Definition of Done — status

| Requirement | Status |
|-------------|--------|
| 150+ operational cases | ✅ |
| KPI Accuracy ≥ 99.5% | ✅ (suite gates) |
| Filter Accuracy 100% | ✅ (E2E in-memory + live when creds) |
| Attribution Accuracy 100% | ✅ model + **wired in `buildReport` / `dataIntegrity`** |
| Forecast MAPE gates | ✅ |
| AI Validation ≥ 90% | ✅ |
| Security Pass | ✅ (cron auth probe + RBAC matrix) |
| Export Pass | ✅ (text/excel/csv/pdf structure) |
| Performance Pass (incl. 500k) | ✅ |
| Trust / Validation / Certification / KPI Explorer | ✅ |
| Automated runner + history | ✅ |

## Production attribution (critical)

1. `ValidatedPerfRec` carries `supervisorCode` / `zone` / `supervisorFromSheet`
2. Optional daily-sheet supervisor column detected by header (`مشرف` / `supervisor`)
3. Else master stamp for that rider
4. `buildReport` supervisor hours filter by **day** `supervisorCode`
5. Fleet metrics under supervisor filter also use day-level rows

## Modules

`lib/strategicOps/opsValidation/` — suites P1+P2+P3, liveSuite, historyStore, exportValidation, certificationEngine  
`lib/strategicOps/dataIntegrity.ts` — day supervisor enrichment  
`lib/strategicOps/buildReport.ts` — day-level aggregation  
`app/api/cron/ops-validation` — scheduled runs  

## Notes

- Live Sheets suite runs when Google credentials exist; otherwise skips without failing critical DoD.
- History stored under `.data/ops-validation-history.json` (add to `.gitignore` if needed).
