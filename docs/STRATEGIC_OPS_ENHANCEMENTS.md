# Strategic Operations Center - New Features Documentation

## Overview
This document describes the new features added to the Strategic Operations Center (مركز العمليات الاستراتيجي) in the admin dashboard.

## New Features

### 1. Top Break Takers (أعلى 10 مناديب في الاستراحة)
Displays the top 10 riders who take the most break time, helping identify riders who may need intervention.

**Fields:**
- **Code (الكود)**: Rider code
- **Name (الاسم)**: Rider name
- **Supervisor (المشرف)**: Assigned supervisor
- **Region (المنطقة)**: Operating region
- **Total Break Minutes (إجمالي الاستراحة)**: Total break minutes in the selected period
- **Average Daily Break Minutes (متوسط يومي)**: Average break minutes per day
- **Total Hours (إجمالي الساعات)**: Total work hours in period
- **Work Days (أيام العمل)**: Number of days worked

**Data Source:** Google Sheet "البيانات اليومية" - Break column (استراحة/بريك)

**Use Case:** Identify riders who take excessive breaks and may need coaching or intervention.

---

### 2. Top Absent Riders (أعلى 10 مناديب في الغياب)
Shows the top 10 riders with the highest absence rate (days with no orders and no work hours).

**Fields:**
- **Code (الكود)**: Rider code
- **Name (الاسم)**: Rider name
- **Supervisor (المشرف)**: Assigned supervisor
- **Region (المنطقة)**: Operating region
- **Absent Days (أيام الغياب)**: Number of days absent in the selected period
- **Total Days (إجمالي الأيام)**: Total days in the selected period
- **Absence Percentage (نسبة الغياب %)**: Percentage of days absent

**Calculation:**
- A rider is considered "absent" on a given day if: `orders = 0 AND hours = 0`
- Absence % = (Absent Days / Total Days) × 100

**Data Source:** Google Sheet "البيانات اليومية" - Daily performance records

**Use Case:** Identify riders with chronic absenteeism who may need disciplinary action or termination.

---

### 3. Inactive 3+ Days (المناديب غير النشطين لـ 3 أيام فأكثر)
Lists all riders who have been inactive (no orders, no hours) for 3 or more consecutive days.

**Fields:**
- **Code (الكود)**: Rider code
- **Name (الاسم)**: Rider name
- **Supervisor (المشرف)**: Assigned supervisor
- **Region (المنطقة)**: Operating region
- **Inactive Days (أيام عدم النشاط)**: Number of consecutive inactive days
- **Last Activity Date (آخر نشاط)**: Date of last activity (if any)

**Alert:**
- ⚠ System shows a warning if any riders are found in this category
- ✓ Shows success message if all riders are active

**Data Source:** Google Sheet "البيانات اليومية" - Daily performance records

**Use Case:** Early warning system to identify riders at risk of dropping out before they become fully inactive.

---

### 4. Delta Calculation (التغير الصافي في عدد المناديب)
Calculates the net change in rider count over the selected period.

**Metrics:**
- **New Hires (تعيينات جديدة)**: Number of riders newly hired
- **Reactivations (إعادة تفعيل)**: Number of riders reactivated
- **Terminations (إقالات)**: Number of approved terminations/resignations
- **Delta (التغير الصافي)**: Net change = (New Hires + Reactivations) - Terminations

**Formula:**
```
Delta = New Hires + Reactivations - Terminations
```

**Data Sources:**
- `طلبات التعيين` (Assignment Requests Sheet) - for new hires
- `طلبات إعادة التفعيل` (Reactivation Requests Sheet) - for reactivations
- `طلبات_الإقالة` (Termination Requests Sheet) - for terminations

**Interpretation:**
- **Positive Delta (إيجابي)**: Fleet is growing ✓
- **Negative Delta (سلبي)**: Fleet is shrinking ⚠ — Need to increase hiring and reactivations
- **Zero Delta**: Fleet size is stable

**Use Case:** Monitor fleet growth/decline trends and adjust recruitment strategy accordingly.

---

## Data Accuracy & Requirements

### Active Rider Definition
A rider is considered **active** if and only if:
```
orders > 0 AND hours > 0
```

This definition applies across all new features and ensures consistency with the "البيانات اليومية" data source.

### Zone Filter
The zone filter uses the actual zones from the user's data:
- Ain shams
- Alexandria
- El rehab city
- Heliopolis
- Mansoura
- Nasr city
- Tagammaa golden square

### Date Range
All features respect the selected date range filter in the Strategic Operations Center page.

---

## UI Location
All new features are displayed in the `/admin/strategic-ops` page, under the main dashboard, appearing after the "Activity Distribution" section and before the "Hours Analysis" section.

---

## Backend Implementation

### File Modified
- `lib/strategicOps/buildReport.ts`: Added calculation logic for all 4 new features
- `app/admin/strategic-ops/page.tsx`: Added UI sections for displaying the new data

### Type Definitions
All new sections are properly typed in the `StrategicOpsReport` interface:
```typescript
export type StrategicOpsReport = {
  // ... existing fields
  topBreakTakers: { riders: Array<{ ... }> };
  topAbsentRiders: { riders: Array<{ ... }> };
  inactive3DaysPlus: { riders: Array<{ ... }> };
  delta: { newHires, reactivations, terminations, netChange };
  // ... more fields
};
```

---

## Performance Considerations
- **Top Break Takers**: O(n log n) sorting on rider list
- **Top Absent Riders**: O(n × m) where n = riders, m = days in period
- **Inactive 3+ Days**: O(n × m) filtering
- **Delta Calculation**: O(k) where k = rows in assignment/reactivation/termination sheets

All operations are reasonably efficient for typical fleet sizes (100-500 riders) and period lengths (7-30 days).

---

## Future Enhancements
1. Export new sections to Excel/PDF reports
2. Add trend charts for absence and break patterns over time
3. Add email/Telegram alerts when inactive riders threshold is exceeded
4. Add supervisor-level drill-down for each metric
5. Add historical comparison (current period vs previous period)

---

## Version
- **Added**: 2026-07-15
- **Author**: Cursor Agent (Assistant)
- **Status**: Production-Ready
