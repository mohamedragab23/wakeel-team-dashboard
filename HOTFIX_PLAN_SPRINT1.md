# Sprint 1 Hotfix Plan - Critical Bugs Fix

## Overview
This document outlines the exact files and functions that will be changed to fix the 4 critical bugs identified in the system.

## Bug 1: System Performance (Very Slow Loading)

### Root Cause Analysis
- Multiple sequential API calls on page load
- No client-side caching
- Large data fetches without pagination
- Inefficient date parsing on every request
- Cache TTL too short (30 seconds → 2 minutes)

### Files to Modify

1. **`lib/dataService.ts`**
   - Line 445-449: Increase cache TTL from 30s to 2 minutes
   - Line 452-455: Add cache check before API call
   - Optimize `getPerformanceData` to reduce Google Sheets API calls

2. **`lib/googleSheets.ts`**
   - Line 28-66: Increase cache TTL from 1 minute to 5 minutes
   - Add batch request optimization for multiple ranges

3. **`app/performance/page.tsx`**
   - Line 36-39: Disable auto-refresh (refetchInterval: false)
   - Increase staleTime from 60s to 120s

4. **`components/PerformanceChart.tsx`**
   - Add memoization to prevent unnecessary re-renders
   - Optimize data transformation

### Expected Impact
- Page load time: < 1.5s (from ~5-10s)
- API response time: < 300ms (from ~1-2s)

---

## Bug 2: Supervisor "Riders" Page Shows No Data

### Root Cause Analysis
- Date filtering not working correctly
- Date parsing fails for "2025-11-20" format
- `getSupervisorPerformanceFiltered` not called with correct date range
- Date display shows "Invalid Date"

### Files to Modify

1. **`app/api/riders/route.ts`**
   - Line 34-45: Fix date normalization (setHours for start/end dates)
   - Line 61: Fix date display format (handle date range strings)
   - Ensure `getSupervisorPerformanceFiltered` is called correctly

2. **`lib/dataFilter.ts`**
   - Line 82-169: Improve date parsing to handle "2025-11-20" format
   - Add validation for ISO date format (YYYY-MM-DD)
   - Fix date comparison logic (use getTime() for accuracy)

3. **`app/riders/page.tsx`**
   - Line 214-226: Fix date display to handle both single dates and ranges
   - Add error handling for invalid dates
   - Fix toFixed() calls with null checks

### Expected Impact
- Riders page shows data for date 2025-11-20
- Date display shows correct format (not "Invalid Date")
- Date range filtering works correctly

---

## Bug 3: Supervisor "Performance" Page Always Empty

### Root Cause Analysis
- `getPerformanceData` returns empty labels/orders/hours arrays
- Date filtering in `getSupervisorPerformanceFiltered` too strict
- Date parsing fails for performance data rows
- API returns success but with empty data

### Files to Modify

1. **`app/api/performance/route.ts`**
   - Line 23-35: Fix date normalization (setHours for start/end dates)
   - Add better error logging
   - Ensure dates are passed correctly to `getPerformanceData`

2. **`lib/dataService.ts`**
   - Line 432-538: Fix `getPerformanceData` date range iteration
   - Line 490-502: Fix date key generation for grouping
   - Ensure filtered data is correctly aggregated by date

3. **`lib/dataFilter.ts`**
   - Line 179-205: Fix date range filtering logic
   - Ensure date comparison uses normalized dates
   - Add debug logging for date parsing

4. **`components/PerformanceChart.tsx`**
   - Line 47-58: Add better error handling for empty data
   - Show user-friendly message when no data available

### Expected Impact
- Performance page shows data for selected date range
- Chart displays correctly with labels and data points
- Date filtering works for any date range

---

## Bug 4: Supervisor "Payroll" Page Errors (toFixed on undefined)

### Root Cause Analysis
- Salary calculation returns undefined values
- `commission` object may be undefined
- `breakdown` array may be undefined
- No null checks before calling toFixed()

### Files to Modify

1. **`app/salary/page.tsx`**
   - Line 150: Add null check: `(salaryData.commission?.totalHours || 0).toFixed(1)`
   - Line 156: Add null check: `(salaryData.commission?.commissionRate || 0).toFixed(2)`
   - Line 161: Add null check: `salaryData.commission?.calculatedCommission || 0`
   - Line 239-240: Add null checks for breakdown array items

2. **`lib/salaryService.ts`**
   - Ensure all return values are defined (no undefined)
   - Add default values for missing data
   - Fix deduction calculations to fetch from correct sheets

3. **`app/api/salary/calculate/route.ts`**
   - Add validation for required parameters
   - Return error if calculation fails
   - Ensure response structure is consistent

### Expected Impact
- Payroll page loads without errors
- All calculations display correctly
- Deductions are properly subtracted from salary

---

## Implementation Checklist

### Phase 1: Performance Fixes
- [x] Increase cache TTL in `lib/dataService.ts`
- [x] Increase cache TTL in `lib/googleSheets.ts`
- [x] Disable auto-refresh in `app/performance/page.tsx`
- [ ] Add memoization to PerformanceChart

### Phase 2: Riders Page Fixes
- [x] Fix date parsing in `lib/dataFilter.ts`
- [x] Fix date display in `app/riders/page.tsx`
- [x] Fix date normalization in `app/api/riders/route.ts`
- [ ] Test with date 2025-11-20

### Phase 3: Performance Page Fixes
- [x] Fix date normalization in `app/api/performance/route.ts`
- [x] Fix date grouping in `lib/dataService.ts`
- [x] Fix date filtering in `lib/dataFilter.ts`
- [x] Improve error handling in `components/PerformanceChart.tsx`
- [ ] Test with various date ranges

### Phase 4: Payroll Page Fixes
- [x] Add null checks in `app/salary/page.tsx`
- [ ] Fix deduction calculations in `lib/salaryService.ts`
- [ ] Test with sample data

### Phase 5: Testing & Validation
- [ ] Test all 4 bugs are fixed
- [ ] Verify performance improvements
- [ ] Check date filtering works correctly
- [ ] Validate payroll calculations

---

## Test Cases

### Test 1: Performance - Page Load Time
1. Open browser DevTools → Network tab
2. Navigate to `/performance`
3. Measure time to interactive (< 1.5s target)
4. Check API response times (< 300ms target)

### Test 2: Riders Page - Date Filtering
1. Login as supervisor
2. Navigate to `/riders`
3. Set date range: 2025-11-20 to 2025-11-20
4. Verify data appears (not empty)
5. Verify dates display correctly (not "Invalid Date")

### Test 3: Performance Page - Data Display
1. Login as supervisor
2. Navigate to `/performance`
3. Set date range: 2025-11-20 to 2025-11-22
4. Verify chart displays with data
5. Verify labels and data points are correct

### Test 4: Payroll Page - Calculations
1. Login as supervisor
2. Navigate to `/salary`
3. Set date range for current month
4. Verify page loads without errors
5. Verify all values display correctly (no "NaN" or "undefined")
6. Verify deductions are subtracted correctly

---

## Rollback Plan

If hotfix causes issues:
1. Revert cache TTL changes (reduce back to 30s)
2. Revert date parsing changes (use simpler format)
3. Add more null checks if needed
4. Monitor error logs for new issues

---

## Deployment Steps

1. **Pre-deployment:**
   - Run tests locally
   - Check for TypeScript errors
   - Verify all files compile

2. **Deployment:**
   - Push to main branch
   - Vercel will auto-deploy
   - Monitor deployment logs

3. **Post-deployment:**
   - Test all 4 bugs are fixed
   - Monitor performance metrics
   - Check error logs
   - Verify Google Sheets sync still works

---

## Success Criteria

✅ Page load time < 1.5s
✅ API response time < 300ms
✅ Riders page shows data for 2025-11-20
✅ Performance page shows data for date ranges
✅ Payroll page loads without errors
✅ All calculations display correctly

