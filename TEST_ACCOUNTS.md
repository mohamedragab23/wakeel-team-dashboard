# Test Accounts

## Admin Account

**Code:** `admin`  
**Password:** `admin123`  
**Role:** Admin  
**Permissions:** Full system access

### Admin Capabilities:
- Upload assignment.xlsx and performance.xlsx files
- View all supervisors and riders
- Approve/reject dismissal requests
- Configure salary settings (fixed, commission type 1, commission type 2)
- View payroll reports
- Access debug utilities

### How to Create:
1. Open Google Sheets
2. Go to "Admins" sheet (create if doesn't exist)
3. Add row: `admin | مدير النظام | admin123 | كامل`

---

## Supervisor Account

**Code:** `SUP001` (or any code from المشرفين sheet)  
**Password:** (as set in المشرفين sheet)  
**Role:** Supervisor  
**Permissions:** View only assigned riders

### Supervisor Capabilities:
- View dashboard with assigned riders statistics
- View riders list with performance data (filtered by date range)
- View performance charts for date ranges
- Calculate and view salary (with deductions)
- Submit dismissal requests for assigned riders

### How to Create:
1. Open Google Sheets
2. Go to "المشرفين" sheet
3. Add row: `SUP001 | اسم المشرف | المنطقة | email@example.com | password123`

### Sample Supervisor Data:
```
Code: SUP001
Name: أحمد محمد
Region: القاهرة
Email: supervisor1@example.com
Password: sup123
```

---

## Test Data Setup

### 1. Create Test Riders
In "المناديب" sheet, add:
```
Rider Code | Rider Name | Region | Supervisor Code | Supervisor Name | Phone | Join Date | Status
R001 | مندوب تجريبي 1 | القاهرة | SUP001 | أحمد محمد | 01234567890 | 2025-01-01 | نشط
R002 | مندوب تجريبي 2 | القاهرة | SUP001 | أحمد محمد | 01234567891 | 2025-01-01 | نشط
```

### 2. Create Test Performance Data
In "البيانات اليومية" sheet, add:
```
Date | Rider Code | Hours | Break | Delay | Absence | Orders | Acceptance Rate | Debt
2025-11-20 | R001 | 8.5 | 1 | 0 | لا | 25 | 95% | 0
2025-11-20 | R002 | 7.5 | 1 | 15 | لا | 20 | 90% | 0
2025-11-21 | R001 | 8.0 | 1 | 0 | لا | 30 | 98% | 0
2025-11-21 | R002 | 8.5 | 1 | 0 | لا | 22 | 92% | 0
```

### 3. Create Test Deductions (Optional)
In "الخصومات" sheet, add:
```
Supervisor Code | Month | Reason | Amount
SUP001 | 11 | خصم أداء | 50
```

In "السلف" sheet, add:
```
Supervisor Code | Month | Amount
SUP001 | 11 | 200
```

---

## Testing Checklist

### Admin Tests
- [ ] Login with admin account
- [ ] Upload assignment.xlsx file
- [ ] Upload performance.xlsx file (with date 2025-11-20)
- [ ] View all supervisors
- [ ] View all riders
- [ ] Approve/reject dismissal request
- [ ] Configure salary settings
- [ ] View payroll reports

### Supervisor Tests
- [ ] Login with supervisor account
- [ ] View dashboard (should show only assigned riders)
- [ ] View riders page (should show data for 2025-11-20)
- [ ] Filter riders by date range
- [ ] View performance page (should show chart data)
- [ ] Filter performance by date range
- [ ] View salary page (should calculate correctly)
- [ ] Submit dismissal request

### Performance Tests
- [ ] Page load time < 1.5s
- [ ] API response time < 300ms
- [ ] Data appears correctly after upload
- [ ] Date filtering works correctly
- [ ] No console errors

---

## Troubleshooting

### Login Fails
- Check that account exists in Google Sheets
- Verify password matches exactly (case-sensitive)
- Check JWT_SECRET is set in environment variables

### No Data Appears
- Verify data exists in Google Sheets
- Check date format (should be YYYY-MM-DD or M/D/YYYY)
- Verify supervisor-rider assignment is correct
- Check browser console for errors

### Performance Issues
- Clear browser cache
- Check server logs for slow queries
- Verify Google Sheets API quota not exceeded
- Check network connection

---

## Notes

- All test accounts should be created in Google Sheets before testing
- Passwords are stored in plain text in Google Sheets (for testing only)
- In production, passwords should be hashed
- Test data can be deleted after testing

