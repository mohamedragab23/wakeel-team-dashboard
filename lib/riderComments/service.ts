import { getSheetData, appendToSheet } from '@/lib/googleSheets';
import type { RiderDailyComment, CommentCategory } from './types';

const SHEET_NAME = 'rider_daily_comments';

/**
 * Ensure sheet exists with proper headers
 */
async function ensureSheetExists(): Promise<void> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    
    // If sheet exists but has no headers, add them
    if (sheet.length === 0) {
      const headers = [
        'id',
        'riderCode',
        'riderName',
        'supervisorCode',
        'supervisorName',
        'date',
        'category',
        'expectedReturnDate',
        'estimatedReturnDays',
        'notes',
        'createdAt',
        'updatedAt',
      ];
      await appendToSheet(SHEET_NAME, [headers]);
      console.log('[ensureSheetExists] Headers added to sheet');
    }
  } catch (error) {
    console.warn('[ensureSheetExists] Sheet may not exist yet - will be created on first write');
  }
}

/**
 * Get all daily comments for a rider within a date range
 */
export async function getRiderComments(
  riderCode: string,
  startDate?: string,
  endDate?: string
): Promise<RiderDailyComment[]> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    if (sheet.length < 2) return [];

    const comments: RiderDailyComment[] = [];
    
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row || row.length < 10) continue;

      const comment: RiderDailyComment = {
        id: String(row[0] || ''),
        riderCode: String(row[1] || ''),
        riderName: String(row[2] || ''),
        supervisorCode: String(row[3] || ''),
        supervisorName: String(row[4] || ''),
        date: String(row[5] || ''),
        category: (row[6] as CommentCategory) || 'other',
        expectedReturnDate: row[7] ? String(row[7]) : undefined,
        estimatedReturnDays: row[8] ? Number(row[8]) : undefined,
        notes: String(row[9] || ''),
        createdAt: String(row[10] || ''),
        updatedAt: String(row[11] || ''),
      };

      // Filter by rider code
      if (comment.riderCode !== riderCode) continue;

      // Filter by date range if provided
      if (startDate && comment.date < startDate) continue;
      if (endDate && comment.date > endDate) continue;

      comments.push(comment);
    }

    return comments.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[getRiderComments] Error:', error);
    return [];
  }
}

/**
 * Get all comments for a specific date
 */
export async function getCommentsForDate(date: string): Promise<RiderDailyComment[]> {
  try {
    const sheet = await getSheetData(SHEET_NAME, true);
    if (sheet.length < 2) return [];

    const comments: RiderDailyComment[] = [];
    
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row || row.length < 10) continue;

      const comment: RiderDailyComment = {
        id: String(row[0] || ''),
        riderCode: String(row[1] || ''),
        riderName: String(row[2] || ''),
        supervisorCode: String(row[3] || ''),
        supervisorName: String(row[4] || ''),
        date: String(row[5] || ''),
        category: (row[6] as CommentCategory) || 'other',
        expectedReturnDate: row[7] ? String(row[7]) : undefined,
        estimatedReturnDays: row[8] ? Number(row[8]) : undefined,
        notes: String(row[9] || ''),
        createdAt: String(row[10] || ''),
        updatedAt: String(row[11] || ''),
      };

      if (comment.date === date) {
        comments.push(comment);
      }
    }

    return comments;
  } catch (error) {
    console.error('[getCommentsForDate] Error:', error);
    return [];
  }
}

/**
 * Get comments for a supervisor's riders within a date range
 */
export async function getSupervisorComments(
  supervisorCode: string,
  startDate?: string,
  endDate?: string
): Promise<RiderDailyComment[]> {
  try {
    await ensureSheetExists();
    
    const sheet = await getSheetData(SHEET_NAME, true);
    if (sheet.length < 2) return [];

    const comments: RiderDailyComment[] = [];
    
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row || row.length < 10) continue;

      const comment: RiderDailyComment = {
        id: String(row[0] || ''),
        riderCode: String(row[1] || ''),
        riderName: String(row[2] || ''),
        supervisorCode: String(row[3] || ''),
        supervisorName: String(row[4] || ''),
        date: String(row[5] || ''),
        category: (row[6] as CommentCategory) || 'other',
        expectedReturnDate: row[7] ? String(row[7]) : undefined,
        estimatedReturnDays: row[8] ? Number(row[8]) : undefined,
        notes: String(row[9] || ''),
        createdAt: String(row[10] || ''),
        updatedAt: String(row[11] || ''),
      };

      // Filter by supervisor
      if (comment.supervisorCode !== supervisorCode) continue;

      // Filter by date range if provided
      if (startDate && comment.date < startDate) continue;
      if (endDate && comment.date > endDate) continue;

      comments.push(comment);
    }

    return comments.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[getSupervisorComments] Error:', error);
    return [];
  }
}

/**
 * Add a new daily comment
 */
export async function addRiderComment(
  comment: Omit<RiderDailyComment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureSheetExists();
    
    const now = new Date().toISOString();
    const id = `CMT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newRow = [
      id,
      comment.riderCode,
      comment.riderName,
      comment.supervisorCode,
      comment.supervisorName,
      comment.date,
      comment.category,
      comment.expectedReturnDate || '',
      comment.estimatedReturnDays || '',
      comment.notes,
      now, // createdAt
      now, // updatedAt
    ];

    await appendToSheet(SHEET_NAME, [newRow]);

    return { success: true };
  } catch (error) {
    console.error('[addRiderComment] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get absence reasons summary for a period
 */
export async function getAbsenceReasonsSummary(
  startDate: string,
  endDate: string,
  supervisorCode?: string
): Promise<Record<CommentCategory, number>> {
  try {
    const allComments = supervisorCode
      ? await getSupervisorComments(supervisorCode, startDate, endDate)
      : await getCommentsForDateRange(startDate, endDate);

    const summary: Record<string, number> = {};

    for (const comment of allComments) {
      summary[comment.category] = (summary[comment.category] || 0) + 1;
    }

    return summary as Record<CommentCategory, number>;
  } catch (error) {
    console.error('[getAbsenceReasonsSummary] Error:', error);
    return {} as Record<CommentCategory, number>;
  }
}

/**
 * Get all comments for a date range (Admin only)
 */
export async function getAllComments(
  startDate?: string,
  endDate?: string
): Promise<RiderDailyComment[]> {
  try {
    await ensureSheetExists();
    
    const sheet = await getSheetData(SHEET_NAME, false);
    if (sheet.length < 2) return [];

    const comments: RiderDailyComment[] = [];
    
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row || row.length < 10) continue;

      const comment: RiderDailyComment = {
        id: String(row[0] || ''),
        riderCode: String(row[1] || ''),
        riderName: String(row[2] || ''),
        supervisorCode: String(row[3] || ''),
        supervisorName: String(row[4] || ''),
        date: String(row[5] || ''),
        category: (row[6] as CommentCategory) || 'other',
        expectedReturnDate: row[7] ? String(row[7]) : undefined,
        estimatedReturnDays: row[8] ? Number(row[8]) : undefined,
        notes: String(row[9] || ''),
        createdAt: String(row[10] || ''),
        updatedAt: String(row[11] || ''),
      };

      // Filter by date range if provided
      if (startDate && comment.date < startDate) continue;
      if (endDate && comment.date > endDate) continue;

      comments.push(comment);
    }

    return comments.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[getAllComments] Error:', error);
    return [];
  }
}

/**
 * Get all comments for a date range
 */
async function getCommentsForDateRange(
  startDate: string,
  endDate: string
): Promise<RiderDailyComment[]> {
  try {
    const sheet = await getSheetData(SHEET_NAME, false);
    if (sheet.length < 2) return [];

    const comments: RiderDailyComment[] = [];
    
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row || row.length < 10) continue;

      const comment: RiderDailyComment = {
        id: String(row[0] || ''),
        riderCode: String(row[1] || ''),
        riderName: String(row[2] || ''),
        supervisorCode: String(row[3] || ''),
        supervisorName: String(row[4] || ''),
        date: String(row[5] || ''),
        category: (row[6] as CommentCategory) || 'other',
        expectedReturnDate: row[7] ? String(row[7]) : undefined,
        estimatedReturnDays: row[8] ? Number(row[8]) : undefined,
        notes: String(row[9] || ''),
        createdAt: String(row[10] || ''),
        updatedAt: String(row[11] || ''),
      };

      if (comment.date >= startDate && comment.date <= endDate) {
        comments.push(comment);
      }
    }

    return comments;
  } catch (error) {
    console.error('[getCommentsForDateRange] Error:', error);
    return [];
  }
}

/**
 * Get riders expected to return within N days
 */
export async function getRidersExpectedToReturn(
  withinDays: number
): Promise<RiderDailyComment[]> {
  try {
    const sheet = await getSheetData(SHEET_NAME, false);
    if (sheet.length < 2) return [];

    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + withinDays);

    const returning: RiderDailyComment[] = [];
    
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row || row.length < 10) continue;

      const comment: RiderDailyComment = {
        id: String(row[0] || ''),
        riderCode: String(row[1] || ''),
        riderName: String(row[2] || ''),
        supervisorCode: String(row[3] || ''),
        supervisorName: String(row[4] || ''),
        date: String(row[5] || ''),
        category: (row[6] as CommentCategory) || 'other',
        expectedReturnDate: row[7] ? String(row[7]) : undefined,
        estimatedReturnDays: row[8] ? Number(row[8]) : undefined,
        notes: String(row[9] || ''),
        createdAt: String(row[10] || ''),
        updatedAt: String(row[11] || ''),
      };

      // Only for accident or medical leave with expected return date
      if (comment.expectedReturnDate && 
          (comment.category === 'accident' || comment.category === 'medical_leave')) {
        const returnDate = new Date(comment.expectedReturnDate);
        if (returnDate >= today && returnDate <= targetDate) {
          returning.push(comment);
        }
      }
    }

    return returning.sort((a, b) => 
      (a.expectedReturnDate || '').localeCompare(b.expectedReturnDate || '')
    );
  } catch (error) {
    console.error('[getRidersExpectedToReturn] Error:', error);
    return [];
  }
}

/**
 * Get comments summary for Strategic Ops integration
 * Returns aggregated comment data for a date range
 */
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
}> {
  try {
    const comments = await getAllComments(startDate, endDate);
    
    // Calculate totals
    const categoryBreakdown: Record<CommentCategory, number> = {} as Record<CommentCategory, number>;
    const riderMap = new Map<string, {
      riderCode: string;
      riderName: string;
      totalComments: number;
      categoryBreakdown: Record<CommentCategory, number>;
    }>();

    for (const comment of comments) {
      // Category totals
      categoryBreakdown[comment.category] = (categoryBreakdown[comment.category] || 0) + 1;

      // Rider totals
      if (!riderMap.has(comment.riderCode)) {
        riderMap.set(comment.riderCode, {
          riderCode: comment.riderCode,
          riderName: comment.riderName,
          totalComments: 0,
          categoryBreakdown: {} as Record<CommentCategory, number>,
        });
      }

      const riderData = riderMap.get(comment.riderCode)!;
      riderData.totalComments += 1;
      riderData.categoryBreakdown[comment.category] = (riderData.categoryBreakdown[comment.category] || 0) + 1;
    }

    // Calculate most frequent category for each rider
    const riderBreakdown = Array.from(riderMap.values()).map((rider) => {
      let maxCount = 0;
      let mostFrequent: CommentCategory = 'other';
      
      for (const [category, count] of Object.entries(rider.categoryBreakdown)) {
        if (count > maxCount) {
          maxCount = count;
          mostFrequent = category as CommentCategory;
        }
      }

      return {
        ...rider,
        mostFrequentCategory: mostFrequent,
      };
    });

    // Expected returns
    const expectedReturns = comments
      .filter((c) => c.expectedReturnDate && c.expectedReturnDate >= startDate)
      .map((c) => ({
        riderCode: c.riderCode,
        riderName: c.riderName,
        date: c.expectedReturnDate!,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalComments: comments.length,
      riderBreakdown,
      categoryBreakdown,
      expectedReturns,
    };
  } catch (error) {
    console.error('[getCommentsSummaryForStrategicOps] Error:', error);
    return {
      totalComments: 0,
      riderBreakdown: [],
      categoryBreakdown: {} as Record<CommentCategory, number>,
      expectedReturns: [],
    };
  }
}

