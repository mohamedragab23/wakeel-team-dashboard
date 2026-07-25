# SRS-010 — Executive Decision Intelligence (COO Experience)

Goal: transform Strategic Operations from a **reporting tool** into a **COO
Decision System**. Every screen should answer: what's wrong, why, who's
responsible, what's the money impact, what to do first, what happens if
ignored — within 30 seconds, without charts.

Status: **Phase 1 + Phase 2 shipped.** This document tracks exactly what is
**real and wired end-to-end** vs. anything still open — no feature is claimed
"done" unless it renders from live data in the actual pages (verified with
`tsc --noEmit` and a full `next build`, both passing with 0 errors as of this
revision).

## 1. Interconnected Tabs (cross-linking backbone) — the top requested item

> "المفروض لو دخلت Strategic Operations وشفت Health Score = 61 ودوست عليها،
> ياخدك مباشرة إلى سبب المشكلة في Integrity Center، التحقق في Validation
> Center، معادلة الـ KPI في KPI Explorer، مستوى الثقة في Trust Center، وهل
> تمنع الاعتماد في Enterprise Certification."

This is now true end-to-end, not just a navigation banner:

- **Canonical KPI registry** — `lib/strategicOps/kpiIntelligence/registry.ts`.
  Every KPI shown anywhere resolves to one stable id (`target_achievement`,
  `active_riders`, `headcount`, `no_show`, `utilization`, `ghost_riders`,
  `data_quality`, `forecast_accuracy`, `trust_score`), each with formula,
  dependencies, affected KPIs, owner, and a `certificationLevelHint`.
- **`buildKpiDeepLinks(kpiId)`** builds `?kpi=<id>` URLs into all 5 surfaces.
  `KpiCrossLinkBanner` renders on all 5 satellite pages and shows one-click
  links to the same KPI on the other 4.
- **`KPIIntelligencePanel`** — opened from the Health Score, Root Cause Tree
  nodes, Action cards, COO Mode answers, and every cross-linked surface.
  Landing via `?kpi=` auto-opens it. Ends with direct links to Integrity /
  Validation / Explorer / Trust / Certification for the *same* KPI.
- **Real per-row filtering/highlighting by `?kpi=` on arrival** (not just a
  banner) — this is what makes it an Operating System instead of 5 linked
  pages:
  - **Integrity Center** (`ExecutiveIntegrityCenter`): issues whose
    `affectedKpiIds` include the focused KPI float to the top with a cyan
    ring; a "🔗 المؤشر المرتبط" button opens the KPI panel from the card.
  - **Validation Center** (`ExecutiveValidationCenter`): same
    float-to-top + ring behavior, matched via each test's module →
    affected-KPI mapping.
  - **Trust Center** (`ExecutiveTrustCenter`): a `TRUST_COMPONENT_KPI_IDS`
    map ties each of the 10 trust components (data completeness, ghost
    riders, coverage, …) to the KPIs its score actually backs; the matching
    component(s) get a ring, the detail panel auto-expands, and a banner
    states which component is the evidence for that KPI.
  - **KPI Explorer**: each validation-suite row is resolved to a canonical
    KPI id via `resolveKpiFromText()` on its title; matching rows float to
    the top with a 🔗 marker, plus a "عرض هذا المؤشر فقط" filter checkbox.
  - **Enterprise Certification**: `kpiCertificationImpact(kpiId, report)`
    (`lib/strategicOps/enterpriseCert/progress.ts`) answers **"does this KPI
    block certification?"** directly — by resolving the KPI's
    `certificationLevelHint` (e.g. "L2 — Mathematical") to the actual level
    result and checking pass/fail, plus scanning `openIssues` for text
    matches. The matching level row and open issues are highlighted with 🔗.

## 2. Today's Executive Brief (Part 1)
- `lib/strategicOps/executiveBrief/engine.ts` — `buildExecutiveBrief()`.
  Generates the "Situation → because → because → impact → if nothing
  changes → priority → confidence" narrative purely from live report data
  (`executiveHealth`, `periodComparisons`, `rootCauseExplanations`,
  `decisionConfidenceActions`). No hardcoded business sentences — only
  connector words.
- Financial estimate reuses the existing, already-configured unit
  economics (`digitalTwin/config/unitEconomics.ts`, default 18 EGP/order,
  overridable via `DT_REVENUE_PER_ORDER`) and the existing SRS-006 Root
  Cause Explainability engine — not a new invented number.
- The "if nothing changes" projection is an explicitly-disclosed simple
  linear extrapolation of the last-7-day trend, not a full forecast model.
- Rendered at the very top of `/admin/strategic-ops`.

## 3. Root Cause Tree (Part 2)
- `components/strategicOps/RootCauseTree.tsx` renders the causal chain
  (`KPI ↓ because X ↓ because Y`) using the existing SRS-006 Root Cause
  Explainability output (`report.srs006.rootCauseExplanations`) — the same
  data source already validated and shown in the "Root Cause
  Explainability" panel. Each node links into the KPI Intelligence Panel.

## 4. Action Engine full metadata (Part 3)
- `lib/strategicOps/controlTower/managementActions.ts` — every
  `ManagementAction` (supervisor no-show, hours-lost, inactive riders,
  recruit, resignations, rider-impact, fleet-level) is now enriched via
  `enrichAction()` with:
  - **Owner** (`ownerAr`) — the supervisor/entity name, or "Ops Manager"
    for fleet-wide actions.
  - **Deadline** (`deadlineAr`) — derived from the action's own `urgency`
    (immediate → today 4 PM, this_week → within 3 days, this_month →
    within 2 weeks).
  - **Difficulty** (`difficultyAr`) — a fixed operational profile per
    action *kind* (a phone call is always "easy", recruiting is always
    "hard", regardless of which supervisor).
  - **Cost** (`costEstimateEGP`) — 0 for coaching/calls; real hiring
    investment (`totalHireInvestment()` from the shared unit-economics
    config) for recruit actions.
  - **Risk if ignored** (`riskIfIgnoredAr`) — what compounds if this is
    skipped today.
  - **Affected KPIs** (`affectedKpiIds`) — clickable chips that open the
    KPI Intelligence Panel directly from the action card.
  - **Estimated ROI** (`estimatedRoiAr`) — daily value = recovered orders
    × revenue/order (same unit-economics config used across Digital Twin);
    for paid actions this is expressed as a payback-days estimate.
- Rendered in `ActionCard` on the main dashboard (both the primary
  "مركز الإجراءات الإدارية" list and the technical action list).

## 5. KPI Intelligence Panel (Part 4)
- `components/strategicOps/KPIIntelligencePanel.tsx`. Static content
  (definition, business meaning, formula, calc steps, data sources,
  business rules, dependencies/affected KPIs, owner, decision examples,
  known limitations, certification level) comes from the registry; live
  values (current value, trend, confidence, last recalculation) are
  injected by the caller from the already-fetched report — never invented.

## 6. Executive Integrity Center (Part 5)
- `lib/strategicOps/systemHealth/executiveExplain.ts` translates every
  FAIL/WARN `AuditResult` from the Live Operations Audit into: Problem /
  Business impact / Why it happened / How to fix / Estimated time /
  Severity / Responsible module — using a fix-knowledge base keyed off the
  audit's own formula/note text (ghost riders, baseline coverage, no-show,
  active riders, achievement, forecast, control-tower availability).
- `components/strategicOps/ExecutiveIntegrityCenter.tsx` renders this as
  business cards with a "🛠 Fix Guide" toggle (concrete steps) and a link
  to the raw technical Lineage view. The old technical
  Formula/Expected/Calculated table is still available behind a
  "عرض التفاصيل الفنية" toggle — not deleted, just no longer the default view.

## 7. Trust Center narrative (Part 6)
- `lib/strategicOps/trust/types.ts` + `trustScoreEngine.ts` — every
  `TrustComponentDetail` now carries `evidenceAr` (the concrete numbers the
  score was computed from), `crossChecksAr` (what was validated against
  what), `missingValidationsAr` (what's blocking 100%), and
  `improvementPathAr` (e.g. "83% → 96%").
- `ExecutiveTrustCenter.tsx` renders all of this in the expanded view, plus
  the `?kpi=` highlighting described in section 1.

## 8. Ops Validation Center narrative (Part 7)
- `lib/strategicOps/opsValidation/executiveExplain.ts` — every
  fail/error `ValidationTestResult` → Scenario / Expected Result / Actual
  Result / Affected KPIs / Business impact / Suggested fix / Code location
  / Estimated effort, derived from the test's own module (kpi_engine,
  filters, ai, forecast, security, export, attribution, lost_hours,
  data_integrity, performance, business_logic).
- `components/strategicOps/ExecutiveValidationCenter.tsx` renders these as
  business cards; the full 217+ case technical certificate is still
  available behind a "عرض الشهادة الفنية الكاملة" toggle.

## 9. Certification Progress framing (Part 8)
- `lib/strategicOps/enterpriseCert/progress.ts` —
  `buildCertificationProgress(report)` converts the raw PASS/FAIL
  10-level certificate into: overall `progressPercent`, a human
  `statusAr` ("متبقٍ مستوى واحد فقط: …"), `remainingAr` (each unpassed
  level with its actual score vs. required score), and `requiredActions`
  (Run Live Validation → Validation Center, Verify N KPIs → KPI Explorer,
  Compare last 90 days, Run Enterprise Audit → refetch, Generate final
  certificate → the HTML/PDF endpoint, once `productionReady` is true).
- Rendered as the hero section of `/admin/strategic-ops/enterprise-
  certification`; the raw 10-level PASS/FAIL table, gate grid, and build
  metadata are still available behind a "عرض التفاصيل الفنية" toggle.

## 10. COO Mode (Part 9)
- `lib/strategicOps/cooMode/engine.ts` + `/api/strategic-ops/coo-mode`.
  Auto-answers the fixed executive question set by **narrating outputs of
  existing, already-certified engines** — it does not add new prediction
  math:
  - Biggest problem / what to do today / one-hour priority → Executive Brief.
  - Which supervisor needs intervention → `supervisorIntelligence[0]`.
  - Which riders to contact → `dailyContactList`.
  - Money lost today / hours recoverable today → Root Cause Explainability
    + `executiveFocus` totals.
  - "What if I hire 20 / activate 30 / change target ±10%" → SRS-007
    Digital Twin `runSimulation()` — the same what-if engine used in the
    Digital Twin / Scenario Simulator.
  - Biggest operational risk → highest-priority critical action, or fleet
    risk level.
- This runs Digital Twin simulations, so it is **fetched lazily** (button
  "توليد إجابات COO Mode الآن") and cached 5 minutes — it does not slow
  down the main dashboard load.

## Known, explicitly disclosed limitations (not hidden as "done")
- The "if nothing changes" projection in the Executive Brief is a linear
  7-day trend extrapolation, not a full statistical forecast.
- KPI Explorer's canonical-KPI resolution (`resolveKpiFromText`) is
  best-effort text matching against each test's title — a handful of
  narrowly-scoped validation tests may not resolve to a registry KPI and
  simply won't highlight (they still render normally, just unmarked).
- Cost/ROI numbers use the shared Digital Twin unit-economics defaults
  (`DT_REVENUE_PER_ORDER=18`, `DT_HIRING_COST_PER_RIDER=1500`, etc.) unless
  overridden via env — these are configurable assumptions, not measured
  finance-system numbers.

## Files added/changed for SRS-010
- `lib/strategicOps/kpiIntelligence/{types,registry,index}.ts`
- `lib/strategicOps/executiveBrief/{types,engine,index}.ts`
- `lib/strategicOps/cooMode/{types,engine,index}.ts`
- `lib/strategicOps/systemHealth/executiveExplain.ts`
- `lib/strategicOps/opsValidation/executiveExplain.ts`
- `lib/strategicOps/enterpriseCert/progress.ts`
- `lib/strategicOps/controlTower/managementActions.ts` (Part 3 enrichment)
- `lib/strategicOps/trust/{types,trustScoreEngine}.ts` (Part 6 fields)
- `app/api/strategic-ops/coo-mode/route.ts`
- `components/strategicOps/{ExecutiveBriefPanel,RootCauseTree,KPIIntelligencePanel,CooModePanel,KpiCrossLinkBanner,ExecutiveIntegrityCenter,ExecutiveValidationCenter,ExecutiveTrustCenter}.tsx`
- `app/admin/strategic-ops/{page,integrity/page,validation-center/page,trust-center/page,kpi-explorer/page,enterprise-certification/page}.tsx`
