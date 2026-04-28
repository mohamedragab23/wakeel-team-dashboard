# Apps Script → Next.js Architecture Mapping Document

## Overview
This document maps every Google Apps Script function to its equivalent Next.js API route or scheduled job, and every sheet column to database/field mapping.

## Sheet Structure Mapping

### Google Sheets → Next.js Data Model

| Sheet Name (Arabic) | Sheet Name (English) | Purpose | Columns Mapping |
|---------------------|---------------------|---------|----------------|
| المشرفين | Supervisors | Supervisor accounts | A: Code, B: Name, C: Region, D: Email, E: Password |
| المناديب | Riders | Rider assignments | A: Rider Code, B: Name, C: Region, D: Supervisor Code, E: Supervisor Name, F: Phone, G: Join Date, H: Status |
| البيانات اليومية | Daily Performance | Daily performance metrics | A: Date, B: Rider Code, C: Hours, D: Break, E: Delay, F: Absence, G: Orders, H: Acceptance Rate, I: Debt |
| الخصومات | Deductions | Performance deductions | A: Supervisor Code, B: Month, C: Reason, D: Amount |
| السلف | Advances | Salary advances | A: Supervisor Code, B: Month, C: Amount |
| استعلام أمني | Security Inquiries | Security check costs | A: Date, B: Rider Name, C: Rider Code, D: Inquiry Type, E: Result, F: Supervisor Code |
| المعدات | Equipment | Equipment costs | A: Supervisor Code, B: Month, C: Item Name, D: Quantity, E: Unit Price, F: Reason, G: Total Cost |
| الأهداف | Targets | Performance targets | A: Supervisor Code, B: Month, C: Target, D: Achievement, E: Bonus |
| طلبات_الإقالة | Dismissal Requests | Termination requests | A: Request ID, B: Supervisor Code, C: Rider Code, D: Reason, E: Status, F: Request Date, G: Approval Date |
| إعدادات_الرواتب | Salary Settings | Salary configuration | A: Supervisor Code, B: Method, C: Fixed Salary, D: Type1 Ranges, E: Type2 Base %, F: Type2 Supervisor % |

## Apps Script Functions → Next.js API Routes

### Authentication & Authorization

| Apps Script Function | Next.js Route | Method | Description |
|---------------------|---------------|--------|-------------|
| `authenticateUser(code, password)` | `/api/auth/login` | POST | Supervisor authentication |
| `authenticateAdmin(code, password)` | `/api/auth/login` | POST | Admin authentication (same endpoint, different role) |

**Implementation Notes:**
- Uses JWT tokens with role-based access control
- Passwords stored in Google Sheets (should be hashed in production)
- Token stored in localStorage on client, verified via middleware

### Data Retrieval Functions

| Apps Script Function | Next.js Route | Method | Description |
|---------------------|---------------|--------|-------------|
| `getSupervisorRiders(supervisorCode)` | `/api/riders` | GET | Get riders assigned to supervisor |
| `getLatestRiderData(riderCode)` | `/api/riders?riderCode={code}` | GET | Get latest performance data for a rider |
| `getDashboardData(supervisorCode)` | `/api/dashboard` | GET | Get dashboard statistics |
| `getRidersData(supervisorCode)` | `/api/riders` | GET | Get all riders with latest data |
| `getPerformanceData(supervisorCode, startDate, endDate)` | `/api/performance?startDate={date}&endDate={date}` | GET | Get performance data for date range |
| `getPeriodData(supervisorCode, startDate, endDate)` | `/api/performance?startDate={date}&endDate={date}` | GET | Get period summary (same as above) |
| `getDailyData(supervisorCode, date)` | `/api/performance?date={date}` | GET | Get single day performance |
| `getAllSupervisors()` | `/api/admin/supervisors` | GET | Get all supervisors (admin only) |
| `getAllRiders()` | `/api/admin/riders` | GET | Get all riders (admin only) |

**Implementation Notes:**
- All routes use Google Sheets as data source via `lib/googleSheets.ts`
- Server-side caching (5 minutes) for performance
- Supervisor filtering enforced via middleware

### Payroll & Salary Functions

| Apps Script Function | Next.js Route | Method | Description |
|---------------------|---------------|--------|-------------|
| `calculateSupervisorSalary(supervisorCode, month, year)` | `/api/salary/calculate?startDate={date}&endDate={date}` | GET | Calculate supervisor salary |
| `getRiderMonthlyData(riderCode, month, year)` | Internal (used by salary calculation) | - | Get monthly aggregated data |
| `getSupervisorDeductions(supervisorCode, month, year)` | Internal (used by salary calculation) | - | Get deductions from الخصومات sheet |
| `getSupervisorAdvances(supervisorCode, month, year)` | Internal (used by salary calculation) | - | Get advances from السلف sheet |
| `getSecurityInquiriesCost(supervisorCode, month, year)` | Internal (used by salary calculation) | - | Get security costs from استعلام أمني sheet |
| `getEquipmentCost(supervisorCode, month, year)` | Internal (used by salary calculation) | - | Get equipment costs from المعدات sheet |
| `getBonus(supervisorCode, month, year)` | Internal (used by salary calculation) | - | Get bonus from الأهداف sheet |

**Implementation Notes:**
- Salary calculation moved to `lib/salaryService.ts`
- Supports 3 methods: Fixed, Commission Type 1 (hours-based), Commission Type 2 (percentage)
- Deductions fetched from multiple sheets and aggregated
- Date range-based instead of month/year (more flexible)

### Admin Functions

| Apps Script Function | Next.js Route | Method | Description |
|---------------------|---------------|--------|-------------|
| `generateMonthlyReport(supervisorCode, month, year)` | `/api/admin/performance/stats?supervisorCode={code}&startDate={date}&endDate={date}` | GET | Generate monthly report |
| `generateComprehensiveReport(startDate, endDate)` | `/api/admin/performance/stats?startDate={date}&endDate={date}` | GET | Generate comprehensive report |
| `addDailyData(riderData)` | `/api/admin/upload?type=performance` | POST | Upload performance data (Excel) |
| `archiveMonthlyData(month, year)` | Not implemented (future feature) | - | Archive monthly data |

**Implementation Notes:**
- File uploads handled via `/api/admin/upload` with Excel parsing
- Supports both assignment.xlsx and performance.xlsx
- Data written to Google Sheets first (write-first architecture)

### Dismissal/Termination Functions

| Apps Script Function | Next.js Route | Method | Description |
|---------------------|---------------|--------|-------------|
| N/A (new feature) | `/api/termination-requests` | GET | Get termination requests |
| N/A (new feature) | `/api/termination-requests` | POST | Create termination request |
| N/A (new feature) | `/api/termination-requests` | PUT | Approve/reject request |

**Implementation Notes:**
- New feature not in original Apps Script
- Stored in `طلبات_الإقالة` sheet
- Auto-removes rider assignment on approval

### Utility Functions

| Apps Script Function | Next.js Route | Method | Description |
|---------------------|---------------|--------|-------------|
| `getSheetData(sheetName)` | Internal (`lib/googleSheets.ts`) | - | Get sheet data with caching |
| `findDataInSheet(sheetName, searchColumn, searchValue, dateColumn, month, year)` | Internal (`lib/dataFilter.ts`) | - | Search data in sheet |
| `checkAllSheets()` | `/api/admin/debug?action=sheets` | GET | Check sheet existence |
| `createMissingSheets()` | Not implemented (manual) | - | Create missing sheets |

## Scheduled Jobs / Triggers

| Apps Script Trigger | Next.js Equivalent | Description |
|---------------------|-------------------|-------------|
| Time-based triggers (if any) | Vercel Cron Jobs (future) | Scheduled tasks |
| Web App URL endpoints | Next.js API Routes | HTTP endpoints |

## Assumptions & Ambiguous Cases

### Assumption 1: Date Format Handling
- **Assumption:** Dates in Google Sheets can be in multiple formats (ISO, M/D/YYYY, D/M/YYYY, Excel serial)
- **Implementation:** Robust date parsing in `lib/dataFilter.ts` with fallback logic
- **Default:** Prefer ISO format (YYYY-MM-DD) for storage, flexible parsing for display

### Assumption 2: Performance Data Aggregation
- **Assumption:** When filtering by date range, aggregate all records within range
- **Implementation:** Sum hours, orders, debt; average acceptance rate
- **Default:** Show aggregated totals for the period

### Assumption 3: Salary Calculation Period
- **Assumption:** Salary can be calculated for any date range, not just monthly
- **Implementation:** Changed from month/year to startDate/endDate for flexibility
- **Default:** If no dates provided, use current month

### Assumption 4: Dismissal Request Workflow
- **Assumption:** Supervisor submits request → Admin reviews → Auto-removal on approval
- **Implementation:** New workflow with audit logging
- **Default:** Request status: pending → approved/rejected

### Assumption 5: Commission Type 1 Tiers
- **Assumption:** Tiers are configurable per supervisor
- **Implementation:** Stored in `إعدادات_الرواتب` sheet with JSON ranges
- **Default:** Standard tiers (0-100: 1.0, 101-200: 1.2, etc.)

### Assumption 6: Data Isolation
- **Assumption:** Supervisors can only see their assigned riders
- **Implementation:** Enforced at API level via `getSupervisorRiders()` filtering
- **Default:** Return empty array if no riders assigned

## Migration Notes

1. **Authentication:** Moved from Apps Script Web App to JWT-based auth
2. **Data Storage:** Google Sheets remains primary source (no DB migration needed)
3. **Caching:** Added server-side caching to improve performance
4. **File Uploads:** Excel files processed server-side, written to Sheets
5. **Date Handling:** Improved date parsing to handle multiple formats
6. **Payroll:** Enhanced to support 3 calculation methods with configurable parameters

## API Endpoint Summary

### Supervisor Endpoints
- `GET /api/dashboard` - Dashboard stats
- `GET /api/riders?startDate={date}&endDate={date}` - Riders with performance
- `GET /api/performance?startDate={date}&endDate={date}` - Performance chart data
- `GET /api/salary/calculate?startDate={date}&endDate={date}` - Salary calculation
- `POST /api/termination-requests` - Submit dismissal request

### Admin Endpoints
- `GET /api/admin/supervisors` - List all supervisors
- `GET /api/admin/riders` - List all riders
- `POST /api/admin/upload?type={riders|performance}` - Upload Excel files
- `GET /api/admin/performance/stats` - Performance statistics
- `GET /api/admin/salary/calculate?supervisorCode={code}&startDate={date}&endDate={date}` - Calculate salary
- `POST /api/admin/salary/config` - Configure salary settings
- `GET /api/admin/termination-requests` - List termination requests
- `PUT /api/admin/termination-requests` - Approve/reject request
- `GET /api/admin/debug` - Debug utilities

