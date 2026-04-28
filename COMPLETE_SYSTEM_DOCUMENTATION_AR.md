# 📚 التوثيق الكامل للنظام - Write-First Architecture

## 🎯 نظرة عامة

نظام إدارة شامل للمناديب والمشرفين مبني على **Write-First Architecture** مع قاعدة بيانات محلية (IndexedDB) كمصدر رئيسي، و Google Sheets كنسخة احتياطية/مزامنة.

---

## 🏗️ البنية المعمارية

### Write-First Flow:

```
Excel Files
    ↓
System Database (IndexedDB) ← PRIMARY SOURCE
    ↓
Google Sheets (Background Sync) ← BACKUP/SYNC
    ↓
Supervisor Views (Real-time from IndexedDB)
```

---

## 📁 هيكل الملفات

### Core Libraries:

```
lib/
├── database.ts                    # IndexedDB - Primary Storage
├── excelProcessorWriteFirst.ts   # Excel Processing - Write-First
├── syncEngine.ts                  # Google Sheets Sync
├── salaryCalculator.ts            # Salary Calculation Engine
├── performanceOptimizer.ts        # Performance Optimizations
└── googleSheets.ts                # Google Sheets API (Read-only for deductions)
```

### API Routes:

```
app/api/
├── admin/
│   ├── upload/route.ts            # Excel Upload (Write-First)
│   ├── salary/config/route.ts     # Salary Configuration
│   └── riders/route.ts             # Get Riders (from IndexedDB)
├── salary/
│   └── calculate/route.ts          # Calculate Salary
├── sync/route.ts                   # Manual Sync
├── riders/route.ts                 # Get Riders (Supervisor)
├── performance/route.ts            # Get Performance (from IndexedDB)
└── dashboard/route.ts               # Dashboard Data (from IndexedDB)
```

### Pages:

```
app/
├── admin/
│   ├── salary-config/page.tsx     # Salary Configuration UI
│   └── sync/page.tsx              # Sync Page
└── salary/page.tsx                # Salary View (Updated)
```

---

## 💾 قاعدة البيانات (IndexedDB)

### Stores:

1. **`riders`**
   - Key: `riderId`
   - Indexes: `supervisorId`, `status`
   - Fields: `riderId`, `riderName`, `zone`, `supervisorId`, `assignedDate`, `status`

2. **`performance`**
   - Key: `id` (auto-increment)
   - Indexes: `riderId`, `date`, `riderDate`
   - Fields: `date`, `riderId`, `workHours`, `breaks`, `delay`, `absence`, `orders`, `acceptanceRate`, `wallet`

3. **`supervisorConfig`**
   - Key: `supervisorId`
   - Fields: `supervisorId`, `salaryMethod`, `fixedSalary`, `commissionRate`, `hoursMultipliers`, `customFormula`

4. **`debts`**
   - Key: `id` (auto-increment)
   - Indexes: `riderId`, `date`
   - Fields: `riderId`, `amount`, `date`, `notes`

5. **`syncStatus`**
   - Key: `key`
   - Fields: `key`, `value`, `timestamp`

---

## 🔄 تدفق البيانات

### 1. رفع Excel للمناديب:

```typescript
// Step 1: Admin uploads Excel
POST /api/admin/upload
  type: 'riders'
  file: Excel file

// Step 2: Process Excel
processRidersExcelWriteFirst(buffer)
  → Parse Excel
  → Validate data
  → Store in IndexedDB ← FIRST
  → Return result

// Step 3: Background Sync (non-blocking)
syncEngine.syncRidersToSheets()
  → Get riders from IndexedDB
  → Compare with Google Sheets
  → Append new rows only
  → Update sync status
```

### 2. رفع بيانات الأداء:

```typescript
// Step 1: Admin uploads Excel
POST /api/admin/upload
  type: 'performance'
  file: Excel file

// Step 2: Process Excel
processPerformanceExcelWriteFirst(buffer)
  → Parse Excel
  → Validate data
  → Store in IndexedDB ← FIRST
  → Return result

// Step 3: Background Sync
syncEngine.syncPerformanceToSheets()
  → Get performance from IndexedDB
  → Compare with Google Sheets
  → Append new rows only
```

### 3. حساب الراتب:

```typescript
// Step 1: Supervisor opens salary page
GET /api/salary/calculate
  startDate: '2024-01-01'
  endDate: '2024-01-31'

// Step 2: Calculate
calculateSupervisorSalary(supervisorId, startDate, endDate)
  → Get config from IndexedDB
  → Get performance from IndexedDB
  → Get deductions from Google Sheets (read-only)
  → Calculate salary
  → Return result
```

---

## 💰 نظام الراتب

### أنواع الراتب:

#### 1. راتب ثابت:
```typescript
{
  salaryMethod: 'fixed',
  fixedSalary: 5000
}
```

#### 2. عمولة:
```typescript
{
  salaryMethod: 'commission',
  commissionRate: 0.5, // جنيه لكل طلب
  hoursMultipliers: [
    { minHours: 0, maxHours: 4, multiplier: 0.8 },
    { minHours: 4, maxHours: 6, multiplier: 1.0 },
    { minHours: 6, maxHours: 8, multiplier: 1.2 },
    { minHours: 8, maxHours: 24, multiplier: 1.5 }
  ]
}
```

### صيغة العمولة:

```
العمولة اليومية = (الطلبات اليومية) × (معدل العمولة) × (معامل الساعات)

العمولة الإجمالية = مجموع العمولات اليومية
```

### الخصومات:

- **السلف** - من Google Sheets ("السلف")
- **الخصومات** - من Google Sheets ("الخصومات")
- **المعدات** - من Google Sheets ("المعدات")
- **الاستعلامات الأمنية** - من Google Sheets ("استعلام أمني")

**الراتب الصافي = الراتب الأساسي - إجمالي الخصومات**

---

## ⚡ تحسينات الأداء

### 1. IndexedDB (Primary Storage)
- ✅ قراءة فورية (لا انتظار API)
- ✅ تخزين محلي (لا network latency)
- ✅ يعمل offline
- ✅ لا حدود على الحجم

### 2. Caching
- ✅ Memory cache (أسرع)
- ✅ localStorage cache (مستمر)
- ✅ Cache expiration (1 دقيقة)
- ✅ Auto-refresh في الخلفية

### 3. React Query
- ✅ `staleTime: 60 seconds`
- ✅ `gcTime: 5 minutes`
- ✅ `refetchOnWindowFocus: false`
- ✅ Background refetch

### 4. Code Splitting
- ✅ Lazy loading للرسوم البيانية
- ✅ Dynamic imports
- ✅ React.memo()

---

## 🔐 الأمان

### Authentication:
- ✅ JWT Tokens
- ✅ Role-based access
- ✅ Route protection

### Data Isolation:
- ✅ كل مشرف يرى مناديه فقط
- ✅ فلترة تلقائية في IndexedDB
- ✅ لا تسريب للبيانات

---

## 📊 الصفحات والوظائف

### Admin Panel:

#### 1. `/admin/dashboard`
- إحصائيات شاملة
- إجراءات سريعة

#### 2. `/admin/supervisors`
- إدارة المشرفين
- إضافة/تعديل/حذف

#### 3. `/admin/riders`
- عرض المناديب
- رفع Excel للمناديب
- إضافة مندوب فردي

#### 4. `/admin/debts`
- عرض الديون
- رفع Excel للديون

#### 5. `/admin/performance`
- رفع Excel لبيانات الأداء

#### 6. `/admin/salary-config` ⭐ NEW
- تكوين الراتب لكل مشرف
- راتب ثابت/عمولة
- معاملات الساعات

#### 7. `/admin/sync` ⭐ NEW
- مزامنة يدوية
- حالة المزامنة

### Supervisor Dashboard:

#### 1. `/dashboard`
- إحصائيات مناديه فقط
- أفضل المناديب
- رسم بياني

#### 2. `/riders`
- قائمة المناديب المعينين
- بيانات الأداء
- الديون

#### 3. `/performance`
- رسم بياني للأداء
- فلترة حسب التاريخ

#### 4. `/salary` ⭐ UPDATED
- حساب الراتب
- تفاصيل العمولة (إذا كان عمولة)
- الخصومات
- الراتب الصافي

---

## 🧪 سيناريوهات الاختبار

### Scenario 1: رفع Excel للمناديب

1. Admin → `/admin/riders`
2. رفع Excel:
   ```
   RiderID | RiderName | Zone | SupervisorID
   3846890 | Abdelrahman | Assiut | ASY-001
   ```
3. ✅ النتيجة: "تم تعيين المناديب بنجاح"
4. ✅ التحقق: Developer Tools → IndexedDB → riders
5. ✅ التحقق: Google Sheets → "المناديب"

### Scenario 2: رفع بيانات الأداء

1. Admin → `/admin/performance`
2. رفع Excel:
   ```
   التاريخ | RiderID | ساعات | البريك | التأخير | الغياب | الطلبات | معدل القبول | المحفظة
   2024-01-15 | 3846890 | 8.5 | 2 | 15 | لا | 25 | 95% | 1200
   ```
3. ✅ النتيجة: "تم رفع بيانات الأداء بنجاح"
4. ✅ التحقق: IndexedDB → performance
5. ✅ التحقق: Supervisor → `/riders` (يجب أن يرى البيانات)

### Scenario 3: تكوين الراتب

1. Admin → `/admin/salary-config`
2. اختر مشرف: `ASY-001`
3. اختر: عمولة
4. معدل العمولة: `0.5`
5. معاملات الساعات: (افتراضي)
6. ✅ النتيجة: "تم حفظ الإعدادات بنجاح"
7. ✅ التحقق: IndexedDB → supervisorConfig

### Scenario 4: حساب الراتب

1. Supervisor → `/salary`
2. اختر فترة: من 2024-01-01 إلى 2024-01-31
3. ✅ يجب أن يظهر:
   - إجمالي الطلبات
   - إجمالي الساعات
   - معدل العمولة
   - العمولة المحسوبة
   - الخصومات
   - الراتب الصافي
   - تفاصيل العمولة اليومية

### Scenario 5: المزامنة

1. Admin → `/admin/sync`
2. اختر: "مزامنة كاملة"
3. اضغط: "بدء المزامنة"
4. ✅ النتيجة: "تمت المزامنة بنجاح"
5. ✅ التحقق: Google Sheets (يجب أن تظهر البيانات)

---

## 🔍 استكشاف الأخطاء

### المشكلة: البيانات لا تظهر

**الحل:**
1. افتح Developer Tools → Console
2. تحقق من الأخطاء
3. تحقق من IndexedDB → Application → IndexedDB
4. تحقق من Network tab → API calls

### المشكلة: المزامنة لا تعمل

**الحل:**
1. تحقق من `.env.local` (Google Sheets credentials)
2. تحقق من Console للأخطاء
3. جرب مزامنة يدوية من `/admin/sync`

### المشكلة: الراتب لا يُحسب

**الحل:**
1. تحقق من إعدادات الراتب في `/admin/salary-config`
2. تحقق من بيانات الأداء في IndexedDB
3. تحقق من Console للأخطاء

---

## 📝 ملاحظات مهمة

### 1. IndexedDB هو المصدر الرئيسي
- ✅ جميع القراءات من IndexedDB
- ✅ Google Sheets للنسخ الاحتياطي فقط

### 2. المزامنة
- ✅ تلقائية عند رفع الملفات
- ✅ يدوية من صفحة المزامنة
- ✅ في الخلفية (لا تعطل)

### 3. البيانات التاريخية
- ✅ جميع بيانات الأداء محفوظة
- ✅ لا حذف للبيانات
- ✅ فلترة حسب التاريخ

### 4. الخصومات
- ✅ من Google Sheets (للحفاظ على الصيغ)
- ✅ قراءة فقط (لا تعديل)

---

## ✅ النظام جاهز!

**افتح:** `http://localhost:3000`

**ابدأ الاختبار! 🚀**

