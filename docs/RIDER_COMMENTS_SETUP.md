# إعداد نظام التعليقات اليومية
## Rider Comments System Setup

## ⚠️ متطلبات قبل الاستخدام

قبل استخدام نظام التعليقات اليومية، يجب إنشاء Google Sheet بالاسم التالي:

### 📝 Google Sheet Required

**Sheet Name**: `rider_daily_comments`

**Column Headers** (الصف الأول):

| Column | Header Name | Description |
|--------|-------------|-------------|
| A | id | معرف فريد للتعليق |
| B | riderCode | كود المندوب |
| C | riderName | اسم المندوب |
| D | supervisorCode | كود المشرف |
| E | supervisorName | اسم المشرف |
| F | date | تاريخ التعليق (YYYY-MM-DD) |
| G | category | الفئة (working_normally, accident, medical_leave, etc.) |
| H | expectedReturnDate | تاريخ العودة المتوقع (لجميع الفئات ما عدا working_normally) |
| I | estimatedReturnDays | عدد أيام الغياب المتوقعة (لجميع الفئات ما عدا working_normally) |
| J | notes | ملاحظات |
| K | createdAt | تاريخ الإنشاء (ISO) |
| L | updatedAt | تاريخ التحديث (ISO) |

---

## 🚀 خطوات الإعداد

### 1. إنشاء Google Sheet
```
1. افتح Google Sheets
2. أنشئ sheet جديد
3. سمّه "rider_daily_comments"
4. أضف الHeaders في الصف الأول كما هو موضح أعلاه
5. شارك الSheet مع Service Account (نفس الموجود في .env.local)
```

### 2. التحقق من الإعداد
```
1. افتح الداشبورد
2. سجل دخول كمشرف
3. افتح "💬 التعليقات اليومية"
4. إذا ظهرت قائمة المناديب، فالإعداد صحيح ✅
5. إذا ظهر خطأ 401 أو "Failed to load", فهناك مشكلة في Sheet
```

---

## 🔧 استكشاف الأخطاء

### Error: 401 Unauthorized
**السبب**: Sheet غير موجود أو لا يمكن الوصول إليه  
**الحل**:
1. تأكد من إنشاء Sheet باسم `rider_daily_comments` بالضبط
2. تأكد من مشاركة Sheet مع Service Account
3. تأكد من وجود Headers في الصف الأول

### Error: Failed to load comments
**السبب**: Sheet موجود لكن فارغ أو بدون headers  
**الحل**:
1. افتح Sheet
2. أضف الHeaders في الصف الأول
3. احفظ
4. حدّث الصفحة

### الداشبورد ثقيل جداً
**السبب**: مشكلة في cache أو session  
**الحل**:
1. اضغط Ctrl + Shift + Delete
2. امسح Cache و Cookies
3. سجل دخول من جديد
4. أو استخدم Incognito Mode

### رسالة "يرجى اختيار الفئة" رغم اختيار "شغال عادي"
**السبب**: إصدار قديم من الكود  
**الحل**:
1. حدّث الصفحة (F5 أو Ctrl + R)
2. إذا استمرت المشكلة، امسح Cache
3. الإصدار الجديد يدعم "شغال عادي" كافتراضي ✅

---

## ✅ التحقق من الإعداد الصحيح

### للمشرف:
1. افتح `/rider-comments`
2. يجب أن يظهر:
   - ✅ قائمة بكل المناديب
   - ✅ قائمة منسدلة بجانب كل مندوب (الافتراضي: ✅ شغال عادي)
   - ✅ حقل ملاحظات (اختياري)
   - ✅ زر "💾 حفظ"

**💡 نصيحة**: لحفظ "شغال عادي"، اضغط "💾 حفظ" مباشرة بدون تغيير أي شيء!

### للأدمن:
1. افتح `/admin/rider-comments-dashboard`
2. يجب أن يظهر:
   - ✅ إحصائيات التعليقات
   - ✅ توزيع حسب الفئة
   - ✅ تكرار التعليقات لكل مندوب
   - ✅ أحدث التعليقات من جميع المشرفين

---

## 📚 المستندات الأخرى

- [RIDER_COMMENTS_SYSTEM.md](./RIDER_COMMENTS_SYSTEM.md) - شرح النظام بالكامل
- [ADMIN_TELEGRAM_NOTIFICATIONS.md](./ADMIN_TELEGRAM_NOTIFICATIONS.md) - إشعارات Telegram

---

## 🆘 الدعم

إذا استمرت المشاكل:
1. تحقق من Vercel Logs
2. تحقق من Console في المتصفح (F12)
3. تحقق من Google Sheets API permissions
4. تأكد من Environment Variables في Vercel

Last Updated: 2026-07-16
