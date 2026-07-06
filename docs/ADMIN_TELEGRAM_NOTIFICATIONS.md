# نظام إشعارات Telegram للإدمنز

## نظرة عامة

نظام إشعارات Telegram يرسل تنبيهات فورية للإدمنز عند حدوث أي من الأحداث التالية:

- ✅ طلبات إقالة جديدة
- ✅ طلبات تعيين جديدة
- ✅ طلبات إعادة تفعيل جديدة
- ✅ طلبات تسليم/استرجاع معدات
- ✅ تذاكر جديدة (Ticketing)
- ✅ طيارين بيانات ناقصة (Join Date مفقود) - ملخص يومي

## الإعداد

### 1. إعداد Telegram Bot (إذا لم يكن موجوداً)

إذا كان لديك بالفعل `TELEGRAM_BOT_TOKEN` في `.env.local`، تخطى هذه الخطوة.

1. افتح Telegram وابحث عن `@BotFather`
2. أرسل `/newbot`
3. اتبع التعليمات لإنشاء بوت جديد
4. احفظ الـ Bot Token (مثال: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. أضف الـ Token في ملف `.env.local`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### 2. الحصول على Telegram Chat ID لكل إدمن

كل إدمن يحتاج للحصول على Chat ID الخاص به:

#### الطريقة الأولى: باستخدام Bot الخاص بك

1. افتح Telegram وابحث عن البوت الخاص بك (الذي أنشأته في الخطوة 1)
2. اضغط `/start` أو أرسل أي رسالة
3. افتح المتصفح واذهب إلى:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   (استبدل `<YOUR_BOT_TOKEN>` بالـ Token الخاص بك)
4. ستجد في النتائج شيء مثل:
   ```json
   {
     "message": {
       "chat": {
         "id": 123456789,
         "type": "private"
       }
     }
   }
   ```
5. احفظ الـ `id` (مثال: `123456789`)

#### الطريقة الثانية: باستخدام @userinfobot

1. افتح Telegram وابحث عن `@userinfobot`
2. اضغط `/start`
3. سيرسل لك الـ Chat ID مباشرة

### 3. إضافة Chat IDs في Google Sheet

1. افتح Google Sheet الخاص بالإدمنز (tab: `الإدمنز` أو `Admins`)
2. أضف عمود جديد بعنوان: `telegram_chat_id`
3. لكل إدمن، أضف الـ Chat ID الخاص به في هذا العمود

**مثال:**

| كود | الاسم | ... | telegram_chat_id |
|-----|-------|-----|-----------------|
| A001 | أحمد محمد | ... | 123456789 |
| A002 | محمود علي | ... | 987654321 |

### 4. (اختياري) إرسال جميع الإشعارات لمجموعة واحدة

إذا كنت تريد إرسال جميع إشعارات الإدمنز لمجموعة Telegram واحدة بدلاً من إرسالها لكل إدمن على حدة:

1. أنشئ مجموعة في Telegram
2. أضف البوت إلى المجموعة
3. احصل على Chat ID للمجموعة (نفس الطريقة أعلاه، لكن الـ ID سيكون سالباً مثل `-1234567890`)
4. أضف في `.env.local`:
   ```bash
   TELEGRAM_ADMIN_GROUP_CHAT_ID=-1234567890
   ```

عند وجود `TELEGRAM_ADMIN_GROUP_CHAT_ID`، سيتم إرسال جميع الإشعارات لهذه المجموعة فقط وتجاهل Chat IDs الفردية.

## تنسيق الإشعارات

### 1. طلب إقالة جديد
```
🔔 طلب جديد يحتاج مراجعة

📋 النوع: طلب إقالة
👤 المشرف: أحمد محمد (SUP001)
🆔 الطيار: محمود علي (RID123)
📅 التاريخ: 2026-07-06
📝 السبب: [سبب الإقالة]

🔗 [رابط المراجعة](https://yourdomain.com/admin/termination-requests)
```

### 2. طلب تعيين جديد
```
🔔 طلب جديد يحتاج مراجعة

📋 النوع: طلب تعيين
👤 المشرف: أحمد محمد (SUP001)
🆔 الطيار: محمود علي (RID123)
📍 الزون: الإسكندرية
📄 نوع العقد: دائم
📅 التاريخ: 2026-07-06

🔗 [رابط المراجعة](https://yourdomain.com/admin/assignment-requests)
```

### 3. طلب معدات جديد
```
🔔 طلب جديد يحتاج مراجعة

📋 النوع: طلب تسليم معدات
👤 المشرف: أحمد محمد
📦 المعدات:
  • باوتش موتوسيكل × 1
  • تيشرت × 2
💰 التكلفة الإجمالية: 500 جنيه
📅 التاريخ: 2026-07-06

🔗 [رابط المراجعة](https://yourdomain.com/admin/equipment-requests)
```

### 4. تذكرة جديدة
```
🔴 تذكرة جديدة تحتاج مراجعة

📋 النوع: تذكرة جديدة
🎫 نوع التذكرة: مشكلة في طلب
👤 المشرف: أحمد محمد
📅 التاريخ: 2026-07-06

🔗 [رابط المراجعة](https://yourdomain.com/ticketing/admin)
```

### 5. طيارين بيانات ناقصة (يومي)
```
⚠️ تنبيه: طيارين ببيانات ناقصة

📊 العدد: 15 طيار

الطيارين (أول 10):
  • محمود علي (RID001)
  • أحمد سعيد (RID002)
  ...

⚠️ مطلوب: إكمال تاريخ التعيين (Join Date) للطيارين

🔗 [رابط المراجعة](https://yourdomain.com/admin/riders)
```

## معالجة الأخطاء

- **Non-blocking:** فشل إرسال الإشعار لن يوقف العملية الأساسية
- **Retry logic:** محاولتان كحد أقصى لكل إدمن
- **Error logging:** جميع الأخطاء تُسجل في console للمراقبة
- **Graceful degradation:** إذا فشل الإشعار، الطلب الأساسي سيستمر بنجاح

## التحقق من الإعداد

### 1. اختبار Telegram Bot

قم بإرسال رسالة اختبار:

```bash
curl -X POST \
  "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "<ADMIN_CHAT_ID>",
    "text": "اختبار نظام الإشعارات ✅"
  }'
```

### 2. اختبار النظام الحقيقي

1. قم بإنشاء طلب إقالة من حساب مشرف
2. تحقق من وصول الإشعار للإدمن عبر Telegram
3. تحقق من الرابط في الإشعار يعمل بشكل صحيح

### 3. مراقبة Logs

تحقق من الـ Logs في Console:

```
[AdminTelegramNotifier] Sent to أحمد محمد (A001)
[AdminTelegramNotifier] Summary: sent=3, skipped=1, failed=0
```

## استكشاف الأخطاء

### لا تصل الإشعارات

1. **تحقق من TELEGRAM_BOT_TOKEN:**
   - تأكد أنه موجود في `.env.local`
   - تأكد أنه صحيح وليس منتهي الصلاحية

2. **تحقق من Chat IDs في Sheet:**
   - تأكد أن العمود `telegram_chat_id` موجود
   - تأكد أن الـ IDs مكتوبة بشكل صحيح (أرقام فقط)
   - للمجموعات، الـ ID يبدأ بسالب `-`

3. **تحقق من Logs:**
   ```bash
   # في development
   npm run dev
   
   # ابحث عن:
   [AdminTelegramNotifier] ...
   ```

4. **اختبار مباشر:**
   - استخدم `curl` لاختبار Bot API مباشرة (انظر أعلاه)
   - تأكد أن البوت لم يُحظر من قبل المستخدم

### الإشعارات تصل لبعض الإدمنز فقط

- تحقق من أن جميع الإدمنز بدأوا محادثة مع البوت (`/start`)
- تحقق من أن Chat IDs صحيحة في Sheet
- تحقق من Logs لمعرفة سبب الفشل:
  ```
  [AdminTelegramNotifier] Failed to send to أحمد محمد: Forbidden: bot was blocked by the user
  ```

### الإشعارات متأخرة

- إشعارات Telegram فورية (أقل من ثانية)
- إذا كانت متأخرة، المشكلة قد تكون في:
  - سرعة الإنترنت
  - Telegram Server Status
  - Rate limiting (30 رسالة/ثانية لكل بوت)

## الملفات المعنية

### الملفات الجديدة

- [`lib/adminTelegramNotifier.ts`](../lib/adminTelegramNotifier.ts) - خدمة الإشعارات الرئيسية
- [`lib/adminContacts.ts`](../lib/adminContacts.ts) - جلب بيانات الاتصال للإدمنز

### الملفات المعدلة

- [`app/api/termination-requests/route.ts`](../app/api/termination-requests/route.ts)
- [`app/api/assignment-requests/route.ts`](../app/api/assignment-requests/route.ts)
- [`app/api/reactivation-requests/route.ts`](../app/api/reactivation-requests/route.ts)
- [`app/api/equipment-deliveries/route.ts`](../app/api/equipment-deliveries/route.ts)
- [`app/api/equipment-returns/route.ts`](../app/api/equipment-returns/route.ts)
- [`lib/ticketing/services/ticketService.ts`](../lib/ticketing/services/ticketService.ts)
- [`app/api/cron/rider-metadata-reminder/route.ts`](../app/api/cron/rider-metadata-reminder/route.ts)
- [`env.local.example`](../env.local.example)

## الميزات المستقبلية (اختياري)

1. **أزرار Inline:**
   - إضافة أزرار "موافقة" و "رفض" مباشرة في الإشعار
   - يتطلب Webhook و معالج للـ callback queries

2. **Bot Commands:**
   - `/pending` - عرض الطلبات المعلقة
   - `/stats` - إحصائيات اليوم
   - يتطلب Bot listener (webhook أو polling)

3. **Database Logging:**
   - حفظ سجل الإشعارات المرسلة
   - تقارير عن معدلات النجاح/الفشل

4. **User Preferences:**
   - السماح لكل إدمن بتخصيص أنواع الإشعارات
   - تخزين التفضيلات في Sheet أو Database

## الدعم الفني

للأسئلة أو المشاكل، تواصل مع فريق التطوير.

---

**آخر تحديث:** 2026-07-06
