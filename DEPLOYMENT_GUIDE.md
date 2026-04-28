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
- ✅ ملف `.env.local` غير موجود في المشروع (يتم تجاهله تلقائياً)
- ✅ ملف `sup-478117-f78f716bf392.json` غير موجود (يتم تجاهله تلقائياً)
- ✅ جميع ملفات Excel الحساسة غير موجودة

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

في صفحة إعداد المشروع، اذهب إلى **"Environment Variables"** وأضف:

```
GOOGLE_SHEETS_SPREADSHEET_ID=1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE
GOOGLE_SERVICE_ACCOUNT_EMAIL=sheets-api@sup-478117.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDp1dA2d+SXLpze\n6mmpEWDryS5YxMOw5X9gmpv2bGJEpoVLiFSvlNbuwxe9fykDO9WZJD1Fv6h4YtSN\nSScJJrjyFjmOjeLMdpU56TV0H+fA1x3qQ0u/CrR+j5mazu4l+Q8r0wL42RTNArjQ\nVJ5inl1uUXLnH7eC/OjwxN1vEL1akAdqJCM5yEL75tuM65+xQmndIsclsR4+G2WE\nBjAwDjzI0/DsDvqhkK/CeDPn48J2qrEExePmF1FDqhHnXbf/s6s7qW3TOQMCKAQv\nAIeW0/EEr0Q3j19jRd4UkLO/lEdBSbotSq2ZNrtC9hFjz4WT86SyFzELLeEHOjw8\nl17ChbAlAgMBAAECggEABFsjB0C6zI4vKxIyQ/soU1ePOlL25bWTC1A6ldaZ5gl+\nYZ2Lr3Y6osdxU8YXgcgzR99VPN+tbJwfR9FdVIKZA2c030fSgzP+4xa3pjOTGMsf\n80D1G2rSxxelKS1mz3baSu1GhlOnNrAw3S5fgYiEj+ivYCP9sAdGqeWOqU/dFyjD\nvGvSfcxbjkLktCk7nfTDZ/p9L0OG/ypc4WgRElBQDxxTOozVvQR9+iM4SstJlG5I\nx9VRSZkIMhx3vEx569wQ4ckA564KmVamhr13vaKHD1bu6CARxxxPGwXb/w7Ow6iX\nBEzk9Yl1qo2+95UAdWPmGjMgIlem+KUquJ8ylUw16QKBgQD6EQohuyS8dxzRKSpJ\nWlKQnNxUlLF7jP53bhv9b79PgxQs4el4LQ+OBq+4z+aH+i9jc4mMhuMS0Mh+/B5q\nZnEqtr306K3HWtoptJJ8WWhWE18gpQdYEdSSvxEgm37j6IAEuI2k44RYd4ZUobxj\npO+S0lmtvNCD5Iju0QzbDQOk9wKBgQDvYi5N108RBexY1PDGARCDmjlDSdrLpUPc\n0dZEdwvePGHftvoDeX0WwfFPWw7S5jF6aoM4gWf9kKM9FdwLU5X7fOptzyVTY3Zh\ntJrRA8oeeawNAOwpCk9W22/YFgP9wnyU24EojUnywhgCGKcauNdc3KrAKuHZ7YXC\nlyxhk184wwKBgQDaq93dQ0ZLnClR6hp1TIuYs+Kj/+b38IJxM5M8WuTDhg81dFPx\n6A2LF+O/y+V+kNOxts3YWfflczdwe82pI23geS7BJFsaUiMmhyX1oUVwx73O0SEL\n7YOi03wJtJAQgja4ah5Kyz3nEpYgGdKgnBF3pYQQPmVkgIsRszL3tniyXwKBgHIn\n+vbqB22RyozuN0fleA+aO1aIYMueq0ch1jFeKA25896wrnd7txhkMoRqYx5V4iCD\nrMIEjCfSktXtl7rbCHoertjg4ObsVqbvbqjgSsHPuimVWAmWPhGooaSFky+vUKPY\nLba98hbPUo2lXgMTRLinDtKHYJ8BczlByEtb8RvrAoGBAM08eBL2MhMfOpVOfx4y\nbtlU8vaM+4VWjpOSpgpimLMGutvW74Nhg+YWkJ89WrnCvfSdyXF84a/Xq6OSv2oh\nFceBve+Dv9qGJQvd6HyAir9mIjSv4ZF5QiYfwfJyDs7MwzQABRy6MFHbIa1ET03I\nalY0rAEOs+vwgGceY46q6Z/A\n-----END PRIVATE KEY-----\n
GOOGLE_PROJECT_ID=sup-478117
JWT_SECRET=007sup-secret-key-change-in-production-2024
NEXT_PUBLIC_APP_URL=https://your-app-name.vercel.app
```

**ملاحظات مهمة:**
- في `GOOGLE_PRIVATE_KEY`، يجب أن تحافظ على `\n` كما هي (لا تحولها إلى سطور جديدة)
- في `NEXT_PUBLIC_APP_URL`، استبدل `your-app-name` باسم المشروع الذي سيعطيه Vercel
- يمكنك تغيير `JWT_SECRET` إلى قيمة عشوائية قوية

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

- ✅ تأكد من تغيير `JWT_SECRET` في Vercel إلى قيمة قوية
- ✅ استخدم HTTPS دائماً (Vercel يوفرها تلقائياً)
- ✅ لا تشارك ملفات `.env` أو Service Account Keys

## استكشاف الأخطاء

### المشكلة: البناء فشل على Vercel

**الحل:**
1. تحقق من Console في Vercel لمعرفة الخطأ
2. تأكد من أن جميع المتغيرات البيئية موجودة
3. تأكد من أن `GOOGLE_PRIVATE_KEY` يحتوي على `\n` وليس سطور جديدة

### المشكلة: النظام لا يتصل بـ Google Sheets

**الحل:**
1. تحقق من `GOOGLE_SHEETS_SPREADSHEET_ID`
2. تحقق من `GOOGLE_SERVICE_ACCOUNT_EMAIL`
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

