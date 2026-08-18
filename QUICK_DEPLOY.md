# نشر سريع على GitHub و Vercel

## الخطوات السريعة

### الخطوة 1: رفع على GitHub

1. **أنشئ Repository جديد على GitHub:**
   - اذهب إلى https://github.com/new
   - أدخل اسم المشروع (مثلاً: `007sup-management-system`)
   - اختر Private أو Public
   - **لا** تضع علامة على "Initialize with README"
   - اضغط "Create repository"

2. **ارفع الكود:**
   ```bash
   cd "C:\Users\Mohamed Ragab\Downloads\007Sup"

   # إضافة Remote (استبدل YOUR_USERNAME و REPO_NAME)
   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

   # رفع الكود
   git branch -M main
   git push -u origin main
   ```

### الخطوة 2: نشر على Vercel

1. **سجل الدخول على Vercel:**
   - اذهب إلى https://vercel.com
   - اضغط "Sign Up" واختر "Continue with GitHub"
   - وافق على الصلاحيات

2. **أضف المشروع:**
   - اضغط "Add New..." → "Project"
   - اختر Repository الذي رفعته
   - اضغط "Import"

3. **أضف Environment Variables في Vercel فقط (ليس في Git):**

   Project Settings → Environment Variables. أسماء المتغيرات:

   ```
   GOOGLE_SHEETS_SPREADSHEET_ID
   GOOGLE_SERVICE_ACCOUNT_EMAIL
   GOOGLE_PRIVATE_KEY
   GOOGLE_PROJECT_ID
   JWT_SECRET
   CRON_SECRET
   NEXT_PUBLIC_APP_URL
   ```

   لا تلصق مفاتيح أو أسرار في هذا الملف. بعد النشر، ضع رابط التطبيق الفعلي في `NEXT_PUBLIC_APP_URL`.
   لا تضع `CRON_SECRET` في رابط — استخدم `Authorization: Bearer` أو الهيدر `x-cron-secret`.

4. **انشر:**
   - اضغط "Deploy"
   - انتظر 2-5 دقائق
   - احصل على الرابط: `https://your-app-name.vercel.app`

### الخطوة 3: مشاركة مع الفريق

بعد النشر، شارك الرابط مع المشرفين:
```
https://your-app-name.vercel.app
```

---

## ملاحظات مهمة

- **الملفات الحساسة محمية:** `.env` وملفات حساب الخدمة وملفات Excel الحساسة يجب ألا تُرفع على GitHub
- **التحديثات التلقائية:** أي تغيير ترفعه على GitHub سيتم نشره تلقائياً على Vercel
- **HTTPS مجاني:** Vercel يوفر HTTPS تلقائياً
- **النطاق المجاني:** يمكنك الحصول على نطاق مجاني مثل `your-app.vercel.app`

## تحديثات لاحقة

عند إجراء أي تغييرات:

```bash
git add .
git commit -m "وصف التغييرات"
git push origin main
```

Vercel سينشر التحديثات تلقائياً.

---

**للمزيد من التفاصيل، راجع:** `DEPLOYMENT_GUIDE.md`
