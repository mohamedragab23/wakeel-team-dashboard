# دليل نشر النظام على GitHub و Vercel

## الخطوة 1: رفع المشروع على GitHub

### 1.1 إنشاء Repository جديد على GitHub

1. اذهب إلى [GitHub](https://github.com) وسجل الدخول
2. اضغط على زر **"New"** أو **"+"** في الزاوية العلوية
3. اختر **"New repository"**
4. أدخل اسم المشروع (مثلاً: `007sup-management-system`)
5. اختر **Private** (للمشاريع الخاصة) أو **Public** (للمشاريع العامة)
6. **لا** تضع علامة على "Initialize this repository with a README"
7. اضغط **"Create repository"**

### 1.2 رفع الكود على GitHub

افتح Terminal في مجلد المشروع وقم بتنفيذ الأوامر التالية:

```bash
# تأكد أنك في مجلد المشروع
cd "C:\Users\Mohamed Ragab\Downloads\007Sup"

# تهيئة Git (إذا لم يكن موجوداً)
git init

# إضافة جميع الملفات
git add .

# إنشاء Commit أولي
git commit -m "Initial commit: 007Sup Management System"

# إضافة Remote Repository (استبدل YOUR_USERNAME و REPO_NAME بالقيم الصحيحة)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# رفع الكود
git branch -M main
git push -u origin main
```

**ملاحظة مهمة:**
- استبدل `YOUR_USERNAME` باسم المستخدم الخاص بك على GitHub
- استبدل `REPO_NAME` باسم Repository الذي أنشأته

### 1.3 التحقق من الأمان

**قبل الرفع، تأكد من:**
- ملف `.env.local` غير موجود في المشروع (يتم تجاهله تلقائياً)
- ملفات حساب الخدمة (`credentials/*.json`) غير موجودة في Git
- جميع ملفات Excel الحساسة غير موجودة
- لا تضع `GOOGLE_PRIVATE_KEY` أو `JWT_SECRET` أو `CRON_SECRET` في أي ملف داخل المستودع

## الخطوة 2: نشر النظام على Vercel

### 2.1 إنشاء حساب على Vercel

1. اذهب إلى [Vercel](https://vercel.com)
2. اضغط على **"Sign Up"**
3. اختر **"Continue with GitHub"** (الأسهل)
4. سجل الدخول بحساب GitHub الخاص بك
5. وافق على الصلاحيات المطلوبة

### 2.2 ربط المشروع مع Vercel

1. في لوحة Vercel، اضغط على **"Add New..."** ثم **"Project"**
2. اختر Repository الذي رفعته على GitHub
3. اضغط **"Import"**

### 2.3 إعداد متغيرات البيئة (Environment Variables)

في صفحة إعداد المشروع، اذهب إلى **Project Settings → Environment Variables** وأضف القيم هناك فقط. لا تضعها في Git ولا في هذا الدليل.

أسماء المتغيرات المطلوبة:

```
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_PROJECT_ID
JWT_SECRET
CRON_SECRET
NEXT_PUBLIC_APP_URL
```

**ملاحظات مهمة:**
- ضع كل الأسرار في Vercel فقط (Production / Preview / Development).
- في `GOOGLE_PRIVATE_KEY`، يجب أن تحافظ على `\n` كما هي (لا تحولها إلى سطور جديدة).
- في `NEXT_PUBLIC_APP_URL`، استخدم رابط التطبيق الفعلي من Vercel.
- استخدم `JWT_SECRET` و`CRON_SECRET` قيمتين عشوائيتين طويلتين (مثلاً `openssl rand -base64 48`).
- لا تضع `CRON_SECRET` في رابط أو query string — استخدم `Authorization: Bearer` أو الهيدر `x-cron-secret`.

### 2.4 إعدادات البناء (Build Settings)

تأكد من:
- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (افتراضي)
- **Output Directory:** `.next` (افتراضي)
- **Install Command:** `npm install` (افتراضي)

### 2.5 النشر

1. اضغط على **"Deploy"**
2. انتظر حتى ينتهي البناء (عادة 2-5 دقائق)
3. بعد اكتمال البناء، ستحصل على رابط مثل: `https://your-app-name.vercel.app`

## الخطوة 3: تحديثات لاحقة

### عند إجراء تغييرات على الكود:

```bash
# إضافة التغييرات
git add .

# إنشاء Commit
git commit -m "وصف التغييرات"

# رفع التغييرات على GitHub
git push origin main
```

**Vercel سيقوم تلقائياً بإعادة النشر** عند رفع أي تغييرات على GitHub!

## الخطوة 4: مشاركة النظام مع الفريق

### 4.1 مشاركة الرابط

بعد النشر، شارك رابط Vercel مع المشرفين:
```
https://your-app-name.vercel.app
```

### 4.2 إضافة مستخدمين جدد

يمكنك إضافة مستخدمين جدد من خلال:
1. تسجيل الدخول كمدير
2. الذهاب إلى "إدارة المشرفين"
3. إضافة مشرف جديد

### 4.3 إعدادات الأمان

- تأكد من أن `JWT_SECRET` و`CRON_SECRET` في Vercel قيمتان قويتين وعشوائيتين
- استخدم HTTPS دائماً (Vercel يوفرها تلقائياً)
- لا تشارك ملفات `.env` أو Service Account Keys

## استكشاف الأخطاء

### المشكلة: البناء فشل على Vercel

**الحل:**
1. تحقق من Console في Vercel لمعرفة الخطأ
2. تأكد من أن جميع المتغيرات البيئية موجودة
3. تأكد من أن `GOOGLE_PRIVATE_KEY` يحتوي على `\n` وليس سطور جديدة

### المشكلة: النظام لا يتصل بـ Google Sheets

**الحل:**
1. تحقق من `GOOGLE_SHEETS_SPREADSHEET_ID` في Vercel
2. تحقق من `GOOGLE_SERVICE_ACCOUNT_EMAIL` في Vercel
3. تأكد من أن Service Account لديه صلاحيات على Google Sheet

### المشكلة: الخطأ 500 Internal Server Error

**الحل:**
1. تحقق من Logs في Vercel Dashboard
2. تأكد من أن جميع Environment Variables موجودة وصحيحة
3. تحقق من أن Google Sheets API مفعل في Google Cloud Console

## الدعم

إذا واجهت أي مشاكل، تحقق من:
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- Logs في Vercel Dashboard
