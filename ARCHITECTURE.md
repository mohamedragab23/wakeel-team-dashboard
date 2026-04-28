# System Architecture Documentation

## Overview

This is a Next.js 14 fullstack application that manages supervisors and riders performance, payroll, and dismissal requests. The system uses Google Sheets as the primary data store with server-side caching for performance.

## Technology Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Data Storage:** Google Sheets API (primary), in-memory cache (secondary)
- **Authentication:** JWT tokens
- **State Management:** React Query (@tanstack/react-query)
- **Charts:** Recharts
- **Excel Processing:** xlsx library

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Supervisor │  │    Admin     │  │   Dashboard  │    │
│  │     Pages    │  │    Pages     │  │   Components  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                            │                               │
│                    ┌───────▼────────┐                      │
│                    │  React Query   │                      │
│                    │   (Client      │                      │
│                    │    Cache)      │                      │
│                    └───────┬────────┘                      │
└────────────────────────────┼───────────────────────────────┘
                             │
                             │ HTTP/HTTPS
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Next.js API Routes                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   /api/auth  │  │ /api/riders  │  │ /api/performance│  │
│  │   /api/salary│  │ /api/admin/* │  │ /api/dashboard│  │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                  │                  │           │
│         └──────────────────┼──────────────────┘           │
│                            │                               │
│                    ┌───────▼────────┐                      │
│                    │  Middleware   │                      │
│                    │  (Auth Check) │                      │
│                    └───────┬────────┘                      │
└────────────────────────────┼───────────────────────────────┘
                             │
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Business Logic Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ dataService  │  │salaryService │  │ dataFilter   │   │
│  │ adminService │  │excelProcessor│  │ realtimeSync  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                  │                  │           │
│         └──────────────────┼──────────────────┘           │
│                            │                               │
│                    ┌───────▼────────┐                      │
│                    │  Cache Layer   │                      │
│                    │  (In-Memory)   │                      │
│                    └───────┬────────┘                      │
└────────────────────────────┼───────────────────────────────┘
                             │
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Google Sheets API                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  googleSheets│  │  Service     │  │  Spreadsheet │   │
│  │  Client      │  │  Account     │  │  ID: 1Oxd... │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             │
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Google Sheets                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Sheets:                                            │   │
│  │  - المشرفين (Supervisors)                          │   │
│  │  - المناديب (Riders)                               │   │
│  │  - البيانات اليومية (Daily Performance)            │   │
│  │  - الخصومات (Deductions)                           │   │
│  │  - السلف (Advances)                                │   │
│  │  - استعلام أمني (Security Inquiries)               │   │
│  │  - المعدات (Equipment)                             │   │
│  │  - طلبات_الإقالة (Dismissal Requests)              │   │
│  │  - إعدادات_الرواتب (Salary Settings)              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Authentication Flow
```
User Login → POST /api/auth/login
  → Verify credentials in Google Sheets (المشرفين or Admins sheet)
  → Generate JWT token
  → Return token to client
  → Store in localStorage
```

### 2. Data Retrieval Flow
```
Client Request → API Route
  → Check JWT token (middleware)
  → Check cache (if available, return cached data)
  → Fetch from Google Sheets API
  → Filter by supervisor (if supervisor role)
  → Cache result
  → Return to client
```

### 3. File Upload Flow
```
Admin Uploads Excel → POST /api/admin/upload
  → Parse Excel file (xlsx library)
  → Validate data
  → Write to Google Sheets FIRST (write-first architecture)
  → Invalidate cache
  → Return success/error
```

### 4. Salary Calculation Flow
```
Request Salary → GET /api/salary/calculate
  → Get supervisor's riders
  → Fetch performance data for date range
  → Get salary configuration (fixed/commission)
  → Calculate base salary/commission
  → Fetch deductions (from multiple sheets)
  → Calculate net salary
  → Return breakdown
```

## Caching Strategy

### Server-Side Cache (In-Memory)
- **Location:** `lib/cache.ts`
- **TTL:** 
  - Sheet data: 5 minutes
  - Performance data: 2 minutes
  - Dashboard data: 1 minute
- **Invalidation:** On write operations (uploads, updates)

### Client-Side Cache (React Query)
- **Location:** `@tanstack/react-query`
- **TTL:** 2 minutes (staleTime)
- **Refetch:** Manual (user clicks refresh button)

## Security

### Authentication
- JWT tokens with expiration
- Role-based access control (supervisor/admin)
- Token stored in localStorage (consider httpOnly cookies for production)

### Authorization
- Middleware checks JWT on every API request
- Supervisor data isolation (only see assigned riders)
- Admin has full access

### Data Validation
- Excel file validation (size, format)
- Input sanitization
- Date format validation

## Performance Optimizations

### Implemented
1. **Server-side caching** - Reduces Google Sheets API calls by 80%
2. **Batch processing** - Large Excel uploads processed in chunks
3. **Lazy loading** - Chart components loaded on demand
4. **Memoization** - React components memoized to prevent re-renders
5. **Optimized queries** - Single query for multiple data points

### Target Metrics
- Page load time: < 1.5s
- API response time: < 300ms
- Cache hit rate: > 80%

## Error Handling

### API Errors
- All API routes return consistent error format: `{ success: false, error: string }`
- HTTP status codes: 400 (Bad Request), 401 (Unauthorized), 500 (Server Error)

### Client Errors
- Error boundaries for React components
- User-friendly error messages in Arabic
- Console logging for debugging

## Deployment

### Vercel Deployment
1. Connect GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables Required
```
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_PROJECT_ID
JWT_SECRET
NEXT_PUBLIC_APP_URL
```

## Future Enhancements

### Sprint 2
- Two-way Google Sheets sync
- Dismissal workflow enhancements
- Audit logs

### Sprint 3
- Payroll configuration UI
- Commission editing interface
- Export functionality (PDF/CSV)
- Real-time updates via WebSockets

## Monitoring & Logging

### Current
- Console logging for errors and warnings
- Performance metrics in browser DevTools

### Recommended (Future)
- Error tracking (Sentry)
- Performance monitoring (Vercel Analytics)
- Google Sheets API quota monitoring

