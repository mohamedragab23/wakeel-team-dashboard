# SRS-007 — Digital Twin & Simulation Engine (100%)

## Overview

Strategic Operations includes a full **Digital Twin sandbox**:

- Isolated in-memory twin from live report data
- Scenario / What-If simulation with financial + risk impact
- Hybrid persistence: localStorage drafts + Neon saved scenarios
- City Expansion (open / close / expand / reduce) with break-even
- Mature multi-objective optimization plan
- Model Learning: prediction vs actual + MAPE calibration
- Executive War Room page

**No simulation writes to Google Sheets or production rider data.**

## Surfaces

| Surface | Path |
|---------|------|
| War Room + What-If Lab | `/admin/strategic-ops/war-room` |
| City Expansion panel | same page |
| Model Learning / Actual Result | same page |
| Snapshot API | `GET /api/strategic-ops/digital-twin/snapshot?...` |
| Simulate API | `POST /api/strategic-ops/digital-twin/simulate` |
| Optimal Plan API | `POST /api/strategic-ops/digital-twin/optimal-plan` |
| City Expansion API | `POST /api/strategic-ops/digital-twin/city-expansion` |
| Learning API | `GET /api/strategic-ops/digital-twin/learning` |
| Scenarios API | `GET/POST /api/strategic-ops/digital-twin/scenarios` |
| Scenario by id | `GET/PATCH/DELETE /api/strategic-ops/digital-twin/scenarios/[id]` (`actualResult` / `variance` via PATCH) |

## Modules

`lib/strategicOps/digitalTwin/`

- `twinBuilder.ts` — snapshot from `StrategicOpsReport`
- `scenarioEngine.ts` — apply levers + `runSimulation`
- `financialEngine.ts` / `riskEngine.ts` / `decisionEngine.ts`
- `hiringSimulation.ts` / `terminationSimulation.ts` / `productivitySimulation.ts`
- `supervisorSimulation.ts` / `targetSimulation.ts` / `timelineProjection.ts`
- `cityExpansion.ts` — open/close/expand/reduce + break-even
- `matureOptimization.ts` — multi-candidate optimal plan
- `modelLearning.ts` — MAPE / bias / calibration factors
- `persistence/localDrafts.ts` + `persistence/neonStore.ts`

## Neon

Table: `simulation_scenarios` (includes `actual_result_json` / `variance_json` for learning).

```bash
npm run migrate:simulation
```

## Tests

```bash
npm run test:digital-twin
```

Includes Phase 1 + `lib/strategicOps/digitalTwin/srs007Phase2.test.ts`.

## Acceptance

All SRS-007 sections delivered and wired into the Executive War Room.
