import type { KpiDeepLinks, KpiRegistryEntry } from './types';

/**
 * Canonical KPI registry. Add an entry here once and it becomes clickable +
 * cross-linkable from every tab (dashboard, Integrity, Validation, Explorer,
 * Trust, Certification).
 */
export const KPI_REGISTRY: KpiRegistryEntry[] = [
  {
    id: 'target_achievement',
    labelAr: 'نسبة تحقيق الهدف',
    labelEn: 'Target Achievement',
    category: 'fleet',
    definitionAr: 'نسبة الساعات الفعلية المُسجَّلة إلى الساعات المستهدفة للأسطول خلال الفترة المحددة.',
    businessMeaningAr:
      'أهم مؤشر تنفيذي واحد — يترجم مباشرة إلى عدد الطلبات المنفَّذة والإيراد المُحقَّق. أي انحراف هنا هو السبب الجذري لمعظم المشاكل التشغيلية الأخرى.',
    operationalObjectiveAr: 'الوصول إلى 100% تشغيل فعلي لكل ساعة مستهدفة — أي فرق هو طاقة أسطول مدفوعة وغير مُستغلة.',
    formulaAr: 'Achievement % = (الساعات الفعلية ÷ الساعات المستهدفة) × 100',
    calculationStepsAr: [
      'جمع كل ساعات العمل الفعلية المسجَّلة يوميًا لكل طيار خلال الفترة',
      'حساب الهدف اليومي × عدد أيام الفترة = الهدف الإجمالي',
      'القسمة والتحويل إلى نسبة مئوية',
    ],
    dataSourcesAr: ['ورقة البيانات اليومية (Google Sheets)', 'جدول المستهدفات (cron_config)'],
    sheetUsedAr: 'الشيت اليومي الرئيسي (Daily Performance Sheet)',
    columnsUsedAr: ['التاريخ (Date)', 'كود الطيار (Rider Code)', 'الساعات (Hours)', 'الطلبات (Orders)', 'الهدف اليومي (Daily Target)'],
    businessRulesAr: [
      'الطيار يُحسب فقط إذا كان له ساعات > 0 وطلبات > 0 (SRS-001)',
      'المستهدف يومي ثابت لكل طيار نشط ما لم يُعدَّل من الإعدادات',
    ],
    dependsOn: ['active_riders', 'no_show', 'utilization'],
    affects: ['forecast_accuracy', 'trust_score'],
    usedByAr: ['COO', 'مدير العمليات', 'مدير المنطقة'],
    ownerRoleAr: 'مدير العمليات التنفيذي (COO)',
    decisionExamplesAr: [
      'إذا انخفضت النسبة تحت 85% خلال 7 أيام → تفعيل خطة استرداد فورية مع أضعف 3 مشرفين',
      'إذا استمر الانخفاض 3 أيام متتالية → مراجعة قرار التوظيف الشهري',
    ],
    knownLimitationsAr: [
      'لا يعكس جودة الأداء (طلبات متأخرة/إلغاءات) — فقط الحضور الزمني',
      'يعتمد على دقة رصد ساعات العمل في اليومية — أي تأخير في الرفع يشوّه القراءة اليومية',
    ],
    commonErrorsAr: [
      'حساب المستهدف بعدد أيام خاطئ عند تغيّر نطاق التاريخ المختار',
      'تضمين طيارين Ghost/مكررين ضمن الساعات الفعلية فيرتفع الرقم زيفًا',
    ],
    declineReasonsAr: [
      'ارتفاع عدد الطيارين العاملين أقل من 4 ساعات/يوم (السبب الأكثر تكرارًا)',
      'ارتفاع الغياب (No Show) عند مشرف أو منطقة معيّنة',
      'انخفاض عدد الطيارين النشطين عن نفس فترة المقارنة',
    ],
    improvementMethodsAr: [
      'رفع الطيارين تحت 4 ساعات إلى 6 ساعات عبر تدخل المشرف المباشر (أسرع رافعة)',
      'خفض الغياب اليومي عند المشرفين الأضعف',
      'تفعيل الطيارين غير النشطين قبل أي تعيين جديد',
    ],
    controlTowerKey: 'achievementPercent',
    certificationLevelHint: 'L2 — Mathematical Certification',
    matchTermsAr: ['achievement', 'إنجاز', 'تحقيق الهدف', 'target'],
  },
  {
    id: 'active_riders',
    labelAr: 'الطيارون النشطون',
    labelEn: 'Active Riders',
    category: 'fleet',
    definitionAr: 'عدد الطيارين المسجَّلين الذين حققوا ساعات عمل وطلبات فعلية (> 0) خلال الفترة.',
    businessMeaningAr:
      'الطاقة التشغيلية الحقيقية المتاحة فعليًا. الفرق بين Headcount والنشطين هو "طاقة كامنة" غير مستغلة بدون أي تكلفة توظيف إضافية.',
    operationalObjectiveAr: 'تقليل الفرق بين Headcount والنشطين — كل طيار مسجَّل غير نشط هو تكلفة بلا عائد.',
    formulaAr: 'Active Riders = COUNT(طيار حيث ساعات > 0 AND طلبات > 0، وغير مُستبعد بحالة توقف)',
    calculationStepsAr: [
      'تصفية كل صفوف اليومية حسب الفترة المطلوبة',
      'تجميع الساعات/الطلبات لكل كود طيار',
      'استبعاد الحالات: Terminated / Inactive / Medical Leave / Long Vacation / Suspended',
      'العدّ النهائي = عدد الأكواد المتبقية بشرط ساعات>0 وطلبات>0',
    ],
    dataSourcesAr: ['ورقة البيانات اليومية', 'ورقة قائمة الطيارين (Roster)'],
    sheetUsedAr: 'الشيت اليومي + شيت Roster',
    columnsUsedAr: ['كود الطيار (Rider Code)', 'الساعات (Hours)', 'الطلبات (Orders)', 'حالة التعاقد (Status)'],
    businessRulesAr: ['SRS-001 §8 — تعريف الطيار النشط الموحّد عبر كل النظام'],
    dependsOn: ['headcount', 'no_show'],
    affects: ['target_achievement', 'utilization'],
    usedByAr: ['مدير العمليات', 'المشرف الميداني', 'فريق التوظيف'],
    ownerRoleAr: 'مدير المنطقة / المشرف المباشر',
    decisionExamplesAr: [
      'انخفاض مفاجئ في مشرف واحد فقط → تدخل فردي مع ذلك المشرف أولاً وليس حملة توظيف عامة',
      'انخفاض عام عبر كل المشرفين → مراجعة سياسة الحضور أو موسمية الطلب',
    ],
    knownLimitationsAr: ['لا يميّز بين طيار عمل يوم واحد فقط وطيار عمل الفترة كاملة — فقط "نشط في الفترة"'],
    commonErrorsAr: [
      'عدم استبعاد الطيارين المُنهى تعاقدهم من Roster فيرتفع العدد زيفًا',
      'مطابقة كود طيار غير مُطبَّع (مسافات/حالة حروف) فيُحسب كطيارين مختلفين',
    ],
    declineReasonsAr: [
      'ارتفاع الغياب (No Show) عند مجموعة مشرفين',
      'استقالات/إنهاء تعاقد بدون توظيف بديل بنفس المعدل',
      'طيارون غير نشطين لعدة أيام متتالية دون إعادة تفعيل',
    ],
    improvementMethodsAr: [
      'إعادة تفعيل الطيارين غير النشطين قبل أي توظيف جديد',
      'خفض الغياب المتكرر عند المشرفين الأضعف',
      'تسريع تعيين البدلاء عند الاستقالات المؤكدة',
    ],
    controlTowerKey: 'activeRiders',
    certificationLevelHint: 'L2 — Mathematical Certification',
    matchTermsAr: ['active riders', 'نشط', 'active', 'طيار نشط'],
  },
  {
    id: 'headcount',
    labelAr: 'الطيارون المسجَّلون (Headcount)',
    labelEn: 'Headcount',
    category: 'fleet',
    definitionAr: 'إجمالي عدد الطيارين المسجَّلين في النظام بصرف النظر عن نشاطهم الفعلي.',
    businessMeaningAr: 'يمثّل الاستثمار البشري الكلي المسجَّل — يُستخدم كمقام لحساب نسب الاستغلال والغياب.',
    operationalObjectiveAr: 'الحفاظ على قائمة Roster نظيفة ومحدَّثة لحظيًا لضمان دقة كل النسب المشتقة منها.',
    formulaAr: 'Headcount = COUNT(كل الطيارين في قائمة Roster بحالة غير "Terminated")',
    calculationStepsAr: ['قراءة ورقة Roster كاملة', 'استبعاد المُنهى تعاقدهم', 'العدّ الإجمالي'],
    dataSourcesAr: ['ورقة قائمة الطيارين (Roster)'],
    sheetUsedAr: 'شيت Roster (قائمة الطيارين المعتمدة)',
    columnsUsedAr: ['كود الطيار (Rider Code)', 'حالة التعاقد (Status)', 'تاريخ الانضمام (Join Date)'],
    businessRulesAr: ['يُحدَّث فور تسجيل أو إنهاء تعاقد طيار في الشيت'],
    dependsOn: [],
    affects: ['active_riders', 'utilization'],
    usedByAr: ['الموارد البشرية', 'مدير العمليات'],
    ownerRoleAr: 'الموارد البشرية',
    decisionExamplesAr: ['فجوة كبيرة بين Headcount والنشطين → تفعيل قبل التوظيف الجديد'],
    knownLimitationsAr: ['لا يعكس الجودة أو الأداء — عدّ فقط'],
    commonErrorsAr: ['تأخر تحديث حالة "Terminated" في الشيت فيبقى طيار مُنهى تعاقده ضمن العدّ'],
    declineReasonsAr: ['استقالات/إنهاءات تعاقد فعلية غير مقترنة بتوظيف جديد بنفس المعدل'],
    improvementMethodsAr: ['خطة توظيف شهرية تعادل معدل الاستقالات كحدٍّ أدنى', 'تحديث الشيت فورًا عند أي إنهاء تعاقد'],
    controlTowerKey: 'headcount',
    certificationLevelHint: 'L2 — Mathematical Certification',
    matchTermsAr: ['headcount', 'مسجل'],
  },
  {
    id: 'no_show',
    labelAr: 'الغياب (No Show)',
    labelEn: 'No Show Riders',
    category: 'fleet',
    definitionAr: 'عدد الطيارين المجدولين للعمل في يوم معيّن ولم يسجّلوا أي ساعة عمل.',
    businessMeaningAr: 'مؤشر انضباط مباشر — كل يوم غياب هو ساعات مفقودة 100% بدون بديل تلقائي.',
    operationalObjectiveAr: 'تقليل الغياب اليومي إلى أقل نسبة ممكنة عبر تدخل مباشر وسريع من المشرف.',
    formulaAr: 'No Show = COUNT(طيار مُجدوَل ولم يسجّل ساعات في نفس اليوم)',
    calculationStepsAr: ['مطابقة جدول التشغيل اليومي مع سجل الساعات الفعلية', 'أي طيار مجدوَل بدون تسجيل = غياب'],
    dataSourcesAr: ['ورقة البيانات اليومية', 'جدول التشغيل/الشيفتات'],
    sheetUsedAr: 'الشيت اليومي + جدول التشغيل/الشيفتات',
    columnsUsedAr: ['كود الطيار (Rider Code)', 'التاريخ (Date)', 'الساعات (Hours)', 'حالة الجدولة (Scheduled)'],
    businessRulesAr: ['الغياب يُحسب على مستوى اليوم لا الفترة الكاملة'],
    dependsOn: [],
    affects: ['active_riders', 'target_achievement'],
    usedByAr: ['المشرف المباشر', 'مدير العمليات'],
    ownerRoleAr: 'المشرف المباشر',
    decisionExamplesAr: ['نسبة غياب فريق > 35% → خطة حضور فورية مع ذلك المشرف تحديدًا (SRS-010 Action Engine)'],
    knownLimitationsAr: ['لا يفرّق بين غياب مبرر (إجازة مُعتمدة) وغياب غير مبرر إذا لم تُسجَّل الإجازة في الشيت'],
    commonErrorsAr: ['عدم تسجيل إجازة مُعتمدة في شيت التعليقات فيُحسب اليوم كغياب غير مبرر خطأً'],
    declineReasonsAr: [
      'ضعف تواصل المشرف اليومي مع فريقه (Roll Call)',
      'مشاكل شخصية/صحية متكررة غير مُتابَعة عبر شيت التعليقات',
      'ضعف انضباط عام عند مشرف معيّن مقارنة بباقي الفريق',
    ],
    improvementMethodsAr: ['اتصال يومي إلزامي (Roll Call) قبل بداية الشيفت', 'تسجيل سبب الغياب فورًا في شيت التعليقات لتفادي تصنيفه كغياب غير مبرر'],
    controlTowerKey: 'noShowRiders',
    certificationLevelHint: 'L3 — Operational Certification',
    matchTermsAr: ['no show', 'غياب', 'absence'],
  },
  {
    id: 'utilization',
    labelAr: 'معدل الاستغلال',
    labelEn: 'Utilization Rate',
    category: 'fleet',
    definitionAr: 'نسبة الطيارين النشطين إلى إجمالي الطيارين المسجَّلين (Headcount).',
    businessMeaningAr: 'يقيس كفاءة استخدام القوى البشرية المسجَّلة فعليًا — استغلال منخفض يعني تكلفة توظيف مدفوعة بدون عائد تشغيلي.',
    operationalObjectiveAr: 'رفع نسبة الاستغلال إلى أعلى مستوى ممكن قبل التفكير في أي توظيف إضافي.',
    formulaAr: 'Utilization % = (الطيارون النشطون ÷ Headcount) × 100',
    calculationStepsAr: ['حساب Active Riders', 'حساب Headcount', 'القسمة والتحويل لنسبة'],
    dataSourcesAr: ['مُشتق من Active Riders و Headcount'],
    sheetUsedAr: 'مُشتق (لا شيت مباشر) — من Active Riders و Headcount',
    columnsUsedAr: ['— (مؤشر مُشتق، بدون أعمدة مباشرة)'],
    businessRulesAr: [],
    dependsOn: ['active_riders', 'headcount'],
    affects: ['target_achievement'],
    usedByAr: ['مدير العمليات', 'الإدارة المالية'],
    ownerRoleAr: 'مدير المنطقة',
    decisionExamplesAr: ['استغلال < 50% في فريق مُعيّن → تفعيل الطيارين غير النشطين قبل أي تعيين جديد'],
    knownLimitationsAr: [],
    commonErrorsAr: ['أي خطأ في Active Riders أو Headcount ينعكس مباشرة هنا (مؤشر مُشتق بالكامل)'],
    declineReasonsAr: ['انخفاض Active Riders دون تغيّر Headcount', 'زيادة Headcount (توظيف) بدون تفعيل موازٍ للطيارين الجدد'],
    improvementMethodsAr: ['إعادة تفعيل الطيارين الخاملين قبل أي توظيف جديد', 'مراجعة سبب عدم نشاط أي طيار مسجَّل لأكثر من 7 أيام'],
    controlTowerKey: 'utilizationPercent',
    certificationLevelHint: 'L2 — Mathematical Certification',
    matchTermsAr: ['utilization', 'استغلال'],
  },
  {
    id: 'ghost_riders',
    labelAr: 'المناديب الأشباح (Ghost Riders)',
    labelEn: 'Ghost Riders',
    category: 'quality',
    definitionAr: 'صفوف مكررة أو أكواد طيارين غير مطابقة لقائمة Roster المعتمدة، تُحسب بالخطأ ضمن الساعات/الطلبات.',
    businessMeaningAr: 'كل صف Ghost يُضخّم الساعات والطلبات المُعلَنة — يهدد دقة كل مؤشر تنفيذي مبني على هذه الأرقام.',
    operationalObjectiveAr: 'الوصول إلى صفر Ghost Rows — كل رقم معروض يجب أن يقابله طيار حقيقي في Roster.',
    formulaAr: 'Ghost Rows = صفوف اليومية بكود طيار غير موجود في Roster المعتمد، أو مكرر لنفس اليوم',
    calculationStepsAr: [
      'تطبيع كل أكواد الطيارين (إزالة فراغات/حالة الحروف)',
      'مطابقة كل صف مع Roster المعتمد',
      'وضع علامة على كل صف غير مطابق أو مكرر كـ Ghost',
    ],
    dataSourcesAr: ['ورقة البيانات اليومية', 'ورقة Roster المعتمدة'],
    sheetUsedAr: 'الشيت اليومي + شيت Roster',
    columnsUsedAr: ['كود الطيار (Rider Code)', 'التاريخ (Date)'],
    businessRulesAr: ['أي كود لا يوجد في Roster المعتمد = Ghost — بلا استثناء'],
    dependsOn: [],
    affects: ['active_riders', 'target_achievement', 'forecast_accuracy'],
    usedByAr: ['فريق جودة البيانات', 'مدير العمليات'],
    ownerRoleAr: 'فريق جودة البيانات',
    decisionExamplesAr: ['تسرب Ghost > 5% → تجميد أي قرار توظيف/تسريح حتى تنظيف البيانات'],
    knownLimitationsAr: ['الاعتماد الكامل على دقة واكتمال ورقة Roster كمرجع'],
    commonErrorsAr: ['كود طيار بمسافة زائدة أو حالة أحرف مختلفة (Ø مقابل O) يُصنَّف كـ Ghost خطأً بدل أن يُطبَّع'],
    declineReasonsAr: ['رفع طيار جديد في اليومية قبل تسجيله في Roster', 'رفع صف مكرر لنفس الطيار في نفس اليوم من مصدرين'],
    improvementMethodsAr: ['تسجيل أي طيار جديد في Roster قبل ظهوره في اليومية', 'تشغيل Validation دوري لاكتشاف التكرار فورًا'],
    certificationLevelHint: 'L4 — Data Integrity Certification',
    matchTermsAr: ['ghost', 'شبح', 'duplicate', 'مكرر'],
  },
  {
    id: 'data_quality',
    labelAr: 'جودة البيانات',
    labelEn: 'Data Quality Score',
    category: 'quality',
    definitionAr: 'درجة مركّبة تعكس اكتمال ورفع البيانات اليومية في الموعد وخلوّها من التكرار والأخطاء.',
    businessMeaningAr: 'أي قرار تنفيذي مبني على بيانات ناقصة هو قرار عالي الخطورة — هذا المؤشر يحدد "هل يمكنني الوثوق بالأرقام اليوم؟"',
    operationalObjectiveAr: 'الوصول إلى رفع يومي كامل وفي الموعد 100% من الوقت — بدون ذلك كل مؤشر آخر مشكوك فيه.',
    formulaAr: 'Data Quality = f(نسبة الاكتمال، الالتزام بموعد الرفع، نسبة Ghost/التكرار)',
    calculationStepsAr: ['حساب نسبة الأيام المرفوعة من إجمالي أيام الفترة', 'خصم نقاط لكل تأخير رفع أو Ghost مكتشف'],
    dataSourcesAr: ['سجل رفع الملفات اليومية', 'نتائج فحص Ghost Riders'],
    sheetUsedAr: 'سجل رفع الملفات اليومية (Upload Log) + نتائج فحص Ghost Riders',
    columnsUsedAr: ['تاريخ الرفع (Upload Date)', 'حالة الرفع (Complete/Missing)', 'عدد صفوف Ghost'],
    businessRulesAr: ['أقل من 95% اكتمال → تعطيل بعض المؤشرات الاستراتيجية تلقائيًا (SRS-004)'],
    dependsOn: ['ghost_riders'],
    affects: ['target_achievement', 'trust_score', 'forecast_accuracy'],
    usedByAr: ['فريق جودة البيانات', 'COO'],
    ownerRoleAr: 'فريق جودة البيانات',
    decisionExamplesAr: ['اكتمال < 95% → تصنيف كل قرار مبني على البيانات كـ "منخفض الثقة" تلقائيًا في الواجهة'],
    knownLimitationsAr: [],
    commonErrorsAr: ['رفع ملف بامتداد/تنسيق تاريخ مختلف فيُقرأ كيوم ناقص رغم رفعه فعليًا'],
    declineReasonsAr: ['تأخر رفع الملف اليومي عن الموعد المحدد', 'ارتفاع نسبة Ghost Rows في الرفعة الأخيرة'],
    improvementMethodsAr: ['إكمال رفع الأيام الناقصة فورًا', 'تثبيت تنبيه تلقائي عند تجاوز موعد الرفع', 'تشغيل Validation بعد كل رفعة مباشرة'],
    certificationLevelHint: 'L4 — Data Integrity Certification',
    matchTermsAr: ['data quality', 'جودة البيانات', 'coverage', 'اكتمال'],
  },
  {
    id: 'forecast_accuracy',
    labelAr: 'دقة التنبؤ',
    labelEn: 'Forecast Accuracy',
    category: 'forecast',
    definitionAr: 'مدى قرب توقعات النظام (7/14 يوم) من القيم الفعلية التي حدثت لاحقًا، مُقاسة بـ MAPE.',
    businessMeaningAr: 'يحدد إلى أي مدى يمكن الاعتماد على توقعات النظام في تخطيط التوظيف والمستهدفات القادمة.',
    operationalObjectiveAr: 'تقليل خطأ التنبؤ إلى أقل مستوى عبر تراكم بيانات تاريخية كافية ومستقرة.',
    formulaAr: 'Accuracy % = 100 − MAPE ، حيث MAPE = متوسط |الفعلي − المتوقع| ÷ الفعلي',
    calculationStepsAr: ['حفظ كل توقع تاريخي مع تاريخ إصداره', 'مقارنته بالقيمة الفعلية اللاحقة', 'حساب الخطأ النسبي وتجميعه'],
    dataSourcesAr: ['سجل التوقعات التاريخية', 'البيانات الفعلية اللاحقة'],
    sheetUsedAr: 'سجل التوقعات التاريخية (Forecast Log) + الشيت اليومي الفعلي',
    columnsUsedAr: ['تاريخ التوقع (Forecast Date)', 'القيمة المتوقعة (Predicted)', 'القيمة الفعلية اللاحقة (Actual)'],
    businessRulesAr: ['يتطلب 30 يومًا تاريخية على الأقل لثقة كاملة (SRS-006/SRS-009 L6)'],
    dependsOn: ['data_quality'],
    affects: ['trust_score'],
    usedByAr: ['COO', 'فريق التخطيط'],
    ownerRoleAr: 'فريق التحليلات',
    decisionExamplesAr: ['دقة تنبؤ منخفضة → عدم اعتماد التوقعات في قرارات توظيف كبيرة حتى تحسّن التغطية التاريخية'],
    knownLimitationsAr: ['الدقة تنخفض بشدة مع تغطية تاريخية أقل من 30 يوم'],
    commonErrorsAr: ['مقارنة توقع بفترة فعلية غير مطابقة تمامًا في نطاق التاريخ فيُحسب خطأ زائف'],
    declineReasonsAr: ['تغيّر مفاجئ وغير متوقَّع في نمط الطلب (موسمية/حدث خارجي)', 'تغطية تاريخية أقل من 30 يوم'],
    improvementMethodsAr: ['استكمال 30 يومًا على الأقل من البيانات التاريخية المتصلة', 'إعادة تشغيل التوقع بعد كل تحديث بيانات كبير'],
    certificationLevelHint: 'L6 — Performance & Forecast Certification',
    matchTermsAr: ['forecast', 'تنبؤ', 'mape', 'accuracy'],
  },
  {
    id: 'trust_score',
    labelAr: 'درجة الثقة الإجمالية',
    labelEn: 'Overall Trust Score',
    category: 'trust',
    definitionAr: 'درجة مركّبة (0-100) تلخّص مدى صحة وقابلية الاعتماد على كل الأرقام المعروضة في مركز العمليات.',
    businessMeaningAr: 'هي "خط الدفاع الأخير" — إذا كانت منخفضة، يجب معاملة كل قرار مبني على الداشبورد بحذر إضافي بصرف النظر عن شكل الأرقام.',
    operationalObjectiveAr: 'الوصول إلى 100% ثقة عبر إغلاق كل نقص في جودة البيانات، دقة التنبؤ، والتحقق التشغيلي.',
    formulaAr: 'Trust Score = f(جودة البيانات، دقة التنبؤ، نتائج التحقق التشغيلي، تطابق التدقيق المباشر)',
    calculationStepsAr: ['تجميع نتائج Data Quality + Forecast Accuracy + Ops Validation + Live Audit', 'وزن كل مكوّن وحساب المتوسط المركّب'],
    dataSourcesAr: ['Data Quality Score', 'Forecast Accuracy', 'Ops Validation Center', 'Live Audit'],
    sheetUsedAr: 'مُشتق — لا شيت مباشر (تجميع من 4 مكوّنات فرعية)',
    columnsUsedAr: ['— (مؤشر مُجمَّع، راجع كل مكوّن فرعي على حدة)'],
    businessRulesAr: ['SRS-006 — Trust Center'],
    dependsOn: ['data_quality', 'forecast_accuracy'],
    affects: [],
    usedByAr: ['COO', 'كل مستخدمي الداشبورد'],
    ownerRoleAr: 'فريق جودة البيانات + التحليلات',
    decisionExamplesAr: ['ثقة < 70% → عرض تحذير أعلى كل تقرير قبل اتخاذ أي قرار مالي بناءً عليه'],
    knownLimitationsAr: ['مؤشر مركّب — انخفاضه لا يحدد وحده أي مكوّن هو السبب، يجب فتح التفاصيل'],
    commonErrorsAr: ['قراءة الرقم المركّب فقط دون فتح المكوّنات الفرعية يُخفي السبب الحقيقي للانخفاض'],
    declineReasonsAr: ['انخفاض أحد المكوّنات الأربعة (غالبًا جودة البيانات أو دقة التنبؤ)'],
    improvementMethodsAr: ['فتح مركز الثقة (Trust Center) وإصلاح أضعف مكوّن فرعي أولًا', 'إعادة تشغيل Validation بعد كل إصلاح'],
    certificationLevelHint: 'L4/L6/L9 — مُجمَّع من عدة مستويات',
    matchTermsAr: ['trust', 'ثقة', 'confidence'],
  },
];

const REGISTRY_BY_ID = new Map(KPI_REGISTRY.map((e) => [e.id, e]));
const REGISTRY_BY_CT_KEY = new Map(
  KPI_REGISTRY.filter((e) => e.controlTowerKey).map((e) => [e.controlTowerKey as string, e])
);

export function getKpiDef(id: string | null | undefined): KpiRegistryEntry | null {
  if (!id) return null;
  return REGISTRY_BY_ID.get(id) ?? null;
}

export function getKpiDefByControlTowerKey(key: string | null | undefined): KpiRegistryEntry | null {
  if (!key) return null;
  return REGISTRY_BY_CT_KEY.get(key) ?? null;
}

/** Best-effort resolve of free text (validation row title, KPI id, etc.) to a registry entry. */
export function resolveKpiFromText(text: string | null | undefined): KpiRegistryEntry | null {
  if (!text) return null;
  const norm = text.toLowerCase();
  for (const entry of KPI_REGISTRY) {
    if (entry.matchTermsAr.some((t) => norm.includes(t.toLowerCase()))) return entry;
  }
  return null;
}

export function buildKpiDeepLinks(kpiId: string, opts?: { from?: string }): KpiDeepLinks {
  const from = opts?.from ? `&from=${encodeURIComponent(opts.from)}` : '';
  const q = `?kpi=${encodeURIComponent(kpiId)}${from}`;
  return {
    dashboard: `/admin/strategic-ops${q}`,
    integrity: `/admin/strategic-ops/integrity${q}`,
    validation: `/admin/strategic-ops/validation-center${q}`,
    explorer: `/admin/strategic-ops/kpi-explorer${q}`,
    trust: `/admin/strategic-ops/trust-center${q}`,
    certification: `/admin/strategic-ops/enterprise-certification${q}`,
  };
}

/** Reads `?kpi=` from the current browser URL (client-only, no Suspense boundary needed). */
export function readKpiParamFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('kpi');
  } catch {
    return null;
  }
}
