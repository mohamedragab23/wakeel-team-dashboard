# Acceptance Test Plan

## Overview
This document outlines the acceptance tests for verifying that all 4 critical bugs are fixed and the system meets performance targets.

## Test Environment

- **Browser:** Chrome/Firefox (latest)
- **Network:** Standard broadband connection
- **Test Data:** Performance file with date 2025-11-20
- **Test Accounts:** Admin and Supervisor accounts (see TEST_ACCOUNTS.md)

---

## Bug 1: System Performance (Very Slow Loading)

### Test Case 1.1: Page Load Time
**Objective:** Verify page load time is < 1.5s

**Steps:**
1. Open browser DevTools → Network tab
2. Clear browser cache
3. Navigate to `http://localhost:3000/performance`
4. Measure time to interactive (TTI)
5. Check API response times

**Expected Results:**
- ✅ Page load time (TTI) < 1.5 seconds
- ✅ API response time < 300ms
- ✅ No console errors

**Actual Results:**
- TTI: _____ seconds
- API Response: _____ ms
- Status: [ ] Pass [ ] Fail

---

### Test Case 1.2: Navigation Speed
**Objective:** Verify navigation between pages is fast

**Steps:**
1. Login as supervisor
2. Navigate between pages: Dashboard → Riders → Performance → Salary
3. Measure time for each navigation
4. Check for loading spinners (should be minimal)

**Expected Results:**
- ✅ Navigation time < 500ms per page
- ✅ Smooth transitions
- ✅ No long loading spinners

**Actual Results:**
- Navigation time: _____ ms
- Status: [ ] Pass [ ] Fail

---

## Bug 2: Supervisor "Riders" Page Shows No Data

### Test Case 2.1: Data Display for Date 2025-11-20
**Objective:** Verify riders data appears for date 2025-11-20

**Prerequisites:**
- Admin has uploaded performance.xlsx with date 2025-11-20
- Supervisor has assigned riders

**Steps:**
1. Login as supervisor
2. Navigate to `/riders`
3. Set "From Date" to `2025-11-20`
4. Set "To Date" to `2025-11-20`
5. Click "تحديث" (Update) button
6. Verify data appears in table

**Expected Results:**
- ✅ Riders table shows data (not empty)
- ✅ Date column shows correct date (not "Invalid Date")
- ✅ All performance metrics display correctly (hours, orders, etc.)

**Actual Results:**
- Data displayed: [ ] Yes [ ] No
- Date format: _____
- Status: [ ] Pass [ ] Fail

---

### Test Case 2.2: Date Range Filtering
**Objective:** Verify date range filtering works correctly

**Steps:**
1. Login as supervisor
2. Navigate to `/riders`
3. Set "From Date" to `2025-11-20`
4. Set "To Date" to `2025-11-22`
5. Click "تحديث" (Update) button
6. Verify aggregated data appears

**Expected Results:**
- ✅ Data aggregated correctly for date range
- ✅ Date column shows range (e.g., "2025-11-20 - 2025-11-22")
- ✅ Totals are correct (sum of all days in range)

**Actual Results:**
- Data aggregated: [ ] Yes [ ] No
- Date range displayed: _____
- Status: [ ] Pass [ ] Fail

---

## Bug 3: Supervisor "Performance" Page Always Empty

### Test Case 3.1: Performance Data Display
**Objective:** Verify performance page shows data for date range

**Prerequisites:**
- Admin has uploaded performance.xlsx with dates 2025-11-20, 2025-11-21, 2025-11-22
- Supervisor has assigned riders with performance data

**Steps:**
1. Login as supervisor
2. Navigate to `/performance`
3. Set "From Date" to `2025-11-20`
4. Set "To Date" to `2025-11-22`
5. Click "تحديث البيانات" (Update Data) button
6. Verify chart displays with data

**Expected Results:**
- ✅ Chart displays with data points
- ✅ Labels show dates correctly
- ✅ Orders and Hours data visible
- ✅ No "لا توجد بيانات متاحة" message

**Actual Results:**
- Chart displayed: [ ] Yes [ ] No
- Data points: _____
- Status: [ ] Pass [ ] Fail

---

### Test Case 3.2: Performance Data Filtering
**Objective:** Verify performance data is filtered by supervisor's riders only

**Steps:**
1. Login as supervisor (SUP001)
2. Navigate to `/performance`
3. Set date range: 2025-11-20 to 2025-11-22
4. Verify only data for SUP001's riders appears
5. Login as different supervisor (SUP002)
6. Verify different data appears (data isolation)

**Expected Results:**
- ✅ Only supervisor's riders' data appears
- ✅ Data isolation works correctly
- ✅ No data leakage between supervisors

**Actual Results:**
- Data isolation: [ ] Yes [ ] No
- Status: [ ] Pass [ ] Fail

---

## Bug 4: Supervisor "Payroll" Page Errors (toFixed on undefined)

### Test Case 4.1: Payroll Page Loads Without Errors
**Objective:** Verify payroll page loads without JavaScript errors

**Steps:**
1. Login as supervisor
2. Navigate to `/salary`
3. Set date range for current month
4. Open browser console
5. Check for errors

**Expected Results:**
- ✅ Page loads without errors
- ✅ No "Cannot read property 'toFixed' of undefined" errors
- ✅ All values display correctly (no "NaN" or "undefined")

**Actual Results:**
- Errors in console: [ ] Yes [ ] No
- Values displayed: [ ] Correct [ ] Incorrect
- Status: [ ] Pass [ ] Fail

---

### Test Case 4.2: Payroll Calculations
**Objective:** Verify payroll calculations are correct

**Prerequisites:**
- Supervisor has performance data for the month
- Deductions exist in Google Sheets (الخصومات, السلف, etc.)

**Steps:**
1. Login as supervisor
2. Navigate to `/salary`
3. Set date range: 2025-11-01 to 2025-11-30
4. Verify calculations:
   - Base salary/commission displayed
   - Deductions displayed (advances, equipment, security, performance)
   - Net salary = Base - Deductions

**Expected Results:**
- ✅ Base salary/commission calculated correctly
- ✅ All deductions displayed and subtracted
- ✅ Net salary calculation is correct
- ✅ Breakdown table shows daily data (if commission-based)

**Actual Results:**
- Base salary: _____
- Deductions: _____
- Net salary: _____
- Status: [ ] Pass [ ] Fail

---

### Test Case 4.3: Payroll with Different Salary Methods
**Objective:** Verify all 3 salary methods work correctly

**Steps:**
1. As admin, configure supervisor salary method:
   - Test 1: Fixed salary
   - Test 2: Commission Type 1 (hours-based)
   - Test 3: Commission Type 2 (percentage-based)
2. As supervisor, view salary page
3. Verify correct calculation method is used

**Expected Results:**
- ✅ Fixed salary: Shows fixed amount
- ✅ Commission Type 1: Calculates based on hours tiers
- ✅ Commission Type 2: Calculates based on receipts percentage
- ✅ All methods subtract deductions correctly

**Actual Results:**
- Fixed salary: [ ] Pass [ ] Fail
- Commission Type 1: [ ] Pass [ ] Fail
- Commission Type 2: [ ] Pass [ ] Fail

---

## Performance Benchmarks

### Target Metrics
- Page load time: < 1.5s
- API response time: < 300ms
- Cache hit rate: > 80%
- Error rate: < 1%

### Measurement Tools
- Browser DevTools (Network tab, Performance tab)
- Vercel Analytics (if enabled)
- Google Sheets API quota monitoring

---

## Regression Tests

### Test Case R.1: Data Upload
**Steps:**
1. As admin, upload assignment.xlsx
2. As admin, upload performance.xlsx with date 2025-11-20
3. Verify data appears in Google Sheets
4. Verify data appears in supervisor views

**Expected Results:**
- ✅ Upload succeeds
- ✅ Data written to Google Sheets
- ✅ Data appears in supervisor views immediately (after cache refresh)

---

### Test Case R.2: Dismissal Request Flow
**Steps:**
1. As supervisor, submit dismissal request
2. As admin, view request
3. As admin, approve request
4. Verify rider is removed from supervisor's list

**Expected Results:**
- ✅ Request created successfully
- ✅ Admin can view request
- ✅ Approval removes rider assignment
- ✅ Change reflected in Google Sheets

---

## Test Data Requirements

### Performance File (performance.xlsx)
Required columns:
- Date (Column A): 2025-11-20
- Rider Code (Column B): R001, R002, etc.
- Hours (Column C): 8.5, 7.5, etc.
- Break (Column D): 1, 1, etc.
- Delay (Column E): 0, 15, etc.
- Absence (Column F): 0 (present) or 1 (absent)
- Orders (Column G): 25, 20, etc.
- Acceptance Rate (Column H): 95%, 90%, etc.
- Debt (Column I): 0, 0, etc.

### Assignment File (assignment.xlsx)
Required columns:
- Rider Code (Column A): R001, R002, etc.
- Rider Name (Column B): مندوب 1, مندوب 2, etc.
- Region (Column C): القاهرة, etc.
- Supervisor Code (Column D): SUP001, etc.
- Supervisor Name (Column E): أحمد محمد, etc.

---

## Sign-Off

### Test Execution
- **Date:** _____
- **Tester:** _____
- **Environment:** [ ] Local [ ] Staging [ ] Production

### Results Summary
- Bug 1 (Performance): [ ] Pass [ ] Fail
- Bug 2 (Riders Page): [ ] Pass [ ] Fail
- Bug 3 (Performance Page): [ ] Pass [ ] Fail
- Bug 4 (Payroll Page): [ ] Pass [ ] Fail

### Overall Status
- [ ] All tests passed - Ready for production
- [ ] Some tests failed - Needs fixes
- [ ] Blocking issues found - Cannot proceed

### Notes
_____
_____
_____

### Signatures
- **Developer:** _____ Date: _____
- **QA Tester:** _____ Date: _____
- **Product Owner:** _____ Date: _____

