# نظام التعليقات اليومية للمناديب
## Rider Daily Comments System

تم بناء نظام شامل لتتبع التعليقات اليومية لحالة المناديب، بما في ذلك:
- حوادث، إجازات مرضية، أعذار طارئة
- مشاكل المعدات، غيابات متكررة، أداء ضعيف
- تاريخ العودة المتوقع للمناديب المصابين/المرضى

---

## البنية والملفات

### 1. Types & Configuration
- **`lib/riderComments/types.ts`**  
  - تعريف نوع `RiderDailyComment`
  - تعريف `CommentCategory` (9 فئات)
  - ترجمة عربية وأيقونات لكل فئة
  - ألوان لكل فئة للتمييز

### 2. Service Layer
- **`lib/riderComments/service.ts`**  
  - `getRiderComments()` - جلب تعليقات مندوب معين
  - `getCommentsForDate()` - جلب تعليقات تاريخ معين
  - `getSupervisorComments()` - جلب تعليقات مشرف
  - `getAllComments()` - جلب كل التعليقات (للأدمن)
  - `addRiderComment()` - إضافة تعليق جديد
  - `getAbsenceReasonsSummary()` - تلخيص أسباب الغياب
  - `getRidersExpectedToReturn()` - المناديب المتوقع عودتهم قريباً

### 3. API Routes
- **`app/api/rider-comments/route.ts`**  
  - **GET**: جلب التعليقات حسب الدور (مشرف/أدمن)
    - المشرف: يرى تعليقاته فقط
    - الأدمن: يرى كل التعليقات أو تعليقات مشرف معين
  - **POST**: إضافة تعليق جديد (مشرف/أدمن فقط)

### 4. UI Pages

#### 4.1 صفحة المشرف: `/rider-comments`
- **الهدف**: إضافة تعليقات يومية للمناديب
- **المميزات**:
  - نموذج إضافة تعليق بسيط وسهل الاستخدام
  - بحث وفلترة المناديب حسب الاسم/الكود
  - اختيار الفئة من قائمة منسدلة
  - حقول إضافية لتاريخ العودة المتوقع (للحوادث/الإجازات المرضية)
  - عرض التعليقات الأخيرة
- **الصلاحيات**: مشرف/أدمن

#### 4.2 لوحة الأدمن: `/admin/rider-comments-dashboard`
- **الهدف**: عرض شامل لكل التعليقات مع تحليل وتكرار
- **المميزات**:
  - فلاتر متقدمة (تاريخ، فئة، مشرف)
  - **حساب تكرار التعليقات لكل مندوب**:
    - كم مرة تم تسجيل تعليق لكل مندوب
    - توزيع التعليقات حسب الفئة لكل مندوب
    - الفئة الأكثر تكراراً لكل مندوب
    - آخر تاريخ تعليق
  - توزيع التعليقات حسب الفئة (إحصائيات)
  - عرض التعليقات الأخيرة من جميع المشرفين
  - متوسط عدد التعليقات لكل مندوب
- **الصلاحيات**: أدمن فقط

---

## Google Sheet Structure

**Sheet Name**: `rider_daily_comments`

| Column | Field | Description |
|--------|-------|-------------|
| A | id | معرف فريد (CMT-timestamp-random) |
| B | riderCode | كود المندوب |
| C | riderName | اسم المندوب |
| D | supervisorCode | كود المشرف |
| E | supervisorName | اسم المشرف |
| F | date | تاريخ التعليق (YYYY-MM-DD) |
| G | category | الفئة (accident, medical_leave, etc.) |
| H | expectedReturnDate | تاريخ العودة المتوقع (اختياري) |
| I | estimatedReturnDays | عدد أيام الغياب المتوقعة (اختياري) |
| J | notes | ملاحظات نصية |
| K | createdAt | تاريخ الإنشاء (ISO timestamp) |
| L | updatedAt | تاريخ التحديث (ISO timestamp) |

---

## Comment Categories

| Category | Arabic Label | Icon | Use Case |
|----------|--------------|------|----------|
| `working_normally` | شغال عادي | ✅ | المندوب يعمل بشكل طبيعي بلا مشاكل |
| `accident` | حادث | 🚑 | إصابة/حادث عمل |
| `medical_leave` | إجازة مرضية | 🏥 | مرض، مستشفى |
| `family_emergency` | طارئ عائلي | 👨‍👩‍👧‍👦 | وفاة، ولادة، إلخ |
| `equipment_issue` | مشكلة معدات | 🔧 | سكوتر معطل، هاتف، إلخ |
| `frequent_absences` | غيابات متكررة | ⚠️ | تحذير من كثرة الغياب |
| `vacation` | إجازة | 🌴 | إجازة رسمية |
| `poor_performance` | أداء ضعيف | 📉 | عدد طلبات قليل، تأخير، إلخ |
| `terminated` | مُقال | 🚫 | تم إنهاء العمل |
| `other` | أخرى | 📝 | أي سبب آخر |

**ملاحظة**: لكل الفئات ما عدا `working_normally` يمكن إضافة:
- **تاريخ العودة المتوقع** (`expectedReturnDate`)
- **عدد الأيام المتوقعة** (`estimatedReturnDays`)

---

## Data Flow

### Adding a Comment (Supervisor)
```
Supervisor UI (/rider-comments)
  ↓
POST /api/rider-comments
  ↓
addRiderComment(service)
  ↓
appendToSheet(rider_daily_comments)
  ↓
Google Sheets
```

### Viewing Comments (Admin)
```
Admin UI (/admin/rider-comments-dashboard)
  ↓
GET /api/rider-comments (no filters → all comments)
  ↓
getAllComments(service)
  ↓
getSheetData(rider_daily_comments)
  ↓
Calculate frequency per rider
  ↓
Display with breakdown
```

---

## Admin Features

### 1. Rider Comment Frequency
For each rider, the dashboard calculates:
- Total number of comments
- Breakdown by category (e.g., 3x accident, 2x medical_leave)
- Most frequent category
- Last comment date

**Example**:
```
Rider: Ahmed (code: 123456)
Total Comments: 8
- Accident: 3
- Medical Leave: 2
- Vacation: 2
- Other: 1
Most Frequent: Accident 🚑
Last Comment: 2026-07-10
```

### 2. Category Distribution
Shows total comments for each category across all riders:
```
🚑 Accident: 45
🏥 Medical Leave: 32
👨‍👩‍👧‍👦 Family Emergency: 12
⚠️ Frequent Absences: 8
...
```

### 3. Filters
- **Date Range**: من تاريخ / إلى تاريخ
- **Category**: اختيار فئة معينة
- **Supervisor**: اختيار مشرف معين

---

## Integration with Strategic Ops Center

التعليقات اليومية يمكن دمجها مع مركز العمليات الاستراتيجي لتحليل أدق:

### Future Enhancements:
1. **Inactive Riders Analysis**: ربط التعليقات مع تحليل الغياب
   - المناديب الغائبين 3+ أيام → عرض آخر تعليق لهم
   - تصنيف الغياب (حادث، مرضي، غير مبرر)

2. **Performance Warnings**: تحذيرات مبنية على التعليقات
   - "5 مناديب غيابات متكررة هذا الشهر"
   - "3 مناديب أداء ضعيف يحتاجون تدخل فوري"

3. **Expected Returns**: توقع عودة المناديب
   - عرض المناديب المتوقع عودتهم خلال الأيام القادمة
   - تذكير تلقائي للمشرفين

4. **Supervisor Evaluation**: تقييم المشرفين بناءً على التعليقات
   - مشرف لديه 10 مناديب حوادث → يحتاج تدريب سلامة
   - مشرف لديه 5 مناديب غيابات متكررة → يحتاج متابعة

---

## Security & Permissions

### Role-Based Access:
- **Supervisor**:
  - يمكنه إضافة تعليقات لمناديبه فقط
  - يمكنه رؤية تعليقاته فقط
- **Admin**:
  - يمكنه إضافة تعليقات لأي مندوب
  - يمكنه رؤية كل التعليقات من جميع المشرفين
  - يمكنه تصفية حسب مشرف معين
  - يمكنه رؤية التحليل والتكرار

---

## Usage Example

### Scenario: Rider had an accident
```javascript
POST /api/rider-comments
{
  "riderCode": "877614",
  "riderName": "أحمد محمد",
  "date": "2026-07-15",
  "category": "accident",
  "expectedReturnDate": "2026-07-20",
  "estimatedReturnDays": 5,
  "notes": "سقط من السكوتر، كسر بسيط في اليد، يحتاج راحة"
}
```

### Admin Dashboard will show:
- Ahmed now has 1 comment (or +1 if he had previous comments)
- Category: Accident 🚑
- Expected return: 2026-07-20 (in 5 days)
- Notes visible to admin

---

## Benefits

✅ **تحليل أدق**: معرفة السبب الحقيقي وراء غياب المندوب (حادث، إجازة، عذر...)  
✅ **توقع العودة**: معرفة متى سيعود المناديب المصابون/المرضى  
✅ **تحذيرات مبكرة**: اكتشاف المناديب الذين يأخذون إجازات متكررة  
✅ **قرارات أفضل**: توصيات مبنية على أسباب حقيقية وليس مجرد أرقام  
✅ **سجل دائم**: التعليقات لا تُحذف، مما يوفر سجلاً كاملاً لحالة كل مندوب  
✅ **تقييم المشرفين**: قياس جودة المتابعة بناءً على التعليقات المسجلة

---

## Technical Notes

- التعليقات مخزنة في Google Sheets (لا توجد قاعدة بيانات منفصلة)
- كل تعليق له معرف فريد `CMT-timestamp-random`
- التعليقات مرتبة حسب التاريخ (الأحدث أولاً)
- لا يمكن حذف التعليقات (سجل دائم)
- التعليقات تُربط بـ riderCode و supervisorCode

---

## Future Work

1. ✅ إضافة حساب تكرار التعليقات (DONE)
2. ✅ لوحة تحكم للأدمن (DONE)
3. ⏳ ربط مع مركز العمليات الاستراتيجي
4. ⏳ تذكيرات تلقائية للمناديب المتوقع عودتهم
5. ⏳ تقارير شهرية للمشرفين
6. ⏳ تحليل أسباب الغياب (Breakdown by zone/supervisor)

---

Last Updated: 2026-07-15
