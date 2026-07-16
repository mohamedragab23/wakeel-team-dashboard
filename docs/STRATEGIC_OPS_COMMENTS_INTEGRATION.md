# خطة ربط التعليقات اليومية مع مركز العمليات الاستراتيجي
## Strategic Operations & Daily Comments Integration Plan

## 📋 نظرة عامة

هذا المستند يشرح كيفية ربط نظام التعليقات اليومية مع مركز العمليات الاستراتيجي لتحليل أدق وتوصيات أفضل.

---

## ✅ الحالة الحالية (تم إنجازه)

### 1. نظام التعليقات اليومية
- ✅ كل مشرف يرى مناديبه فقط
- ✅ 9 فئات للتعليقات (حادث، إجازة مرضية، إجازة، غياب، إلخ)
- ✅ حفظ التعليقات في Google Sheet `rider_daily_comments`
- ✅ تسجيل التاريخ مع كل تعليق
- ✅ عرض شامل للأدمن لكل التعليقات
- ✅ حساب تكرار التعليقات لكل مندوب
- ✅ تحذيرات تلقائية للتكرار (حوادث متكررة، إجازات متكررة، إلخ)

### 2. دالة الربط (جاهزة للاستخدام)
```typescript
// lib/riderComments/service.ts
export async function getCommentsSummaryForStrategicOps(
  startDate: string,
  endDate: string,
  zone?: string
): Promise<{
  totalComments: number;
  riderBreakdown: {
    riderCode: string;
    riderName: string;
    totalComments: number;
    mostFrequentCategory: CommentCategory;
    categoryBreakdown: Record<CommentCategory, number>;
  }[];
  categoryBreakdown: Record<CommentCategory, number>;
  expectedReturns: { riderCode: string; riderName: string; date: string }[];
}>
```

---

## 🎯 خطة الربط (المرحلة القادمة)

### المرحلة 1: دمج التعليقات في تقرير Strategic Ops

#### 1.1 تحديث `buildReport.ts`
إضافة قسم جديد في التقرير:

```typescript
// lib/strategicOps/buildReport.ts

export type StrategicOpsReport = {
  // ... existing fields
  
  // NEW: Daily Comments Analysis
  commentsAnalysis?: {
    totalComments: number;
    riderBreakdown: RiderCommentBreakdown[];
    categoryStats: Record<CommentCategory, number>;
    expectedReturns: ExpectedReturn[];
    criticalAlerts: {
      frequentAccidents: number;
      frequentAbsences: number;
      medicalLeaves: number;
    };
  };
};
```

#### 1.2 استدعاء دالة التعليقات في buildReport
```typescript
// في buildReport.ts
import { getCommentsSummaryForStrategicOps } from '@/lib/riderComments/service';

// داخل دالة buildReport
const commentsData = await getCommentsSummaryForStrategicOps(
  params.startDate,
  params.endDate,
  params.zone
);

report.commentsAnalysis = {
  totalComments: commentsData.totalComments,
  riderBreakdown: commentsData.riderBreakdown,
  categoryStats: commentsData.categoryBreakdown,
  expectedReturns: commentsData.expectedReturns,
  criticalAlerts: calculateCriticalAlerts(commentsData),
};
```

---

### المرحلة 2: تحليل الأسباب الحقيقية للغياب

#### 2.1 ربط التعليقات مع "Inactive Riders"
في قسم "Inactive 3+ Days":

```typescript
// For each inactive rider
const inactiveRider = {
  code: '123456',
  name: 'أحمد محمد',
  daysInactive: 5,
  lastComment: getLastCommentForRider(riderCode), // من التعليقات
  reason: lastComment?.category || 'unknown',
  expectedReturn: lastComment?.expectedReturnDate,
};
```

**الفائدة**:
- معرفة السبب الحقيقي للغياب (حادث، مرضي، إجازة)
- توقع تاريخ العودة
- عدم احتساب المناديب المصابين/المرضى في حسابات الأداء

#### 2.2 تحسين حساب "Active Riders"
```typescript
// Current logic
const isRiderActive = agg.totalHours > 0 && agg.totalOrders > 0;

// Enhanced logic with comments
const isRiderActive = () => {
  // If rider has orders/hours, they're active
  if (agg.totalHours > 0 && agg.totalOrders > 0) return true;
  
  // Check if rider is on approved leave/medical
  const comment = getLastCommentForRider(riderCode);
  if (comment && ['medical_leave', 'vacation'].includes(comment.category)) {
    return false; // Don't count as absent, they're on approved leave
  }
  
  return false; // Truly absent
};
```

**الفائدة**:
- تمييز بين "غائب" و "في إجازة رسمية"
- عدم معاقبة المشرف على مناديب في إجازة مرضية

---

### المرحلة 3: توصيات مبنية على التعليقات

#### 3.1 قسم "Performance Warnings"
```typescript
// lib/strategicOps/performanceWarnings.ts

export function generateWarningsWithComments(
  riders: Rider[],
  comments: RiderCommentBreakdown[]
): Warning[] {
  const warnings = [];
  
  // Warning 1: Frequent Accidents
  const frequentAccidents = comments.filter(c => 
    c.categoryBreakdown.accident >= 2
  );
  if (frequentAccidents.length > 0) {
    warnings.push({
      severity: 'high',
      title: `${frequentAccidents.length} مناديب حوادث متكررة`,
      description: 'يحتاجون تدريب سلامة فوري',
      ridersAffected: frequentAccidents.map(r => r.riderName),
      action: 'تدريب سلامة + فحص دوري للمعدات',
    });
  }
  
  // Warning 2: Frequent Medical Leaves
  const frequentLeaves = comments.filter(c => 
    c.categoryBreakdown.medical_leave >= 3
  );
  if (frequentLeaves.length > 0) {
    warnings.push({
      severity: 'medium',
      title: `${frequentLeaves.length} مناديب إجازات مرضية متكررة`,
      description: 'قد يشير إلى مشاكل صحية مزمنة',
      ridersAffected: frequentLeaves.map(r => r.riderName),
      action: 'فحص طبي + تأمين صحي',
    });
  }
  
  return warnings;
}
```

#### 3.2 قسم "Recruitment Metrics" المحسّن
```typescript
// When calculating delta and new hires needed
const delta = {
  newHires: 10,
  reactivations: 5,
  terminations: 3,
  // NEW: Expected Returns from medical/accidents
  expectedReturns: commentsData.expectedReturns.length,
  netChange: 10 + 5 - 3 + commentsData.expectedReturns.length,
};
```

**الفائدة**:
- احتساب المناديب المتوقع عودتهم في حسابات التوظيف
- عدم توظيف مناديب إضافيين إذا كان هناك مناديب سيعودون قريباً

---

### المرحلة 4: تقييم المشرفين بناءً على التعليقات

#### 4.1 قسم "Supervisor Evaluation"
```typescript
// lib/strategicOps/supervisorEvaluation.ts

export function evaluateSupervisorsWithComments(
  supervisors: Supervisor[],
  comments: Comment[]
): SupervisorScore[] {
  return supervisors.map(sup => {
    const supComments = comments.filter(c => c.supervisorCode === sup.code);
    
    // Calculate quality score
    const accidents = supComments.filter(c => c.category === 'accident').length;
    const absences = supComments.filter(c => c.category === 'frequent_absences').length;
    const poorPerf = supComments.filter(c => c.category === 'poor_performance').length;
    
    const negativeScore = accidents * 3 + absences * 2 + poorPerf * 2;
    const totalRiders = sup.ridersCount;
    const qualityScore = 100 - (negativeScore / totalRiders) * 100;
    
    return {
      supervisorName: sup.name,
      qualityScore,
      alerts: {
        accidents,
        absences,
        poorPerf,
      },
      recommendation: qualityScore < 70 
        ? 'يحتاج تدريب على إدارة الفريق + متابعة دورية'
        : 'أداء جيد',
    };
  });
}
```

**الفائدة**:
- تقييم المشرف بناءً على حالة مناديبه
- مشرف لديه 10 حوادث → يحتاج تدريب سلامة
- مشرف لديه 5 غيابات متكررة → يحتاج تدريب متابعة

---

## 📊 مثال على التقرير المُحسّن

### قبل الربط:
```
Inactive 3+ Days: 15 مندوب
السبب: غير معروف
```

### بعد الربط:
```
Inactive 3+ Days: 15 مندوب
  - 5 مناديب في إجازة مرضية (سيعودون خلال 3-7 أيام)
  - 3 مناديب حوادث (متوقع العودة: 10-15 يوم)
  - 2 مناديب إجازة رسمية
  - 5 مناديب غياب غير مبرر ⚠️ (يحتاجون متابعة فورية)

التوصية:
  ✅ لا حاجة لتوظيف بدلاء للمناديب في إجازة مرضية/رسمية
  ⚠️ متابعة الـ 5 مناديب الغائبين بدون عذر
  🚨 تدريب سلامة فوري للمشرفين ذوي الحوادث المتكررة
```

---

## 🔧 التنفيذ

### الملفات المطلوب تعديلها:
1. **`lib/strategicOps/buildReport.ts`**
   - إضافة استدعاء `getCommentsSummaryForStrategicOps()`
   - إضافة `commentsAnalysis` في نوع `StrategicOpsReport`

2. **`app/admin/strategic-ops/page.tsx`**
   - عرض قسم جديد "تحليل التعليقات اليومية"
   - عرض "المناديب المتوقع عودتهم"
   - عرض "تحذيرات التكرار"

3. **`lib/strategicOps/inactiveRiders.ts`** (new)
   - دالة `enrichInactiveRidersWithComments()`
   - ربط المناديب الغائبين بتعليقاتهم

4. **`lib/strategicOps/supervisorScoring.ts`** (new)
   - دالة `scoreSupervisorsWithComments()`
   - تقييم المشرفين بناءً على تعليقاتهم

---

## 🎯 الأولويات

### Priority 1 (High - تأثير فوري):
1. ✅ ربط "Inactive Riders" بالتعليقات
2. ✅ تمييز "غياب" vs "إجازة رسمية"
3. ✅ عرض "المتوقع عودتهم قريباً"

### Priority 2 (Medium - تحسين الأداء):
1. تحسين حساب "Active Riders" بالتعليقات
2. توصيات مبنية على التكرار
3. احتساب "Expected Returns" في Delta

### Priority 3 (Low - تحسينات متقدمة):
1. تقييم المشرفين بناءً على التعليقات
2. تحليل الاتجاهات (Trend Analysis)
3. تنبؤات AI

---

## 📈 KPIs المتأثرة

### Before Integration:
- Active Riders: **غير دقيق** (يحتسب المناديب في إجازة مرضية كغائبين)
- No-Show: **غير دقيق** (لا يميز بين غياب وإجازة)
- Recruitment: **غير دقيق** (لا يحتسب العودة المتوقعة)

### After Integration:
- Active Riders: **دقيق** ✅ (يستثني الإجازات الرسمية)
- No-Show: **دقيق** ✅ (يميز الأسباب)
- Recruitment: **مُحسّن** ✅ (يحتسب العودة المتوقعة)
- **NEW KPI**: Comment Quality Score (جودة التعليقات من المشرفين)
- **NEW KPI**: Rider Safety Score (معدل الحوادث)

---

## 🚀 Next Steps

1. ✅ **تم**: إنشاء نظام التعليقات اليومية
2. ✅ **تم**: إضافة تتبع التكرار
3. ✅ **تم**: صفحة الأدمن الشاملة
4. ⏳ **التالي**: ربط التعليقات مع Strategic Ops (هذا المستند)
5. ⏳ **المستقبل**: AI Predictions بناءً على التعليقات

---

## 📚 مستندات ذات صلة

- [RIDER_COMMENTS_SYSTEM.md](./RIDER_COMMENTS_SYSTEM.md) - شرح نظام التعليقات
- [RIDER_COMMENTS_SETUP.md](./RIDER_COMMENTS_SETUP.md) - دليل الإعداد
- [STRATEGIC_OPS_ENHANCEMENTS.md](./STRATEGIC_OPS_ENHANCEMENTS.md) - تحسينات Strategic Ops

---

Last Updated: 2026-07-16
