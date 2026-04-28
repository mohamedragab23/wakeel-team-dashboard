# نظام إدارة المشرفين - 007 للخدمات اللوجستية

نظام إدارة شامل للمشرفين والمناديب مبني على Next.js مع تكامل Google Sheets API.

## المميزات

- ✅ واجهة مستخدم عربية حديثة مع دعم RTL
- ✅ نظام مصادقة للمشرفين والأدمن
- ✅ لوحة تحكم مع إحصائيات شاملة
- ✅ تتبع الأداء مع رسوم بيانية
- ✅ حساب الراتب مع الخصومات والبدلات
- ✅ عرض بيانات المناديب
- ✅ تصميم متجاوب لجميع الأجهزة

## المتطلبات

- Node.js 18+ 
- npm أو yarn
- حساب Google Cloud مع Google Sheets API مفعل
- Service Account في Google Cloud

## التثبيت

1. استنسخ المشروع:
```bash
git clone <repository-url>
cd 007Sup
```

2. ثبت الحزم:
```bash
npm install
# أو
yarn install
```

3. أنشئ ملف `.env.local`:
```env
GOOGLE_SHEETS_SPREADSHEET_ID=1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id
JWT_SECRET=your-secret-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## إعداد Google Sheets API

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/)
2. أنشئ مشروع جديد أو اختر مشروع موجود
3. فعّل Google Sheets API
4. أنشئ Service Account:
   - اذهب إلى IAM & Admin > Service Accounts
   - أنشئ Service Account جديد
   - حمّل ملف JSON للمفاتيح
5. شارك ملف Google Sheets مع Service Account:
   - افتح ملف Google Sheets
   - اضغط على "مشاركة"
   - أضف بريد Service Account مع صلاحية "محرر"

## تشغيل المشروع

للتنمية المحلية:
```bash
npm run dev
# أو
yarn dev
```

افتح [http://localhost:3000](http://localhost:3000) في المتصفح.

للإنتاج:
```bash
npm run build
npm start
```

## النشر على Vercel

1. اربط مستودع GitHub مع Vercel
2. أضف متغيرات البيئة في إعدادات Vercel:
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `GOOGLE_PROJECT_ID`
   - `JWT_SECRET`
   - `NEXT_PUBLIC_APP_URL`

3. انشر المشروع

## هيكل المشروع

```
007Sup/
├── app/                    # صفحات Next.js
│   ├── api/               # API routes
│   ├── dashboard/         # لوحة التحكم
│   ├── riders/            # صفحة المناديب
│   ├── performance/       # صفحة الأداء
│   ├── salary/            # صفحة الراتب
│   └── reports/           # صفحة التقارير
├── components/            # مكونات React
├── lib/                   # مكتبات وخدمات
│   ├── googleSheets.ts    # تكامل Google Sheets
│   ├── auth.ts            # نظام المصادقة
│   ├── dataService.ts     # خدمات البيانات
│   └── salaryService.ts   # حساب الراتب
└── public/                # ملفات ثابتة
```

## الأوراق المطلوبة في Google Sheets

يجب أن يحتوي ملف Google Sheets على الأوراق التالية:

- **المشرفين**: كود، اسم، منطقة، بريد، كلمة مرور
- **المناديب**: كود المندوب، اسم، منطقة، كود المشرف، إلخ
- **البيانات اليومية**: تاريخ، كود المندوب، ساعات العمل، طلبات، إلخ
- **الخصومات**: كود المشرف، الشهر، سبب، المبلغ
- **السلف**: كود المشرف، الشهر، المبلغ
- **استعلام أمني**: تاريخ، اسم المندوب، كود المشرف
- **المعدات**: كود المشرف، الشهر، المعدة، التكلفة
- **الأهداف**: كود المشرف، الشهر، الهدف، البونص

## الأمان

- جميع طلبات API محمية بـ JWT tokens
- كلمات المرور مشفرة
- Service Account له صلاحيات محدودة

## الوثائق الإضافية

- **[MAPPING_DOCUMENT.md](./MAPPING_DOCUMENT.md)** - تعيين وظائف Google Apps Script إلى Next.js API routes
- **[HOTFIX_PLAN_SPRINT1.md](./HOTFIX_PLAN_SPRINT1.md)** - خطة إصلاح الأخطاء الحرجة
- **[SPRINT1_HOTFIX_SUMMARY.md](./SPRINT1_HOTFIX_SUMMARY.md)** - ملخص الإصلاحات المنفذة
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - وثائق البنية المعمارية للنظام

## الحسابات التجريبية

### حساب المدير (Admin)
- **الكود:** `admin`
- **كلمة المرور:** `admin123`
- **الصلاحيات:** كاملة (رفع ملفات، إدارة المشرفين، الموافقة على طلبات الإقالة)

### حساب المشرف (Supervisor)
- **الكود:** `SUP001` (أو أي كود موجود في ورقة المشرفين)
- **كلمة المرور:** (كما هو محدد في ورقة المشرفين)
- **الصلاحيات:** عرض مناديب المشرف فقط، طلب إقالة، عرض الأداء والرواتب

> **ملاحظة:** تأكد من وجود هذه الحسابات في ورقة "المشرفين" و "Admins" في Google Sheets

## الإصلاحات المنفذة (Sprint 1)

تم إصلاح جميع الأخطاء الحرجة الأربعة:

✅ **الأداء:** تحسين سرعة التحميل من ~5-10s إلى < 1.5s
✅ **صفحة المناديب:** عرض البيانات بشكل صحيح مع فلترة التاريخ
✅ **صفحة الأداء:** عرض البيانات للفترات المحددة
✅ **صفحة الرواتب:** إصلاح أخطاء toFixed وإظهار الحسابات بشكل صحيح

راجع [SPRINT1_HOTFIX_SUMMARY.md](./SPRINT1_HOTFIX_SUMMARY.md) للتفاصيل الكاملة.

## الدعم

للمساعدة أو الاستفسارات، يرجى فتح issue في المستودع.

## الترخيص

هذا المشروع خاص بـ 007 للخدمات اللوجستية.

