/**
 * Operational Playbooks Generator
 * 
 * Generates situation-specific operational playbooks and action guides.
 * Implements SRS-005 Section 17: Operational Playbooks.
 * 
 * Provides step-by-step guides for common operational scenarios.
 * 
 * @module OperationalPlaybooks
 * @version 1.0
 */

// ============================================================================
// TYPES
// ============================================================================

export type PlaybookScenario = 
  | 'critical_hours_shortage'
  | 'low_attendance'
  | 'high_break_time'
  | 'low_productivity'
  | 'inactive_riders'
  | 'supervisor_underperformance'
  | 'seasonal_demand_spike'
  | 'rider_churn_crisis'
  | 'zone_underperformance'
  | 'quality_issues';

export type PlaybookAction = {
  step: number;
  action: string;
  actionAr: string;
  owner: string;
  ownerAr: string;
  deadline: string;
  resources?: string;
  resourcesAr?: string;
  expectedOutcome: string;
  expectedOutcomeAr: string;
};

export type Playbook = {
  scenario: PlaybookScenario;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  
  // Trigger conditions
  triggers: {
    condition: string;
    conditionAr: string;
  }[];
  
  // Severity
  severity: 'critical' | 'high' | 'medium';
  
  // Actions (step-by-step)
  actions: PlaybookAction[];
  
  // Timeline
  totalTimeline: string;
  
  // Success metrics
  successMetrics: {
    metric: string;
    metricAr: string;
    target: string;
  }[];
  
  // Risks and mitigation
  risks: {
    risk: string;
    riskAr: string;
    mitigation: string;
    mitigationAr: string;
  }[];
};

// ============================================================================
// PLAYBOOK LIBRARY
// ============================================================================

/**
 * Get playbook for a specific scenario
 */
export function getPlaybook(scenario: PlaybookScenario): Playbook {
  const playbooks: Record<PlaybookScenario, Playbook> = {
    
    // ========================================================================
    // CRITICAL HOURS SHORTAGE PLAYBOOK
    // ========================================================================
    critical_hours_shortage: {
      scenario: 'critical_hours_shortage',
      title: 'Critical Hours Shortage Response',
      titleAr: 'خطة الاستجابة لنقص الساعات الحرج',
      description: 'Emergency response plan when hours achievement falls below 70%',
      descriptionAr: 'خطة الاستجابة الطارئة عندما يقل تحقيق الساعات عن 70%',
      
      triggers: [
        { condition: 'Hours achievement < 70%', conditionAr: 'تحقيق الساعات < 70%' },
        { condition: 'Gap to target > 500 hours', conditionAr: 'الفجوة للهدف > 500 ساعة' },
      ],
      
      severity: 'critical',
      
      actions: [
        {
          step: 1,
          action: 'Immediate situation assessment - Calculate exact hours gap',
          actionAr: 'تقييم فوري للوضع - حساب الفجوة الدقيقة للساعات',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 hour',
          expectedOutcome: 'Clear understanding of deficit and required actions',
          expectedOutcomeAr: 'فهم واضح للعجز والإجراءات المطلوبة',
        },
        {
          step: 2,
          action: 'Activate all available inactive riders',
          actionAr: 'تفعيل جميع المناديب غير النشطين المتاحين',
          owner: 'All Supervisors',
          ownerAr: 'جميع المشرفين',
          deadline: 'Today',
          resources: 'Phone calls, WhatsApp messages',
          resourcesAr: 'مكالمات هاتفية، رسائل واتساب',
          expectedOutcome: '20-30% of inactive riders reactivated',
          expectedOutcomeAr: 'إعادة تفعيل 20-30% من المناديب غير النشطين',
        },
        {
          step: 3,
          action: 'Request overtime from top performers (offer incentive)',
          actionAr: 'طلب ساعات إضافية من المناديب الأفضل (مع حافز)',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Today',
          resources: 'Overtime bonus: 1.5x per hour',
          resourcesAr: 'حافز ساعات إضافية: 1.5× للساعة',
          expectedOutcome: '50-100 additional hours this week',
          expectedOutcomeAr: '50-100 ساعة إضافية هذا الأسبوع',
        },
        {
          step: 4,
          action: 'Emergency hiring - Fast-track recruitment',
          actionAr: 'توظيف طارئ - تسريع عملية التوظيف',
          owner: 'HR',
          ownerAr: 'الموارد البشرية',
          deadline: 'Within 3 days',
          resources: '10-15 new riders',
          resourcesAr: '10-15 مندوب جديد',
          expectedOutcome: '10+ riders hired within 1 week',
          expectedOutcomeAr: 'توظيف 10+ مندوب خلال أسبوع',
        },
        {
          step: 5,
          action: 'Optimize zone assignments - Move riders to high-demand zones',
          actionAr: 'تحسين توزيع المناطق - نقل المناديب للمناطق عالية الطلب',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 2 days',
          expectedOutcome: '5-10% efficiency gain',
          expectedOutcomeAr: 'تحسين كفاءة 5-10%',
        },
        {
          step: 6,
          action: 'Daily progress tracking and escalation',
          actionAr: 'متابعة يومية للتقدم والتصعيد',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Daily until resolved',
          expectedOutcome: 'Return to >85% achievement within 2 weeks',
          expectedOutcomeAr: 'العودة لـ >85% تحقيق خلال أسبوعين',
        },
      ],
      
      totalTimeline: '2-3 weeks to resolve',
      
      successMetrics: [
        { metric: 'Hours achievement back to >85%', metricAr: 'تحقيق الساعات >85%', target: 'Within 2 weeks' },
        { metric: '10+ new riders hired', metricAr: 'توظيف 10+ مندوب', target: 'Within 1 week' },
        { metric: '20+ inactive riders reactivated', metricAr: 'إعادة تفعيل 20+ مندوب', target: 'Within 1 week' },
      ],
      
      risks: [
        {
          risk: 'New riders take 2-3 weeks to reach full productivity',
          riskAr: 'المناديب الجدد يحتاجون 2-3 أسابيع للوصول للإنتاجية الكاملة',
          mitigation: 'Pair with experienced riders for training',
          mitigationAr: 'إقرانهم بمناديب ذوي خبرة للتدريب',
        },
        {
          risk: 'Market demand may not support additional capacity',
          riskAr: 'الطلب في السوق قد لا يدعم الطاقة الإضافية',
          mitigation: 'Monitor orders per hour closely',
          mitigationAr: 'مراقبة الأوردرات/ساعة بشكل وثيق',
        },
      ],
    },
    
    // ========================================================================
    // LOW ATTENDANCE PLAYBOOK
    // ========================================================================
    low_attendance: {
      scenario: 'low_attendance',
      title: 'Low Attendance Recovery Plan',
      titleAr: 'خطة استرجاع الحضور المنخفض',
      description: 'Action plan to improve attendance when it falls below 85%',
      descriptionAr: 'خطة عمل لتحسين الحضور عندما يقل عن 85%',
      
      triggers: [
        { condition: 'Attendance rate < 85%', conditionAr: 'معدل الحضور < 85%' },
        { condition: 'Attendance declining for 3+ consecutive days', conditionAr: 'الحضور يتراجع لـ 3+ أيام متتالية' },
      ],
      
      severity: 'high',
      
      actions: [
        {
          step: 1,
          action: 'Root cause analysis - Identify why riders are absent',
          actionAr: 'تحليل السبب الجذري - تحديد لماذا المناديب غائبون',
          owner: 'Operations Manager + Supervisors',
          ownerAr: 'مدير العمليات + المشرفين',
          deadline: 'Within 1 day',
          expectedOutcome: 'List of top 3 absence reasons',
          expectedOutcomeAr: 'قائمة بأهم 3 أسباب للغياب',
        },
        {
          step: 2,
          action: 'Contact all absent riders - Understand barriers',
          actionAr: 'التواصل مع جميع المناديب الغائبين - فهم العوائق',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Within 2 days',
          resources: 'Phone calls, personal visits',
          resourcesAr: 'مكالمات هاتفية، زيارات شخصية',
          expectedOutcome: 'Individual action plan for each rider',
          expectedOutcomeAr: 'خطة عمل فردية لكل مندوب',
        },
        {
          step: 3,
          action: 'Launch attendance incentive program',
          actionAr: 'إطلاق برنامج حوافز الحضور',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 3 days',
          resources: 'Budget: 500 SAR/week for top attendance',
          resourcesAr: 'ميزانية: 500 ريال/أسبوع لأفضل حضور',
          expectedOutcome: '10-15% attendance improvement',
          expectedOutcomeAr: 'تحسين الحضور بـ 10-15%',
        },
        {
          step: 4,
          action: 'Implement daily attendance tracking dashboard',
          actionAr: 'تطبيق لوحة متابعة يومية للحضور',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 week',
          expectedOutcome: 'Real-time visibility into attendance',
          expectedOutcomeAr: 'رؤية مباشرة للحضور',
        },
        {
          step: 5,
          action: 'Supervisor accountability - Link supervisor KPIs to team attendance',
          actionAr: 'محاسبة المشرفين - ربط KPIs المشرفين بحضور الفريق',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Immediate',
          expectedOutcome: 'Supervisors actively manage attendance',
          expectedOutcomeAr: 'المشرفون يديرون الحضور بفعالية',
        },
      ],
      
      totalTimeline: '2-3 weeks',
      
      successMetrics: [
        { metric: 'Attendance rate >85%', metricAr: 'معدل الحضور >85%', target: 'Within 2 weeks' },
        { metric: 'Reduce chronic absenteeism by 50%', metricAr: 'تقليل التغيب المزمن بـ 50%', target: 'Within 3 weeks' },
      ],
      
      risks: [
        {
          risk: 'External factors (weather, transportation strikes)',
          riskAr: 'عوامل خارجية (طقس، إضرابات مواصلات)',
          mitigation: 'Provide transportation support if needed',
          mitigationAr: 'توفير دعم المواصلات إذا لزم الأمر',
        },
      ],
    },
    
    // ========================================================================
    // LOW PRODUCTIVITY PLAYBOOK
    // ========================================================================
    low_productivity: {
      scenario: 'low_productivity',
      title: 'Productivity Enhancement Plan',
      titleAr: 'خطة تحسين الإنتاجية',
      description: 'Boost orders per hour when below target (<2.3)',
      descriptionAr: 'زيادة الأوردرات/ساعة عند انخفاضها (<2.3)',
      
      triggers: [
        { condition: 'Orders per hour < 2.3', conditionAr: 'أوردر/ساعة < 2.3' },
        { condition: 'Productivity declining trend', conditionAr: 'اتجاه تراجع في الإنتاجية' },
      ],
      
      severity: 'high',
      
      actions: [
        {
          step: 1,
          action: 'Identify bottom 20% performers',
          actionAr: 'تحديد أقل 20% أداءً',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 day',
          expectedOutcome: 'List of riders needing support',
          expectedOutcomeAr: 'قائمة المناديب المحتاجين للدعم',
        },
        {
          step: 2,
          action: 'Conduct productivity training workshops',
          actionAr: 'إجراء ورش تدريبية على الإنتاجية',
          owner: 'Supervisors + Top Performers',
          ownerAr: 'المشرفين + المناديب الأفضل',
          deadline: 'Within 1 week',
          resources: '2-hour workshop, share best practices',
          resourcesAr: 'ورشة ساعتين، مشاركة أفضل الممارسات',
          expectedOutcome: 'Riders learn from top performers',
          expectedOutcomeAr: 'المناديب يتعلمون من الأفضل',
        },
        {
          step: 3,
          action: 'Optimize zone assignments and routing',
          actionAr: 'تحسين توزيع المناطق والمسارات',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 3 days',
          expectedOutcome: '5-10% efficiency gain',
          expectedOutcomeAr: 'تحسين كفاءة 5-10%',
        },
        {
          step: 4,
          action: 'Reduce break time (enforce <8% policy)',
          actionAr: 'تقليل وقت الاستراحة (تطبيق سياسة <8%)',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Immediate',
          expectedOutcome: '2-3% productivity increase',
          expectedOutcomeAr: 'زيادة إنتاجية 2-3%',
        },
        {
          step: 5,
          action: 'Weekly productivity leaderboard and rewards',
          actionAr: 'لوحة صدارة أسبوعية للإنتاجية ومكافآت',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Starting next week',
          resources: 'Top 3 riders get bonus',
          resourcesAr: 'أفضل 3 مناديب يحصلون على حافز',
          expectedOutcome: 'Gamification drives performance',
          expectedOutcomeAr: 'التحفيز يدفع الأداء',
        },
      ],
      
      totalTimeline: '2-4 weeks',
      
      successMetrics: [
        { metric: 'Orders per hour >2.3', metricAr: 'أوردر/ساعة >2.3', target: 'Within 3 weeks' },
        { metric: 'Bottom 20% improved by 15%', metricAr: 'أقل 20% تحسنوا بـ 15%', target: 'Within 4 weeks' },
      ],
      
      risks: [
        {
          risk: 'Market demand fluctuation affects orders',
          riskAr: 'تقلب الطلب في السوق يؤثر على الأوردرات',
          mitigation: 'Focus on efficiency metrics within rider control',
          mitigationAr: 'التركيز على مقاييس الكفاءة في سيطرة المندوب',
        },
      ],
    },
    
    // ========================================================================
    // INACTIVE RIDERS PLAYBOOK
    // ========================================================================
    inactive_riders: {
      scenario: 'inactive_riders',
      title: 'Rider Reactivation Campaign',
      titleAr: 'حملة إعادة تفعيل المناديب',
      description: 'Reactivate inactive riders and reduce churn',
      descriptionAr: 'إعادة تفعيل المناديب غير النشطين وتقليل التسرب',
      
      triggers: [
        { condition: 'Inactive riders >30%', conditionAr: 'مناديب غير نشطين >30%' },
        { condition: '50+ riders with 0 hours in past week', conditionAr: '50+ مندوب بـ 0 ساعة في الأسبوع الماضي' },
      ],
      
      severity: 'medium',
      
      actions: [
        {
          step: 1,
          action: 'Segment inactive riders by inactivity duration',
          actionAr: 'تقسيم المناديب غير النشطين حسب مدة عدم النشاط',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 day',
          expectedOutcome: '3 segments: <1 week, 1-4 weeks, >1 month',
          expectedOutcomeAr: '3 شرائح: <أسبوع، 1-4 أسابيع، >شهر',
        },
        {
          step: 2,
          action: 'Conduct exit interviews with long-term inactive riders',
          actionAr: 'إجراء مقابلات مغادرة مع المناديب غير النشطين لفترة طويلة',
          owner: 'HR + Supervisors',
          ownerAr: 'الموارد البشرية + المشرفين',
          deadline: 'Within 1 week',
          resources: 'Interview 20-30 riders',
          resourcesAr: 'مقابلة 20-30 مندوب',
          expectedOutcome: 'Understand root causes of churn',
          expectedOutcomeAr: 'فهم الأسباب الجذرية للتسرب',
        },
        {
          step: 3,
          action: 'Launch "Come Back" incentive program',
          actionAr: 'إطلاق برنامج حوافز "عودة"',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 3 days',
          resources: 'Bonus for returning riders: 200 SAR',
          resourcesAr: 'حافز للمناديب العائدين: 200 ريال',
          expectedOutcome: '30-40% reactivation rate',
          expectedOutcomeAr: 'معدل إعادة تفعيل 30-40%',
        },
        {
          step: 4,
          action: 'Personal outreach by supervisors',
          actionAr: 'تواصل شخصي من المشرفين',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Within 1 week',
          resources: 'Phone calls, WhatsApp, home visits',
          resourcesAr: 'مكالمات هاتفية، واتساب، زيارات منزلية',
          expectedOutcome: 'Personal connection encourages return',
          expectedOutcomeAr: 'الاتصال الشخصي يشجع العودة',
        },
        {
          step: 5,
          action: 'Clean up permanent exits from system',
          actionAr: 'تنظيف المغادرين الدائمين من النظام',
          owner: 'HR',
          ownerAr: 'الموارد البشرية',
          deadline: 'After 4 weeks',
          expectedOutcome: 'Accurate active rider count',
          expectedOutcomeAr: 'عدد دقيق للمناديب النشطين',
        },
      ],
      
      totalTimeline: '4-6 weeks',
      
      successMetrics: [
        { metric: '30+ riders reactivated', metricAr: 'إعادة تفعيل 30+ مندوب', target: 'Within 4 weeks' },
        { metric: 'Active rider % >75%', metricAr: 'نسبة المناديب النشطين >75%', target: 'Within 6 weeks' },
      ],
      
      risks: [
        {
          risk: 'Some riders have moved to competitors',
          riskAr: 'بعض المناديب انتقلوا للمنافسين',
          mitigation: 'Competitive compensation package',
          mitigationAr: 'حزمة تعويضات تنافسية',
        },
      ],
    },
    
    // ========================================================================
    // ZONE UNDERPERFORMANCE PLAYBOOK
    // ========================================================================
    zone_underperformance: {
      scenario: 'zone_underperformance',
      title: 'Zone Performance Recovery',
      titleAr: 'استرجاع أداء المنطقة',
      description: 'Turnaround plan for underperforming zones',
      descriptionAr: 'خطة تحول للمناطق ضعيفة الأداء',
      
      triggers: [
        { condition: 'Zone hours achievement <80%', conditionAr: 'تحقيق ساعات المنطقة <80%' },
        { condition: 'Zone significantly below benchmark', conditionAr: 'المنطقة أقل بكثير من المعيار' },
      ],
      
      severity: 'high',
      
      actions: [
        {
          step: 1,
          action: 'Benchmark against top-performing zones',
          actionAr: 'مقارنة معيارية مع المناطق الأفضل',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 day',
          expectedOutcome: 'Identify performance gaps',
          expectedOutcomeAr: 'تحديد فجوات الأداء',
        },
        {
          step: 2,
          action: 'Supervisor assessment - Evaluate zone supervisor',
          actionAr: 'تقييم المشرف - تقييم مشرف المنطقة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 2 days',
          expectedOutcome: 'Determine if supervisor change needed',
          expectedOutcomeAr: 'تحديد ما إذا كان تغيير المشرف مطلوباً',
        },
        {
          step: 3,
          action: 'Transfer 2-3 top performers to zone temporarily',
          actionAr: 'نقل 2-3 من المناديب الأفضل للمنطقة مؤقتاً',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 3 days',
          resources: 'Top performers from other zones',
          resourcesAr: 'المناديب الأفضل من مناطق أخرى',
          expectedOutcome: 'Boost morale and share best practices',
          expectedOutcomeAr: 'رفع المعنويات ومشاركة أفضل الممارسات',
        },
        {
          step: 4,
          action: 'Daily check-ins and support',
          actionAr: 'مراجعة يومية ودعم',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Daily for 2 weeks',
          expectedOutcome: 'Identify and resolve blockers quickly',
          expectedOutcomeAr: 'تحديد وحل العوائق بسرعة',
        },
        {
          step: 5,
          action: 'Celebrate quick wins',
          actionAr: 'الاحتفال بالإنجازات السريعة',
          owner: 'Supervisor',
          ownerAr: 'المشرف',
          deadline: 'Weekly',
          expectedOutcome: 'Build momentum and confidence',
          expectedOutcomeAr: 'بناء الزخم والثقة',
        },
      ],
      
      totalTimeline: '3-4 weeks',
      
      successMetrics: [
        { metric: 'Zone hours achievement >85%', metricAr: 'تحقيق ساعات المنطقة >85%', target: 'Within 4 weeks' },
        { metric: 'Close 50% of performance gap', metricAr: 'إغلاق 50% من فجوة الأداء', target: 'Within 3 weeks' },
      ],
      
      risks: [
        {
          risk: 'Root cause may be external (market demand in zone)',
          riskAr: 'السبب الجذري قد يكون خارجي (طلب السوق في المنطقة)',
          mitigation: 'Consider zone restructuring if demand is low',
          mitigationAr: 'النظر في إعادة هيكلة المنطقة إذا كان الطلب منخفضاً',
        },
      ],
    },
    
    // ========================================================================
    // SUPERVISOR UNDERPERFORMANCE PLAYBOOK
    // ========================================================================
    supervisor_underperformance: {
      scenario: 'supervisor_underperformance',
      title: 'Supervisor Performance Improvement',
      titleAr: 'تحسين أداء المشرف',
      description: 'Support plan for underperforming supervisors',
      descriptionAr: 'خطة دعم للمشرفين ضعيفي الأداء',
      
      triggers: [
        { condition: 'Supervisor score <60/100', conditionAr: 'درجة المشرف <60/100' },
        { condition: 'Team performance consistently below average', conditionAr: 'أداء الفريق أقل من المتوسط باستمرار' },
      ],
      
      severity: 'high',
      
      actions: [
        {
          step: 1,
          action: 'One-on-one performance review',
          actionAr: 'مراجعة أداء فردية',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 day',
          expectedOutcome: 'Identify specific improvement areas',
          expectedOutcomeAr: 'تحديد مجالات التحسين المحددة',
        },
        {
          step: 2,
          action: 'Pair with top-performing supervisor (mentorship)',
          actionAr: 'إقران بمشرف متميز (إرشاد)',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 2 days',
          resources: '2 weeks shadowing',
          resourcesAr: 'أسبوعان مراقبة',
          expectedOutcome: 'Learn best practices from top performer',
          expectedOutcomeAr: 'تعلم أفضل الممارسات من المتميز',
        },
        {
          step: 3,
          action: 'Provide leadership and management training',
          actionAr: 'توفير تدريب القيادة والإدارة',
          owner: 'HR',
          ownerAr: 'الموارد البشرية',
          deadline: 'Within 1 week',
          resources: '4-hour workshop',
          resourcesAr: 'ورشة 4 ساعات',
          expectedOutcome: 'Develop leadership skills',
          expectedOutcomeAr: 'تطوير مهارات القيادة',
        },
        {
          step: 4,
          action: 'Set 30-day improvement plan with clear targets',
          actionAr: 'وضع خطة تحسين 30 يوماً بأهداف واضحة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 3 days',
          expectedOutcome: 'Clear roadmap for improvement',
          expectedOutcomeAr: 'خارطة طريق واضحة للتحسين',
        },
        {
          step: 5,
          action: 'Weekly progress check-ins',
          actionAr: 'مراجعات تقدم أسبوعية',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Weekly for 4 weeks',
          expectedOutcome: 'Continuous feedback and support',
          expectedOutcomeAr: 'ملاحظات ودعم مستمر',
        },
        {
          step: 6,
          action: 'Final evaluation - Decide on continuation or replacement',
          actionAr: 'تقييم نهائي - القرار بالاستمرار أو الاستبدال',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'After 30 days',
          expectedOutcome: 'Clear decision on next steps',
          expectedOutcomeAr: 'قرار واضح للخطوات التالية',
        },
      ],
      
      totalTimeline: '4-6 weeks',
      
      successMetrics: [
        { metric: 'Supervisor score >70/100', metricAr: 'درجة المشرف >70/100', target: 'Within 30 days' },
        { metric: 'Team performance improved by 10%', metricAr: 'تحسن أداء الفريق بـ 10%', target: 'Within 6 weeks' },
      ],
      
      risks: [
        {
          risk: 'Supervisor may not be coachable',
          riskAr: 'المشرف قد لا يكون قابلاً للتوجيه',
          mitigation: 'Have replacement plan ready',
          mitigationAr: 'جهز خطة استبدال',
        },
      ],
    },
    
    // ========================================================================
    // HIGH BREAK TIME PLAYBOOK
    // ========================================================================
    high_break_time: {
      scenario: 'high_break_time',
      title: 'Break Time Management',
      titleAr: 'إدارة وقت الاستراحة',
      description: 'Reduce excessive break time to <8%',
      descriptionAr: 'تقليل وقت الاستراحة المفرط لـ <8%',
      
      triggers: [
        { condition: 'Break time >10%', conditionAr: 'وقت الاستراحة >10%' },
      ],
      
      severity: 'medium',
      
      actions: [
        {
          step: 1,
          action: 'Communicate break time policy clearly',
          actionAr: 'التواصل بسياسة وقت الاستراحة بوضوح',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Within 1 day',
          expectedOutcome: 'All riders understand policy',
          expectedOutcomeAr: 'جميع المناديب يفهمون السياسة',
        },
        {
          step: 2,
          action: 'Implement break time tracking',
          actionAr: 'تطبيق تتبع وقت الاستراحة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Immediate',
          expectedOutcome: 'Real-time visibility',
          expectedOutcomeAr: 'رؤية فورية',
        },
        {
          step: 3,
          action: 'Coach riders exceeding 10% break time',
          actionAr: 'توجيه المناديب الذين يتجاوزون 10% استراحة',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Within 1 week',
          expectedOutcome: 'Behavior change',
          expectedOutcomeAr: 'تغيير السلوك',
        },
        {
          step: 4,
          action: 'Implement consequences for policy violations',
          actionAr: 'تطبيق عواقب لمخالفة السياسة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'After 2 weeks',
          resources: 'Warnings, then penalties',
          resourcesAr: 'تحذيرات، ثم عقوبات',
          expectedOutcome: 'Compliance with policy',
          expectedOutcomeAr: 'الامتثال للسياسة',
        },
      ],
      
      totalTimeline: '2-3 weeks',
      
      successMetrics: [
        { metric: 'Break time <8%', metricAr: 'وقت الاستراحة <8%', target: 'Within 3 weeks' },
      ],
      
      risks: [
        {
          risk: 'Rider pushback',
          riskAr: 'مقاومة من المناديب',
          mitigation: 'Explain impact on earnings and performance',
          mitigationAr: 'شرح التأثير على الأرباح والأداء',
        },
      ],
    },
    
    // ========================================================================
    // SEASONAL DEMAND SPIKE PLAYBOOK
    // ========================================================================
    seasonal_demand_spike: {
      scenario: 'seasonal_demand_spike',
      title: 'Seasonal Demand Preparation',
      titleAr: 'الاستعداد للطلب الموسمي',
      description: 'Prepare for expected demand spike (Ramadan, Holidays)',
      descriptionAr: 'الاستعداد للزيادة المتوقعة في الطلب (رمضان، الأعياد)',
      
      triggers: [
        { condition: 'Upcoming seasonal event (Ramadan, Eid, etc.)', conditionAr: 'مناسبة موسمية قادمة (رمضان، عيد، إلخ)' },
      ],
      
      severity: 'high',
      
      actions: [
        {
          step: 1,
          action: 'Forecast demand increase (use historical data)',
          actionAr: 'التنبؤ بزيادة الطلب (استخدم البيانات التاريخية)',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: '4 weeks before event',
          expectedOutcome: 'Target hours and riders needed',
          expectedOutcomeAr: 'الساعات والمناديب المطلوبة',
        },
        {
          step: 2,
          action: 'Hire seasonal riders',
          actionAr: 'توظيف مناديب موسميين',
          owner: 'HR',
          ownerAr: 'الموارد البشرية',
          deadline: '3 weeks before event',
          resources: '15-20 temporary riders',
          resourcesAr: '15-20 مندوب مؤقت',
          expectedOutcome: 'Additional capacity ready',
          expectedOutcomeAr: 'طاقة إضافية جاهزة',
        },
        {
          step: 3,
          action: 'Reactivate all inactive riders',
          actionAr: 'إعادة تفعيل جميع المناديب غير النشطين',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: '2 weeks before event',
          expectedOutcome: '20-30 riders reactivated',
          expectedOutcomeAr: 'إعادة تفعيل 20-30 مندوب',
        },
        {
          step: 4,
          action: 'Optimize zone coverage and shifts',
          actionAr: 'تحسين تغطية المناطق والورديات',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: '1 week before event',
          expectedOutcome: 'Efficient deployment plan',
          expectedOutcomeAr: 'خطة انتشار فعالة',
        },
        {
          step: 5,
          action: 'Daily monitoring and adjustment during peak',
          actionAr: 'مراقبة يومية وتعديل خلال الذروة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'During event',
          expectedOutcome: 'Responsive to demand changes',
          expectedOutcomeAr: 'استجابة لتغيرات الطلب',
        },
      ],
      
      totalTimeline: '4-6 weeks preparation',
      
      successMetrics: [
        { metric: 'Meet 100% of seasonal demand', metricAr: 'تلبية 100% من الطلب الموسمي', target: 'During event' },
        { metric: 'No stockouts or capacity shortages', metricAr: 'لا نفاد أو نقص في الطاقة', target: 'During event' },
      ],
      
      risks: [
        {
          risk: 'Underestimate demand spike',
          riskAr: 'التقليل من تقدير زيادة الطلب',
          mitigation: 'Add 15-20% buffer to forecast',
          mitigationAr: 'إضافة مخزن احتياطي 15-20% للتوقعات',
        },
      ],
    },
    
    // ========================================================================
    // RIDER CHURN CRISIS PLAYBOOK
    // ========================================================================
    rider_churn_crisis: {
      scenario: 'rider_churn_crisis',
      title: 'Rider Churn Crisis Response',
      titleAr: 'الاستجابة لأزمة تسرب المناديب',
      description: 'Address sudden spike in rider turnover',
      descriptionAr: 'معالجة الزيادة المفاجئة في تسرب المناديب',
      
      triggers: [
        { condition: '10+ riders quit in one week', conditionAr: '10+ مندوب يستقيلون في أسبوع' },
        { condition: 'Churn rate >5% per week', conditionAr: 'معدل التسرب >5% أسبوعياً' },
      ],
      
      severity: 'critical',
      
      actions: [
        {
          step: 1,
          action: 'Emergency exit interviews - Understand why riders are leaving',
          actionAr: 'مقابلات مغادرة طارئة - فهم لماذا المناديب يغادرون',
          owner: 'HR + Operations Manager',
          ownerAr: 'الموارد البشرية + مدير العمليات',
          deadline: 'Within 2 days',
          resources: 'Interview all recent exits',
          resourcesAr: 'مقابلة جميع المغادرين الأخيرين',
          expectedOutcome: 'Identify root cause(s)',
          expectedOutcomeAr: 'تحديد السبب/الأسباب الجذرية',
        },
        {
          step: 2,
          action: 'Address root cause immediately',
          actionAr: 'معالجة السبب الجذري فوراً',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 3 days',
          resources: 'May require budget or policy changes',
          resourcesAr: 'قد يتطلب ميزانية أو تغييرات سياسة',
          expectedOutcome: 'Stop the bleeding',
          expectedOutcomeAr: 'إيقاف النزيف',
        },
        {
          step: 3,
          action: 'All-hands meeting - Address concerns transparently',
          actionAr: 'اجتماع شامل - معالجة المخاوف بشفافية',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 5 days',
          expectedOutcome: 'Rebuild trust and morale',
          expectedOutcomeAr: 'إعادة بناء الثقة والمعنويات',
        },
        {
          step: 4,
          action: 'Retention bonus for remaining riders',
          actionAr: 'حافز بقاء للمناديب المتبقين',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 week',
          resources: 'Loyalty bonus program',
          resourcesAr: 'برنامج حافز ولاء',
          expectedOutcome: 'Incentivize staying',
          expectedOutcomeAr: 'تحفيز البقاء',
        },
        {
          step: 5,
          action: 'Aggressive hiring campaign',
          actionAr: 'حملة توظيف قوية',
          owner: 'HR',
          ownerAr: 'الموارد البشرية',
          deadline: 'Immediate',
          resources: 'Replace all exits + add buffer',
          resourcesAr: 'استبدال جميع المغادرين + إضافة احتياطي',
          expectedOutcome: 'Restore headcount',
          expectedOutcomeAr: 'استرجاع العدد',
        },
      ],
      
      totalTimeline: '2-4 weeks',
      
      successMetrics: [
        { metric: 'Churn rate <2% per week', metricAr: 'معدل التسرب <2% أسبوعياً', target: 'Within 2 weeks' },
        { metric: 'Replace all exits', metricAr: 'استبدال جميع المغادرين', target: 'Within 4 weeks' },
      ],
      
      risks: [
        {
          risk: 'Competitor poaching',
          riskAr: 'قنص من المنافسين',
          mitigation: 'Competitive compensation and benefits',
          mitigationAr: 'تعويضات ومزايا تنافسية',
        },
      ],
    },
    
    // ========================================================================
    // QUALITY ISSUES PLAYBOOK
    // ========================================================================
    quality_issues: {
      scenario: 'quality_issues',
      title: 'Quality Issues Resolution',
      titleAr: 'حل مشاكل الجودة',
      description: 'Address customer complaints and quality concerns',
      descriptionAr: 'معالجة شكاوى العملاء ومخاوف الجودة',
      
      triggers: [
        { condition: 'Spike in customer complaints', conditionAr: 'زيادة في شكاوى العملاء' },
        { condition: 'Quality metrics declining', conditionAr: 'مقاييس الجودة تتراجع' },
      ],
      
      severity: 'high',
      
      actions: [
        {
          step: 1,
          action: 'Analyze complaint patterns',
          actionAr: 'تحليل أنماط الشكاوى',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 day',
          expectedOutcome: 'Identify top 3 issue categories',
          expectedOutcomeAr: 'تحديد أهم 3 فئات مشاكل',
        },
        {
          step: 2,
          action: 'Identify riders responsible for quality issues',
          actionAr: 'تحديد المناديب المسؤولين عن مشاكل الجودة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 2 days',
          expectedOutcome: 'List of riders needing training',
          expectedOutcomeAr: 'قائمة المناديب المحتاجين للتدريب',
        },
        {
          step: 3,
          action: 'Mandatory quality training workshop',
          actionAr: 'ورشة تدريب جودة إلزامية',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 week',
          resources: '3-hour workshop on customer service',
          resourcesAr: 'ورشة 3 ساعات عن خدمة العملاء',
          expectedOutcome: 'Improved rider awareness',
          expectedOutcomeAr: 'تحسين وعي المندوب',
        },
        {
          step: 4,
          action: 'Implement quality spot checks',
          actionAr: 'تطبيق فحوصات جودة عشوائية',
          owner: 'Supervisors',
          ownerAr: 'المشرفين',
          deadline: 'Immediate',
          expectedOutcome: 'Real-time quality monitoring',
          expectedOutcomeAr: 'مراقبة الجودة الفورية',
        },
        {
          step: 5,
          action: 'Consequences for repeated quality violations',
          actionAr: 'عواقب لمخالفات الجودة المتكررة',
          owner: 'Operations Manager',
          ownerAr: 'مدير العمليات',
          deadline: 'After 2 weeks',
          resources: 'Warnings, suspensions',
          resourcesAr: 'تحذيرات، إيقاف',
          expectedOutcome: 'Quality compliance',
          expectedOutcomeAr: 'الامتثال للجودة',
        },
      ],
      
      totalTimeline: '3-4 weeks',
      
      successMetrics: [
        { metric: 'Customer complaints reduced by 50%', metricAr: 'تقليل شكاوى العملاء بـ 50%', target: 'Within 4 weeks' },
        { metric: 'Zero quality violations for 1 week', metricAr: 'صفر مخالفات جودة لمدة أسبوع', target: 'Within 3 weeks' },
      ],
      
      risks: [
        {
          risk: 'Quality issues may be systemic (e.g., vehicle issues)',
          riskAr: 'مشاكل الجودة قد تكون نظامية (مثل مشاكل المركبات)',
          mitigation: 'Address root causes (training, equipment, etc.)',
          mitigationAr: 'معالجة الأسباب الجذرية (تدريب، معدات، إلخ)',
        },
      ],
    },
  };
  
  return playbooks[scenario];
}

/**
 * Get all available playbooks
 */
export function getAllPlaybooks(): Playbook[] {
  const scenarios: PlaybookScenario[] = [
    'critical_hours_shortage',
    'low_attendance',
    'high_break_time',
    'low_productivity',
    'inactive_riders',
    'supervisor_underperformance',
    'seasonal_demand_spike',
    'rider_churn_crisis',
    'zone_underperformance',
    'quality_issues',
  ];
  
  return scenarios.map(scenario => getPlaybook(scenario));
}

/**
 * Recommend playbook(s) based on current KPIs
 */
export function recommendPlaybooks(kpis: any): PlaybookScenario[] {
  const recommendations: PlaybookScenario[] = [];
  
  // Check each trigger condition
  if (kpis.hours?.hoursAchievement?.value?.current < 70) {
    recommendations.push('critical_hours_shortage');
  }
  
  if (kpis.attendance?.attendancePercent?.value?.current < 85) {
    recommendations.push('low_attendance');
  }
  
  if (kpis.break?.breakPercent?.value?.current > 10) {
    recommendations.push('high_break_time');
  }
  
  if (kpis.orders?.ordersPerHour?.value?.current < 2.3) {
    recommendations.push('low_productivity');
  }
  
  const totalRiders = kpis.headcount?.totalRiders?.value?.current || 1;
  const workingRiders = kpis.headcount?.workingRiders?.value?.current || 0;
  const inactivePercent = ((totalRiders - workingRiders) / totalRiders) * 100;
  
  if (inactivePercent > 30) {
    recommendations.push('inactive_riders');
  }
  
  return recommendations;
}
