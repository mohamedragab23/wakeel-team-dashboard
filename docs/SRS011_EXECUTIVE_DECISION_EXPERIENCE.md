# SRS-011 — Executive Decision Experience (COO Decision System)

Goal (from the spec): turn Strategic Operations into an **Executive Command
Center** that answers one question only — *"لو أنا COO، ماذا يجب أن أفعل
الآن؟"* — with **riders and working hours as the primary operational
currency**, not financial loss. Financial impact becomes secondary context,
never the headline.

Status: **All 11 parts shipped and wired end-to-end.** `tsc --noEmit` and a
full `next build` both pass with 0 errors as of this revision. No feature
below is claimed done unless it renders from live report/API data in the
actual pages — this document calls out the handful of places where a
simplification was made deliberately, and why.

## 1. Executive Morning Brief (Part 1)
- `lib/strategicOps/executiveBrief/engine.ts` (`buildExecutiveBrief`) now
  leads with `greetingAr` ("صباح الخير …") and `priorityCount` ("اليوم يوجد N
  أولويات تشغيلية تحتاج تدخل") computed from `executiveFocus`, **before** any
  card or chart renders on `/admin/strategic-ops`.
- `ridersUnderFourHours` / `ridersUnderFourHoursAr` are pulled from
  `controlTower.fleetDistribution` (see Part 4) and shown as the *primary*
  stat in `ExecutiveBriefPanel`; `financialImpactAr` is now rendered smaller
  and second, per the explicit instruction that riders/hours outrank money.
- The root-cause chain (`causeChainAr`) explicitly walks "انخفاض ساعات
  العمل ↓ زيادة عدد الطيارين أقل من 4 ساعات" using real
  `rootCauseExplanations` + fleet-distribution counts — not hardcoded text.
- `FleetDistributionPanel` (compact mode) is embedded directly inside the
  Executive Brief, so the hour-bucket breakdown (`<2h`, `<4h`, `4–6h`, `6–8h`,
  `8–10h`, `+10h`) and the uplift sentence ("لو تم رفع جميع Riders أقل من 4
  ساعات إلى 6 ساعات، سيزداد متوسط الساعات اليومية بمقدار X ساعة") appear
  immediately under the brief, before the KPI grid.

## 2. Executive Decision Feed (Part 2)
- `lib/strategicOps/controlTower/decisionFeed.ts` (`buildDecisionOpportunities`)
  adds a third bucket — 🟢 **opportunities** — on top of the existing
  critical/medium management actions (e.g. "Zone East: يمكن رفع الساعات
  بسهولة").
- `components/strategicOps/ExecutiveDecisionFeed.tsx` renders all three as a
  single chronological/priority timeline (🔴 عاجل / 🟡 متوسط / 🟢 فرصة), each
  row clickable, each showing owner, reason, action, and
  `decisionConfidenceById` confidence percent per the SRS-006 confidence
  engine — not an invented number.
- Rendered on `/admin/strategic-ops` above the raw KPI grid, replacing the
  "dozens of cards" pattern with one scannable list.

## 3. Root Cause Navigation (Part 3)
- `RootCauseTree` now drills all the way down to Fleet Distribution: a node
  for "Riders أقل من 4 ساعات" links (`onOpenFleetBucket`) straight into the
  `under_4` bucket of `FleetDistributionPanel`, which itself lists rider
  name → supervisor → **last comment** (from `riderComments/service.ts`,
  merged in `buildReport.ts`) → **last active day** (`lastActiveDate`, i.e.
  last day with `hours > 0` in the daily sheet — see §Known simplifications).
- This gives the exact chain from the spec: `Target Achievement → Actual
  Hours → Riders < 4h → Supervisor → Rider → Last Comment → Last
  Active Day`, from one screen (no page navigation needed for the drill-down
  itself — only the final "open full KPI panel" hop uses `?kpi=`).
- **Known simplification — "Last Shift" / "Last Login":** the data model has
  no explicit shift-clock-in or auth-login table. We use "last day in the
  daily hours sheet with hours > 0" as the operational equivalent and label
  it as such in the UI (`آخر ظهور` / last-active-date), rather than
  fabricating a shift or login timestamp that doesn't exist in source data.

## 4. Fleet Distribution Intelligence (Part 4)
- `lib/strategicOps/controlTower/fleetDistribution.ts` (`buildFleetDistribution`)
  buckets every rider by **actual daily hours** into the 6 groups from the
  spec: `under_2`, `under_4`, `4_6`, `6_8`, `8_10`, `over_10`, each with:
  - rider list (name, supervisor, last comment, last active date),
  - a bucket-specific recommendation tag (`under_4` → "الأكثر خطورة", `4_6` →
    "قابلون للتحسين", `6_8` → "Stable", `8_10` → "High Performers", `over_10`
    → "Elite Riders"),
  - an uplift scenario: raising every `under_4` rider to 6h and recomputing
    the fleet-wide average daily hours delta.
- `FleetDistributionPanel` renders all 6 buckets (full mode on the main
  dashboard, compact mode inside the Executive Brief), each expandable to
  the full rider table. `focusBucketId` lets `RootCauseTree` and the brief's
  "riders under 4 hours" stat jump straight to the relevant bucket, expanded.
- This fully replaces the old pie-chart-only view; the pie/summary numbers
  are now a secondary confirmation, not the primary presentation.

## 5. Explain Every KPI (Part 5)
- `lib/strategicOps/kpiIntelligence/registry.ts` + `types.ts` extended every
  KPI entry with the full spec field list: `operationalObjectiveAr` (الهدف
  التشغيلي), `sheetUsedAr` / `columnsUsedAr` (مصدر البيانات، الأعمدة
  المستخدمة), `commonErrorsAr` (الأخطاء الشائعة), `declineReasonsAr` (أسباب
  انخفاض المؤشر), `improvementMethodsAr` (طرق تحسينه) — on top of the
  pre-existing formula, calculation steps, dependencies, affected KPIs,
  validation status, confidence, related decisions, and audit history from
  SRS-010.
- `KPIIntelligencePanel` renders every one of these as its own labelled
  block. **No KPI in the registry ships without these fields populated** —
  this was verified per-entry, not just at the type level.

## 6. Executive Integrity Center (Part 6)
- `lib/strategicOps/systemHealth/executiveExplain.ts` now also computes
  `currentMatchPercent` / `expectedResultPercent` (e.g. 82% → 96%) and
  `interventionType` (`technical` | `operational`) + its Arabic label per
  failed check, on top of the existing Problem/Impact/Why/Fix/Severity/Owner
  fields shipped in SRS-010.
- `ExecutiveIntegrityCenter` shows the full block per issue exactly as the
  spec's "Ghost Riders" example: status %, cause, affected KPIs (chips,
  cross-linked), fix steps, expected result %, and whether the fix needs
  technical or operational intervention.

## 7. Trust Center 2.0 (Part 7)
- `ExecutiveTrustCenter` renders each trust component's evidence,
  cross-checks, and missing validations as a ✅ / ⚠ checklist (matching the
  spec's "لماذا؟ لأن: ✅ … ⚠ …" format) instead of plain bullet text.
- Every component still ends with "للوصول إلى 100%" and its concrete action
  list, plus a note to re-run validation after completing the actions — this
  was already present from SRS-010 and is unchanged/confirmed still wired.

## 8. Validation Center 2.0 (Part 8)
- `lib/strategicOps/opsValidation/executiveExplain.ts` adds `succeeded` /
  `succeededLabelAr` (نجح؟ نعم/لا) and `ownerAr` (المسؤول) per test, on top
  of the SRS-010 fields (scenario, expected/actual result, affected KPIs,
  business impact, fix, code location, estimated effort).
- `ExecutiveValidationCenter` shows all of scenario name → expected → actual
  → pass/fail flag → affected KPIs → code files → fix → estimated time →
  owner, for every failed test, matching the spec exactly.

## 9. Certification Progress (Part 9)
- `lib/strategicOps/enterpriseCert/progress.ts` extends each
  `CertificationRequiredAction` with `ownerAr` (المسؤول) and
  `estimatedDurationAr` (المدة) alongside the existing level id, reason, and
  required-action text.
- `app/admin/strategic-ops/enterprise-certification/page.tsx` renders
  "المتبقي" as cards — each with level, reason, required action, owner,
  duration, and a direct **"Run Validation"** button (already wired to the
  live validation re-run trigger from SRS-008/010) instead of a raw
  PASS/FAIL badge.

## 10. COO Mode — AI Executive Assistant (Part 10)
- `lib/strategicOps/cooMode/engine.ts` was rewritten as a free-text
  question-matching engine (`matchTermsAr`/keyword-based, not an LLM call —
  every answer is deterministically derived from existing report data) that
  answers, among others: "لماذا لم نحقق الهدف اليوم؟", "من أول خمسة Riders
  يحتاجون تدخل؟", "أي Supervisor هو سبب انخفاض الساعات؟", "كم Rider أقل من 4
  ساعات؟ من هم؟", "ماذا أفعل أولاً؟", "أي Zone تحتاج Recruit؟". Each answer
  carries `confidence`, `sourceAr` (which engine/report section it came
  from), and `matchKeywords`.
- `components/strategicOps/CooModePanel.tsx` is a chat-style interface (free
  text input + suggestion chips + scrollable history), rendered on the main
  dashboard. Every answer bubble shows confidence % and data source, and can
  deep-link into the relevant KPI panel.
- **Known simplification:** "ماذا سيحدث لو فعّلت 20 Rider إضافيين؟" and
  similar free-form what-if phrasing route to the existing Digital Twin
  scenario simulator's fixed uplift scenarios (e.g. the fleet-distribution
  under-4→6h uplift) rather than a fully general natural-language
  simulator — the engine is keyword-matched, not generative, so only the
  question patterns actually wired in `engine.ts` are answered from live
  data; unmatched questions say so explicitly instead of guessing.

## 11. Decision Effectiveness & Learning (Part 11) — new since SRS-010
- `lib/strategicOps/decisionLearning/types.ts` — `DecisionLogEntry` (action
  id, entity, baseline metric value/date, executed?, executed-at, outcome
  metric value, delta, success verdict) and `RecommendationPerformance`
  (aggregate stats).
- `lib/strategicOps/decisionLearning/store.ts` — Google-Sheets-backed
  persistence (a dedicated `Decision_Log` tab, auto-created if missing):
  - `logNewDecisions` — called from `buildReport.ts` on every report build;
    inserts one row per new critical/high-priority action the engines
    produced (dedup'd by action id + entity, so re-running the report
    doesn't duplicate rows).
  - `markDecisionExecuted` — exposed via
    `POST /api/strategic-ops/decision-log`, lets a COO/supervisor confirm
    "نعم تم الاتصال بالمشرف" for a pending recommendation.
  - `evaluateDueDecisions` — also called from `buildReport.ts`; for any
    entry whose 2-day evaluation window (`evaluationDueAt`, set to
    `issuedAt + 2 days` when the recommendation was first logged — see
    "Known simplification" below) has passed and hasn't been evaluated yet,
    re-reads the *current* value of that entity's baseline metric (booking
    rate / achievement % / actual hours, depending on action kind — via
    `decisionLearning/adapters.ts`), computes the delta, and writes back
    `afterMetricValue`, `metricDeltaPct`, and `outcome`
    (`successful`/`failed`/`not_executed`) — this is the "بعد يومين: هل
    ارتفع Booking Rate؟ كم؟ هل نجح القرار؟" loop from the spec. A decision is
    `successful` when its metric moved ≥ +3%.
  - `buildRecommendationPerformance` aggregates the whole log into: total
    recommendations, executed, successful, failed, best/worst action types,
    best-responding supervisors, average time-to-execute, and overall
    system decision success rate.
- `GET /api/strategic-ops/decision-log` returns the raw log + the aggregated
  performance object.
- `components/strategicOps/AIRecommendationPerformancePanel.tsx` — the "AI
  Recommendation Performance" dashboard from the spec: stat tiles (total /
  executed / successful / failed / success rate / avg execution time), best
  & worst recommendation types, best-responding supervisors, and a filterable
  table of the underlying decisions with an inline "✔ تم التنفيذ" button for
  anything still pending.
- Surfaced at its own page, **`/admin/strategic-ops/decision-performance`**,
  linked from the main dashboard's action bar (📊 فعالية القرارات).
- **Known simplification (two, both deliberate):**
  1. The 2-day evaluation clock starts when the recommendation is **logged**
     (i.e. when it first appears as a critical/high action), not when a
     human confirms "✔ تم التنفيذ". The spec's flow implies "check after 2
     days *of execution*"; in practice most critical actions are expected
     to be acted on same-day, so "2 days after the system raised it" is used
     as the single, simple, always-ticking clock instead of a variable
     per-recommendation timer that only starts on manual confirmation
     (which would silently never fire for recommendations nobody ever marks
     executed). If `executed` is explicitly `false` by evaluation time, the
     entry is short-circuited to `not_executed` and skipped entirely
     instead of being scored — so a decision the COO says was *not* acted on
     never wrongly counts as failed by the AI.
  2. Evaluation itself runs opportunistically inside the normal 10-minute
     report-build cache cycle (fire-and-forget, wrapped in try/catch so a
     Sheets hiccup never breaks the dashboard), not on an exact cron — so an
     entry evaluates on the *first* report build that runs at or after its
     due timestamp, in practice within minutes of it.

## Interconnected screens (cross-cutting, carried over + extended from SRS-010)
The SRS-010 KPI-registry-based cross-linking backbone
(`kpiIntelligence/registry.ts`, `buildKpiDeepLinks`, `KpiCrossLinkBanner`,
per-surface `?kpi=` filtering in Integrity/Validation/Trust/Explorer/
Certification) is unchanged and still verified working. SRS-011 extends the
*same* backbone one level deeper on the main dashboard only: KPI → Root Cause
Tree → Fleet Distribution bucket → rider → last comment/last-active-date, all
without a page navigation, and still ending in the same `?kpi=` deep-link
pattern into the other 5 surfaces when the user wants the full KPI panel.

## Definition of Done — checked against the spec's own list
1. ✅ Dashboard opens with Executive Morning Brief, not KPI cards, first.
2. ✅ Executive Decision Feed shown, priority-ordered (critical → medium →
   opportunity).
3. ✅ Fleet-by-hours distribution shown with rider names + supervisors.
4. ✅ Any KPI traceable down to data source + calculation rules (KPI
   Intelligence Panel, Part 5).
5. ✅ Every quality/trust indicator explains its result + steps to 100%
   (Trust Center 2.0).
6. ✅ Validation Center shows full detail + fix method per test.
7. ✅ Certification Progress shown as % + required actions (not PASS/FAIL).
8. ✅ COO Mode answers executive natural-language questions.
9. ✅ System measures recommendation effectiveness and learns from execution
   outcomes (Part 11, new).
10. ✅ Screens are interconnected: KPI → cause → supervisor → rider →
    comment → action plan, without losing context (see previous section).
11. ✅ No percentage/KPI/Trust Score/Validation/Certification renders without
    an explanation and concrete path to 100% — verified per-component in
    Trust Center, per-test in Validation Center, per-level in Certification.

## Verification performed
- `npx tsc --noEmit` — 0 errors.
- `npm run build` (full Next.js production build) — exit code 0, all
  strategic-ops routes (including the new
  `/admin/strategic-ops/decision-performance`) compile and are statically
  generated.
- No automated test runner exists in this repo (`npx jest` fails — no
  Jest/Babel config, no test script in `package.json`); this was already
  true before SRS-010/011 and is out of scope for this spec. Build + type
  checks are the verification gate used throughout.

## Recommendation
Per the spec's own closing note: do **not** start SRS-012 immediately. Run
this system in production for 4–8 weeks, collect real daily-usage feedback
(which COO Mode questions actually get asked, which decision-feed entries
get acted on, what the Decision Effectiveness log actually shows about which
recommendation types work), and let that real usage — not a wishlist — drive
the next spec.
