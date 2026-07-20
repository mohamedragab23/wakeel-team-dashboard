# SRS-006 — Executive Trust Center & Operational Validation (100%)

## Overview

Strategic Operations is an **Executive Decision Platform** with full trust, audit, lineage, and explainability:

1. **Executive Trust Center** — “Can I trust today’s numbers?”
2. **System Integrity Center** — dedicated health page
3. **Live Operations Audit** — Expected vs Calculated for every KPI
4. **KPI Lineage** — clickable dashboard KPI cards + audit rows
5. **Decision Confidence** — evidence / sample / risk on every management action
6. **Forecast Validation** — MAPE, intervals, reliability
7. **Root Cause Explainability** — what / why / impact / fix / recovery
8. **Executive Timeline** — hires, resignations, missing days, alerts
9. **Cross Validation** — sheet-vs-sheet consistency checks
10. **City Intelligence** — city-adapted targets and recommendations
11. **Supervisor Fairness** — size-normalized ranking
12. **Executive Decision Mode** — ≤10 bullet brief

## Where to find it

| Surface | Path |
|---------|------|
| Trust + Live Audit + SRS-006 panels | `/admin/strategic-ops` (after analysis runs) |
| Clickable Talabat KPI lineage | KPI cards → Lineage modal |
| System Integrity Center | `/admin/strategic-ops/integrity` |
| Trust Score API | `GET /api/strategic-ops/trust-score?...` |
| Live Audit API | `GET /api/strategic-ops/live-audit?...` |
| System Health API | `GET /api/strategic-ops/system-health?...` |
| Package on report | `report.srs006` from `buildStrategicOpsReport` |

## Engines

`lib/strategicOps/trust/` + `lib/strategicOps/audit/`

| Module | Role |
|--------|------|
| `trustScoreEngine.ts` | Composite trust score |
| `decisionConfidence.ts` | Action confidence |
| `forecastValidation.ts` | MAPE / intervals |
| `rootCauseExplainability.ts` | Expanded RCA |
| `executiveTimeline.ts` | Timeline events |
| `crossValidation.ts` | Cross-sheet checks |
| `cityIntelligence.ts` | City-adapted KPIs |
| `supervisorFairness.ts` | Fair ranking |
| `executiveDecisionMode.ts` | 10-bullet brief |
| `srs006Package.ts` | Aggregates all into `Srs006CompletePackage` |
| `audit/liveAuditEngine.ts` | Live Expected vs Calculated |
| `audit/traceToLineage.ts` | Trace → lineage modal |
| `systemHealth/healthMonitor.ts` | Integrity health |

## UI

`components/strategicOps/Srs006Panels.tsx` + Trust / Live Audit / Lineage modal.

## Tests

```bash
npm run test:trust
```

Includes Phase 1 engines + `lib/strategicOps/trust/srs006Phase2.test.ts`.

## Acceptance

All SRS-006 sections delivered and wired into the main Strategic Ops page and Integrity Center.
