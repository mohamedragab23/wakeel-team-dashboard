# دليل البدء السريع

## الخطوات الأساسية (5 دقائق)

### 1. تثبيت الحزم
```bash
npm install
```

### 2. إعداد متغيرات البيئة

أنشئ ملف `.env.local`:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=1Oxdp2vH0DHkEZwxxUdQhzMgfco9yVKlkJ9llkB4oSqE
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id
JWT_SECRET=your-secret-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. تشغيل المشروع
```bash
npm run dev
```

### 4. افتح المتصفح
افتح [http://localhost:3000](http://localhost:3000)

## ملاحظات مهمة

⚠️ **قبل البدء:**
- تأكد من إعداد Google Cloud Service Account
- شارك ملف Google Sheets مع Service Account
- راجع `SETUP.md` للتفاصيل الكاملة

## اختبار سريع

1. سجّل دخول كمشرف (استخدم بيانات من ورقة "المشرفين")
2. تحقق من لوحة التحكم
3. تصفح بيانات المناديب
4. راجع حساب الراتب

## مشاكل شائعة

**خطأ: "لا يمكن الوصول إلى ملف البيانات"**
→ تأكد من مشاركة Google Sheets مع Service Account

**خطأ: "Authentication failed"**
→ تحقق من `GOOGLE_PRIVATE_KEY` (يجب أن يحتوي على `\n`)

**خطأ: "ورقة غير موجودة"**
→ تأكد من وجود جميع الأوراق المطلوبة

---

للمزيد من التفاصيل، راجع `SETUP.md`

