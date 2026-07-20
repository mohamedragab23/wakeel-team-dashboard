/**
 * Hiring & Termination Integration
 * 
 * Integrates with Google Sheets for hiring and termination data.
 * Provides recruitment metrics and termination analytics.
 * 
 * @module HiringTerminationIntegration
 * @version 1.0
 */

import { google } from 'googleapis';

// ============================================================================
// TYPES
// ============================================================================

export type HiringRecord = {
  riderCode: string;
  riderName: string;
  hireDate: string; // YYYY-MM-DD
  zone: string;
  supervisor: string;
  position: 'full_time' | 'part_time' | 'temporary';
  recruitmentSource: string;
  onboardingCompleted: boolean;
  onboardingDate?: string;
  status: 'active' | 'probation' | 'terminated';
  notes?: string;
};

export type TerminationRecord = {
  riderCode: string;
  riderName: string;
  terminationDate: string; // YYYY-MM-DD
  zone: string;
  supervisor: string;
  reason: 'voluntary' | 'involuntary' | 'performance' | 'attendance' | 'other';
  reasonDetails: string;
  tenure: number; // days
  exitInterviewCompleted: boolean;
  rehireEligible: boolean;
  notes?: string;
};

export type ReactivationRecord = {
  riderCode: string;
  riderName: string;
  reactivationDate: string; // YYYY-MM-DD
  previousTerminationDate: string;
  zone: string;
  supervisor: string;
  daysSinceTermination: number;
  reactivationReason: string;
  notes?: string;
};

export type RecruitmentMetrics = {
  // Hiring metrics
  hiringThisWeek: number;
  hiringThisMonth: number;
  hiringThisQuarter: number;
  hiringByZone: Record<string, number>;
  hiringBySupervisor: Record<string, number>;
  hiringBySource: Record<string, number>;
  
  // Termination metrics
  terminationThisWeek: number;
  terminationThisMonth: number;
  terminationThisQuarter: number;
  terminationByZone: Record<string, number>;
  terminationBySupervisor: Record<string, number>;
  terminationByReason: Record<string, number>;
  
  // Net change
  netChangeWeek: number;
  netChangeMonth: number;
  netChangeQuarter: number;
  
  // Reactivation metrics
  reactivationThisWeek: number;
  reactivationThisMonth: number;
  reactivationThisQuarter: number;
  
  // Turnover metrics
  turnoverRateWeek: number; // %
  turnoverRateMonth: number; // %
  turnoverRateQuarter: number; // %
  
  // Onboarding metrics
  avgOnboardingTime: number; // days
  onboardingCompletionRate: number; // %
  
  // Tenure metrics
  avgTenure: number; // days
  avgTenureByReason: Record<string, number>;
  
  // Summary
  summary: {
    english: string;
    arabic: string;
  };
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const HIRING_SHEET_NAME = 'التوظيف'; // Hiring sheet
const TERMINATION_SHEET_NAME = 'الإنهاء'; // Termination sheet
const REACTIVATION_SHEET_NAME = 'إعادة التفعيل'; // Reactivation sheet

// ============================================================================
// DATA ACCESS
// ============================================================================

/**
 * Fetch hiring records from Google Sheets
 */
export async function fetchHiringRecords(
  startDate?: string,
  endDate?: string
): Promise<HiringRecord[]> {
  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${HIRING_SHEET_NAME}!A2:K`; // Adjust based on actual columns
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const rows = response.data.values || [];
    
    const records: HiringRecord[] = rows.map(row => ({
      riderCode: row[0] || '',
      riderName: row[1] || '',
      hireDate: row[2] || '',
      zone: row[3] || '',
      supervisor: row[4] || '',
      position: (row[5] || 'full_time') as any,
      recruitmentSource: row[6] || '',
      onboardingCompleted: row[7] === 'نعم' || row[7] === 'Yes',
      onboardingDate: row[8] || undefined,
      status: (row[9] || 'active') as any,
      notes: row[10] || undefined,
    }));
    
    // Filter by date range if provided
    if (startDate || endDate) {
      return records.filter(record => {
        const hireDate = new Date(record.hireDate);
        const start = startDate ? new Date(startDate) : new Date('2000-01-01');
        const end = endDate ? new Date(endDate) : new Date('2100-12-31');
        return hireDate >= start && hireDate <= end;
      });
    }
    
    return records;
  } catch (error) {
    console.error('Error fetching hiring records:', error);
    return [];
  }
}

/**
 * Fetch termination records from Google Sheets
 */
export async function fetchTerminationRecords(
  startDate?: string,
  endDate?: string
): Promise<TerminationRecord[]> {
  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${TERMINATION_SHEET_NAME}!A2:L`;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const rows = response.data.values || [];
    
    const records: TerminationRecord[] = rows.map(row => ({
      riderCode: row[0] || '',
      riderName: row[1] || '',
      terminationDate: row[2] || '',
      zone: row[3] || '',
      supervisor: row[4] || '',
      reason: (row[5] || 'other') as any,
      reasonDetails: row[6] || '',
      tenure: parseInt(row[7]) || 0,
      exitInterviewCompleted: row[8] === 'نعم' || row[8] === 'Yes',
      rehireEligible: row[9] === 'نعم' || row[9] === 'Yes',
      notes: row[10] || undefined,
    }));
    
    // Filter by date range if provided
    if (startDate || endDate) {
      return records.filter(record => {
        const termDate = new Date(record.terminationDate);
        const start = startDate ? new Date(startDate) : new Date('2000-01-01');
        const end = endDate ? new Date(endDate) : new Date('2100-12-31');
        return termDate >= start && termDate <= end;
      });
    }
    
    return records;
  } catch (error) {
    console.error('Error fetching termination records:', error);
    return [];
  }
}

/**
 * Fetch reactivation records from Google Sheets
 */
export async function fetchReactivationRecords(
  startDate?: string,
  endDate?: string
): Promise<ReactivationRecord[]> {
  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${REACTIVATION_SHEET_NAME}!A2:I`;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const rows = response.data.values || [];
    
    const records: ReactivationRecord[] = rows.map(row => ({
      riderCode: row[0] || '',
      riderName: row[1] || '',
      reactivationDate: row[2] || '',
      previousTerminationDate: row[3] || '',
      zone: row[4] || '',
      supervisor: row[5] || '',
      daysSinceTermination: parseInt(row[6]) || 0,
      reactivationReason: row[7] || '',
      notes: row[8] || undefined,
    }));
    
    // Filter by date range if provided
    if (startDate || endDate) {
      return records.filter(record => {
        const reactDate = new Date(record.reactivationDate);
        const start = startDate ? new Date(startDate) : new Date('2000-01-01');
        const end = endDate ? new Date(endDate) : new Date('2100-12-31');
        return reactDate >= start && reactDate <= end;
      });
    }
    
    return records;
  } catch (error) {
    console.error('Error fetching reactivation records:', error);
    return [];
  }
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

/**
 * Calculate recruitment metrics
 */
export async function calculateRecruitmentMetrics(
  startDate: string,
  endDate: string,
  totalRiders: number
): Promise<RecruitmentMetrics> {
  const now = new Date(endDate);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const quarterAgo = new Date(now);
  quarterAgo.setMonth(quarterAgo.getMonth() - 3);
  
  // Fetch all records
  const [hiringRecords, terminationRecords, reactivationRecords] = await Promise.all([
    fetchHiringRecords(startDate, endDate),
    fetchTerminationRecords(startDate, endDate),
    fetchReactivationRecords(startDate, endDate),
  ]);
  
  // Helper: filter by time period
  const filterByPeriod = (records: any[], dateField: string, since: Date) => {
    return records.filter(r => new Date(r[dateField]) >= since);
  };
  
  // Hiring metrics
  const hiringThisWeek = filterByPeriod(hiringRecords, 'hireDate', weekAgo).length;
  const hiringThisMonth = filterByPeriod(hiringRecords, 'hireDate', monthAgo).length;
  const hiringThisQuarter = filterByPeriod(hiringRecords, 'hireDate', quarterAgo).length;
  
  const hiringByZone = groupByField(hiringRecords, 'zone');
  const hiringBySupervisor = groupByField(hiringRecords, 'supervisor');
  const hiringBySource = groupByField(hiringRecords, 'recruitmentSource');
  
  // Termination metrics
  const terminationThisWeek = filterByPeriod(terminationRecords, 'terminationDate', weekAgo).length;
  const terminationThisMonth = filterByPeriod(terminationRecords, 'terminationDate', monthAgo).length;
  const terminationThisQuarter = filterByPeriod(terminationRecords, 'terminationDate', quarterAgo).length;
  
  const terminationByZone = groupByField(terminationRecords, 'zone');
  const terminationBySupervisor = groupByField(terminationRecords, 'supervisor');
  const terminationByReason = groupByField(terminationRecords, 'reason');
  
  // Net change
  const netChangeWeek = hiringThisWeek - terminationThisWeek;
  const netChangeMonth = hiringThisMonth - terminationThisMonth;
  const netChangeQuarter = hiringThisQuarter - terminationThisQuarter;
  
  // Reactivation metrics
  const reactivationThisWeek = filterByPeriod(reactivationRecords, 'reactivationDate', weekAgo).length;
  const reactivationThisMonth = filterByPeriod(reactivationRecords, 'reactivationDate', monthAgo).length;
  const reactivationThisQuarter = filterByPeriod(reactivationRecords, 'reactivationDate', quarterAgo).length;
  
  // Turnover rate (terminations / total riders * 100)
  const turnoverRateWeek = totalRiders > 0 ? (terminationThisWeek / totalRiders) * 100 : 0;
  const turnoverRateMonth = totalRiders > 0 ? (terminationThisMonth / totalRiders) * 100 : 0;
  const turnoverRateQuarter = totalRiders > 0 ? (terminationThisQuarter / totalRiders) * 100 : 0;
  
  // Onboarding metrics
  const completedOnboarding = hiringRecords.filter(r => r.onboardingCompleted && r.onboardingDate);
  const avgOnboardingTime = completedOnboarding.length > 0
    ? completedOnboarding.reduce((sum, r) => {
        const hire = new Date(r.hireDate);
        const onboard = new Date(r.onboardingDate!);
        const days = Math.floor((onboard.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0) / completedOnboarding.length
    : 0;
  
  const onboardingCompletionRate = hiringRecords.length > 0
    ? (completedOnboarding.length / hiringRecords.length) * 100
    : 0;
  
  // Tenure metrics
  const avgTenure = terminationRecords.length > 0
    ? terminationRecords.reduce((sum, r) => sum + r.tenure, 0) / terminationRecords.length
    : 0;
  
  const avgTenureByReason: Record<string, number> = {};
  Object.keys(terminationByReason).forEach(reason => {
    const reasonRecords = terminationRecords.filter(r => r.reason === reason);
    avgTenureByReason[reason] = reasonRecords.length > 0
      ? reasonRecords.reduce((sum, r) => sum + r.tenure, 0) / reasonRecords.length
      : 0;
  });
  
  // Generate summary
  const summary = generateRecruitmentSummary({
    hiringThisMonth,
    terminationThisMonth,
    netChangeMonth,
    turnoverRateMonth,
    reactivationThisMonth,
  });
  
  return {
    hiringThisWeek,
    hiringThisMonth,
    hiringThisQuarter,
    hiringByZone,
    hiringBySupervisor,
    hiringBySource,
    
    terminationThisWeek,
    terminationThisMonth,
    terminationThisQuarter,
    terminationByZone,
    terminationBySupervisor,
    terminationByReason,
    
    netChangeWeek,
    netChangeMonth,
    netChangeQuarter,
    
    reactivationThisWeek,
    reactivationThisMonth,
    reactivationThisQuarter,
    
    turnoverRateWeek,
    turnoverRateMonth,
    turnoverRateQuarter,
    
    avgOnboardingTime,
    onboardingCompletionRate,
    
    avgTenure,
    avgTenureByReason,
    
    summary,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function groupByField(records: any[], field: string): Record<string, number> {
  return records.reduce((acc, record) => {
    const key = record[field] || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function generateRecruitmentSummary(data: {
  hiringThisMonth: number;
  terminationThisMonth: number;
  netChangeMonth: number;
  turnoverRateMonth: number;
  reactivationThisMonth: number;
}) {
  const { hiringThisMonth, terminationThisMonth, netChangeMonth, turnoverRateMonth, reactivationThisMonth } = data;
  
  const english = `
This month: ${hiringThisMonth} hired, ${terminationThisMonth} terminated, ${reactivationThisMonth} reactivated.
Net change: ${netChangeMonth > 0 ? '+' : ''}${netChangeMonth} riders.
Turnover rate: ${turnoverRateMonth.toFixed(1)}%.
  `.trim();
  
  const arabic = `
هذا الشهر: ${hiringThisMonth} موظف، ${terminationThisMonth} منهي، ${reactivationThisMonth} معاد تفعيله.
التغيير الصافي: ${netChangeMonth > 0 ? '+' : ''}${netChangeMonth} مندوب.
معدل التسرب: ${turnoverRateMonth.toFixed(1)}%.
  `.trim();
  
  return { english, arabic };
}

async function getGoogleAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  
  return auth;
}
