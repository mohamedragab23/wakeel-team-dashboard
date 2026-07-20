/**
 * Daily Comments Intelligence Integration
 * 
 * Integrates daily comments data with AI analytics for deeper insights.
 * Provides automated analysis of supervisor comments and rider issues.
 * 
 * @module DailyCommentsIntegration
 * @version 1.0
 */

import { google } from 'googleapis';

// ============================================================================
// TYPES
// ============================================================================

export type DailyCommentRecord = {
  date: string; // YYYY-MM-DD
  riderCode: string;
  riderName: string;
  zone: string;
  supervisor: string;
  
  // Comment categories (from rider)
  category: 'مريض' | 'عطل' | 'ظروف' | 'تأخير' | 'أخرى' | 'شغال عادي' | null;
  riderComment: string;
  expectedReturnDate?: string;
  
  // Supervisor feedback
  supervisorComment?: string;
  supervisorAction?: string;
  issueResolved: boolean;
  requiresFollowup: boolean;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
};

export type CommentAnalytics = {
  // Volume metrics
  totalComments: number;
  commentsWithSupervisorFeedback: number;
  supervisorEngagementRate: number; // %
  
  // Category breakdown
  commentsByCategory: Record<string, number>;
  topCategories: { category: string; count: number; percentage: number }[];
  
  // Issue tracking
  totalIssues: number;
  resolvedIssues: number;
  unresolvedIssues: number;
  issuesRequiringFollowup: number;
  resolutionRate: number; // %
  
  // Supervisor performance
  supervisorEngagement: {
    supervisorName: string;
    totalComments: number;
    commentsResponded: number;
    engagementRate: number;
    avgResponseQuality: number; // 1-5
  }[];
  
  // Zone analysis
  commentsByZone: Record<string, number>;
  topIssueZones: { zone: string; issueCount: number }[];
  
  // Trends
  trendThisWeek: 'increasing' | 'stable' | 'decreasing';
  trendPercentChange: number;
  
  // Top issues
  topIssues: {
    issue: string;
    issueAr: string;
    count: number;
    affectedRiders: number;
    avgResolutionTime: number; // days
  }[];
  
  // Insights
  insights: {
    english: string[];
    arabic: string[];
  };
  
  // Summary
  summary: {
    english: string;
    arabic: string;
  };
};

export type SupervisorResponseQuality = {
  supervisorName: string;
  totalResponses: number;
  avgLength: number; // characters
  hasActionableContent: number;
  genericResponseCount: number;
  qualityScore: number; // 1-5
  examples: {
    good: string[];
    needsImprovement: string[];
  };
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const DAILY_COMMENTS_SHEET = 'rider_daily_comments';

// ============================================================================
// DATA ACCESS
// ============================================================================

/**
 * Fetch daily comments from Google Sheets
 */
export async function fetchDailyComments(
  startDate: string,
  endDate: string
): Promise<DailyCommentRecord[]> {
  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${DAILY_COMMENTS_SHEET}!A2:O`; // Adjust based on actual columns
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const rows = response.data.values || [];
    
    const records: DailyCommentRecord[] = rows.map(row => ({
      date: row[0] || '',
      riderCode: row[1] || '',
      riderName: row[2] || '',
      zone: row[3] || '',
      supervisor: row[4] || '',
      category: (row[5] || null) as any,
      riderComment: row[6] || '',
      expectedReturnDate: row[7] || undefined,
      supervisorComment: row[8] || undefined,
      supervisorAction: row[9] || undefined,
      issueResolved: row[10] === 'نعم' || row[10] === 'Yes',
      requiresFollowup: row[11] === 'نعم' || row[11] === 'Yes',
      createdAt: row[12] || '',
      updatedAt: row[13] || '',
    }));
    
    // Filter by date range
    return records.filter(record => {
      const commentDate = new Date(record.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return commentDate >= start && commentDate <= end;
    });
  } catch (error) {
    console.error('Error fetching daily comments:', error);
    return [];
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Calculate comprehensive comment analytics
 */
export async function calculateCommentAnalytics(
  startDate: string,
  endDate: string
): Promise<CommentAnalytics> {
  const comments = await fetchDailyComments(startDate, endDate);
  
  if (comments.length === 0) {
    return getEmptyAnalytics();
  }
  
  // Volume metrics
  const totalComments = comments.length;
  const commentsWithSupervisorFeedback = comments.filter(c => c.supervisorComment).length;
  const supervisorEngagementRate = (commentsWithSupervisorFeedback / totalComments) * 100;
  
  // Category breakdown
  const commentsByCategory: Record<string, number> = {};
  comments.forEach(c => {
    const category = c.category || 'Unknown';
    commentsByCategory[category] = (commentsByCategory[category] || 0) + 1;
  });
  
  const topCategories = Object.entries(commentsByCategory)
    .map(([category, count]) => ({
      category,
      count,
      percentage: (count / totalComments) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Issue tracking
  const issueCategories = ['مريض', 'عطل', 'ظروف', 'تأخير', 'أخرى'];
  const issueComments = comments.filter(c => c.category && issueCategories.includes(c.category));
  const totalIssues = issueComments.length;
  const resolvedIssues = issueComments.filter(c => c.issueResolved).length;
  const unresolvedIssues = totalIssues - resolvedIssues;
  const issuesRequiringFollowup = issueComments.filter(c => c.requiresFollowup).length;
  const resolutionRate = totalIssues > 0 ? (resolvedIssues / totalIssues) * 100 : 0;
  
  // Supervisor performance
  const supervisorEngagement = calculateSupervisorEngagement(comments);
  
  // Zone analysis
  const commentsByZone: Record<string, number> = {};
  comments.forEach(c => {
    commentsByZone[c.zone] = (commentsByZone[c.zone] || 0) + 1;
  });
  
  const zoneIssues: Record<string, number> = {};
  issueComments.forEach(c => {
    zoneIssues[c.zone] = (zoneIssues[c.zone] || 0) + 1;
  });
  
  const topIssueZones = Object.entries(zoneIssues)
    .map(([zone, issueCount]) => ({ zone, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount)
    .slice(0, 5);
  
  // Trends
  const weekAgo = new Date(endDate);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const lastWeekComments = await fetchDailyComments(
    weekAgo.toISOString().split('T')[0],
    endDate
  );
  const twoWeeksAgo = new Date(weekAgo);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 7);
  const previousWeekComments = await fetchDailyComments(
    twoWeeksAgo.toISOString().split('T')[0],
    weekAgo.toISOString().split('T')[0]
  );
  
  const trendPercentChange = previousWeekComments.length > 0
    ? ((lastWeekComments.length - previousWeekComments.length) / previousWeekComments.length) * 100
    : 0;
  
  const trendThisWeek: 'increasing' | 'stable' | 'decreasing' =
    trendPercentChange > 5 ? 'increasing' :
    trendPercentChange < -5 ? 'decreasing' : 'stable';
  
  // Top issues
  const topIssues = identifyTopIssues(issueComments);
  
  // Insights
  const insights = generateInsights({
    totalComments,
    supervisorEngagementRate,
    resolutionRate,
    topCategories,
    topIssues,
    trendThisWeek,
  });
  
  // Summary
  const summary = generateCommentSummary({
    totalComments,
    totalIssues,
    resolutionRate,
    supervisorEngagementRate,
  });
  
  return {
    totalComments,
    commentsWithSupervisorFeedback,
    supervisorEngagementRate,
    commentsByCategory,
    topCategories,
    totalIssues,
    resolvedIssues,
    unresolvedIssues,
    issuesRequiringFollowup,
    resolutionRate,
    supervisorEngagement,
    commentsByZone,
    topIssueZones,
    trendThisWeek,
    trendPercentChange,
    topIssues,
    insights,
    summary,
  };
}

/**
 * Analyze supervisor response quality
 */
export async function analyzeSupervisorResponseQuality(
  startDate: string,
  endDate: string
): Promise<SupervisorResponseQuality[]> {
  const comments = await fetchDailyComments(startDate, endDate);
  
  const supervisorMap: Record<string, DailyCommentRecord[]> = {};
  
  comments.forEach(comment => {
    if (comment.supervisorComment) {
      if (!supervisorMap[comment.supervisor]) {
        supervisorMap[comment.supervisor] = [];
      }
      supervisorMap[comment.supervisor].push(comment);
    }
  });
  
  return Object.entries(supervisorMap).map(([supervisorName, responses]) => {
    const totalResponses = responses.length;
    const avgLength = responses.reduce((sum, r) => sum + (r.supervisorComment?.length || 0), 0) / totalResponses;
    
    // Check for actionable content (contains action verbs or specific steps)
    const actionableKeywords = ['سوف', 'سيتم', 'تم', 'يجب', 'نحتاج', 'will', 'done', 'need', 'follow'];
    const hasActionableContent = responses.filter(r => 
      actionableKeywords.some(keyword => r.supervisorComment?.includes(keyword))
    ).length;
    
    // Check for generic responses
    const genericPhrases = ['تم الملاحظة', 'شكراً', 'ok', 'noted'];
    const genericResponseCount = responses.filter(r =>
      genericPhrases.some(phrase => r.supervisorComment?.toLowerCase().includes(phrase.toLowerCase()))
    ).length;
    
    // Calculate quality score (1-5)
    const lengthScore = Math.min(avgLength / 20, 5); // 20+ chars = max score
    const actionableScore = (hasActionableContent / totalResponses) * 5;
    const genericPenalty = (genericResponseCount / totalResponses) * 2;
    const qualityScore = Math.max(1, Math.min(5, (lengthScore + actionableScore - genericPenalty) / 2));
    
    // Get examples
    const sortedByLength = [...responses].sort((a, b) => 
      (b.supervisorComment?.length || 0) - (a.supervisorComment?.length || 0)
    );
    const good = sortedByLength.slice(0, 2).map(r => r.supervisorComment || '');
    const needsImprovement = sortedByLength.slice(-2).map(r => r.supervisorComment || '');
    
    return {
      supervisorName,
      totalResponses,
      avgLength,
      hasActionableContent,
      genericResponseCount,
      qualityScore,
      examples: { good, needsImprovement },
    };
  }).sort((a, b) => b.qualityScore - a.qualityScore);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateSupervisorEngagement(comments: DailyCommentRecord[]) {
  const supervisorMap: Record<string, { total: number; responded: number }> = {};
  
  comments.forEach(comment => {
    if (!supervisorMap[comment.supervisor]) {
      supervisorMap[comment.supervisor] = { total: 0, responded: 0 };
    }
    supervisorMap[comment.supervisor].total++;
    if (comment.supervisorComment) {
      supervisorMap[comment.supervisor].responded++;
    }
  });
  
  return Object.entries(supervisorMap)
    .map(([supervisorName, data]) => ({
      supervisorName,
      totalComments: data.total,
      commentsResponded: data.responded,
      engagementRate: (data.responded / data.total) * 100,
      avgResponseQuality: 0, // To be calculated separately
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate);
}

function identifyTopIssues(issueComments: DailyCommentRecord[]) {
  const issueMap: Record<string, { count: number; riders: Set<string>; dates: string[] }> = {};
  
  issueComments.forEach(comment => {
    const issue = comment.category || 'Unknown';
    if (!issueMap[issue]) {
      issueMap[issue] = { count: 0, riders: new Set(), dates: [] };
    }
    issueMap[issue].count++;
    issueMap[issue].riders.add(comment.riderCode);
    issueMap[issue].dates.push(comment.date);
  });
  
  const issueTranslations: Record<string, string> = {
    'مريض': 'Sick',
    'عطل': 'Vehicle Issue',
    'ظروف': 'Personal Circumstances',
    'تأخير': 'Late Arrival',
    'أخرى': 'Other',
  };
  
  return Object.entries(issueMap)
    .map(([issue, data]) => {
      // Calculate avg resolution time (simple approximation)
      const avgResolutionTime = 2; // Default 2 days (can be improved with actual data)
      
      return {
        issue: issueTranslations[issue] || issue,
        issueAr: issue,
        count: data.count,
        affectedRiders: data.riders.size,
        avgResolutionTime,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function generateInsights(data: any) {
  const insights = {
    english: [] as string[],
    arabic: [] as string[],
  };
  
  if (data.supervisorEngagementRate < 70) {
    insights.english.push('Supervisor engagement is low (<70%). Consider mandating daily comment reviews.');
    insights.arabic.push('تفاعل المشرفين منخفض (<70%). النظر في إلزام مراجعة التعليقات اليومية.');
  }
  
  if (data.resolutionRate < 60) {
    insights.english.push('Issue resolution rate is low (<60%). Many issues remain unresolved.');
    insights.arabic.push('معدل حل المشاكل منخفض (<60%). العديد من المشاكل لا تزال دون حل.');
  }
  
  if (data.topCategories.length > 0 && data.topCategories[0].percentage > 40) {
    const topCategory = data.topCategories[0].category;
    insights.english.push(`${topCategory} is the dominant issue (${data.topCategories[0].percentage.toFixed(0)}% of comments).`);
    insights.arabic.push(`${topCategory} هي المشكلة السائدة (${data.topCategories[0].percentage.toFixed(0)}% من التعليقات).`);
  }
  
  if (data.trendThisWeek === 'increasing') {
    insights.english.push('Comment volume is increasing. May indicate growing operational issues.');
    insights.arabic.push('حجم التعليقات يتزايد. قد يشير لمشاكل عملياتية متزايدة.');
  }
  
  return insights;
}

function generateCommentSummary(data: any) {
  const { totalComments, totalIssues, resolutionRate, supervisorEngagementRate } = data;
  
  const english = `
${totalComments} comments analyzed. ${totalIssues} issues identified (${resolutionRate.toFixed(0)}% resolved).
Supervisor engagement: ${supervisorEngagementRate.toFixed(0)}%.
  `.trim();
  
  const arabic = `
تحليل ${totalComments} تعليق. ${totalIssues} مشكلة محددة (${resolutionRate.toFixed(0)}% محلولة).
تفاعل المشرفين: ${supervisorEngagementRate.toFixed(0)}%.
  `.trim();
  
  return { english, arabic };
}

function getEmptyAnalytics(): CommentAnalytics {
  return {
    totalComments: 0,
    commentsWithSupervisorFeedback: 0,
    supervisorEngagementRate: 0,
    commentsByCategory: {},
    topCategories: [],
    totalIssues: 0,
    resolvedIssues: 0,
    unresolvedIssues: 0,
    issuesRequiringFollowup: 0,
    resolutionRate: 0,
    supervisorEngagement: [],
    commentsByZone: {},
    topIssueZones: [],
    trendThisWeek: 'stable',
    trendPercentChange: 0,
    topIssues: [],
    insights: { english: [], arabic: [] },
    summary: { english: 'No comments available', arabic: 'لا توجد تعليقات متاحة' },
  };
}

async function getGoogleAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  
  return auth;
}
