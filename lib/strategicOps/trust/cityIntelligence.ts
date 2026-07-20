/**
 * SRS-006 §11 — City Intelligence (adapt KPIs/recs/targets by city config).
 */

export type CityConfig = {
  cityKey: string;
  labelAr: string;
  dailyHoursTarget: number;
  expectedAvgHours: number;
  expectedOph: number;
  hiringCostMultiplier: number;
  riskTolerance: 'low' | 'medium' | 'high';
};

const DEFAULT_CITY: CityConfig = {
  cityKey: 'default',
  labelAr: 'افتراضي',
  dailyHoursTarget: 2200,
  expectedAvgHours: 5.5,
  expectedOph: 2.2,
  hiringCostMultiplier: 1,
  riskTolerance: 'medium',
};

/** Extensible city registry — env can override targets later. */
export const CITY_CONFIGS: Record<string, CityConfig> = {
  all: { ...DEFAULT_CITY, cityKey: 'all', labelAr: 'كل المدن' },
  Alexandria: {
    cityKey: 'Alexandria',
    labelAr: 'الإسكندرية',
    dailyHoursTarget: 2200,
    expectedAvgHours: 5.4,
    expectedOph: 2.1,
    hiringCostMultiplier: 1,
    riskTolerance: 'medium',
  },
  Cairo: {
    cityKey: 'Cairo',
    labelAr: 'القاهرة',
    dailyHoursTarget: 3500,
    expectedAvgHours: 5.8,
    expectedOph: 2.4,
    hiringCostMultiplier: 1.15,
    riskTolerance: 'low',
  },
  Giza: {
    cityKey: 'Giza',
    labelAr: 'الجيزة',
    dailyHoursTarget: 1800,
    expectedAvgHours: 5.3,
    expectedOph: 2.0,
    hiringCostMultiplier: 1.05,
    riskTolerance: 'medium',
  },
};

export function resolveCityConfig(zone: string): CityConfig {
  if (!zone || zone === 'all') return CITY_CONFIGS.all;
  return CITY_CONFIGS[zone] ?? {
    ...DEFAULT_CITY,
    cityKey: zone,
    labelAr: zone,
  };
}

export type CityIntelligenceReport = {
  city: CityConfig;
  actualHours: number;
  targetHours: number;
  achievementVsCityTarget: number;
  avgHoursVsExpected: number;
  ophVsExpected: number;
  adaptedRecommendationsAr: string[];
  noteAr: string;
};

export function buildCityIntelligence(input: {
  zone: string;
  actualHours: number;
  targetHours: number;
  avgHours: number;
  ordersPerHour: number;
}): CityIntelligenceReport {
  const city = resolveCityConfig(input.zone);
  const cityTarget = input.zone === 'all' ? input.targetHours : city.dailyHoursTarget;
  const achievementVsCityTarget =
    cityTarget > 0 ? Math.round((input.actualHours / cityTarget) * 10000) / 100 : 0;
  const avgHoursVsExpected =
    city.expectedAvgHours > 0
      ? Math.round((input.avgHours / city.expectedAvgHours) * 10000) / 100
      : 100;
  const ophVsExpected =
    city.expectedOph > 0
      ? Math.round((input.ordersPerHour / city.expectedOph) * 10000) / 100
      : 100;

  const adapted: string[] = [];
  if (achievementVsCityTarget < 85) {
    adapted.push(`هدف مدينة ${city.labelAr} (${cityTarget} س) غير متحقق — ركّز على الإنتاجية قبل التعيين`);
  }
  if (avgHoursVsExpected < 90) {
    adapted.push(`متوسط الساعات دون معيار ${city.labelAr} (${city.expectedAvgHours})`);
  }
  if (city.riskTolerance === 'low' && achievementVsCityTarget < 90) {
    adapted.push('تسامح المخاطر منخفض لهذه المدينة — لا توسّع قبل استقرار الإنجاز');
  }
  if (adapted.length === 0) {
    adapted.push(`الأداء متوافق مع إعدادات ${city.labelAr}`);
  }

  return {
    city,
    actualHours: input.actualHours,
    targetHours: cityTarget,
    achievementVsCityTarget,
    avgHoursVsExpected,
    ophVsExpected,
    adaptedRecommendationsAr: adapted,
    noteAr: 'لا افتراضات مضمّنة لمدينة واحدة — الإعدادات من سجل المدن القابل للتوسعة',
  };
}
