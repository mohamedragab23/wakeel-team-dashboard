/**
 * Write optimization utilities for Google Sheets operations
 * Ensures fast, reliable writes with proper error handling
 */

import { appendToSheet } from './googleSheets';

export interface WriteResult {
  success: boolean;
  written: number;
  failed: number;
  errors: string[];
}

/**
 * Optimized batch write with progress tracking
 */
export async function optimizedBatchWrite(
  sheetName: string,
  data: any[][],
  batchSize: number = 100
): Promise<WriteResult> {
  const result: WriteResult = {
    success: true,
    written: 0,
    failed: 0,
    errors: [],
  };

  if (!data || data.length === 0) {
    return result;
  }

  try {
    // Use batch processing for large datasets
    if (data.length <= batchSize) {
      await appendToSheet(sheetName, data);
      result.written = data.length;
    } else {
      // Process in batches
      for (let i = 0; i < data.length; i += batchSize) {
        const chunk = data.slice(i, i + batchSize);
        try {
          await appendToSheet(sheetName, chunk);
          result.written += chunk.length;
        } catch (error: any) {
          result.failed += chunk.length;
          result.errors.push(`فشل كتابة الصفوف ${i + 1}-${i + chunk.length}: ${error.message}`);
          result.success = false;
        }
      }
    }
  } catch (error: any) {
    result.success = false;
    result.failed = data.length;
    result.errors.push(`فشل كتابة البيانات: ${error.message || 'خطأ غير معروف'}`);
  }

  return result;
}

/**
 * Validate data before write
 */
export function validateBeforeWrite(data: any[][], requiredColumns: number): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data || data.length === 0) {
    errors.push('لا توجد بيانات للكتابة');
    return { valid: false, errors };
  }

  data.forEach((row, index) => {
    if (!row || row.length < requiredColumns) {
      errors.push(`الصف ${index + 1}: عدد الأعمدة غير كافي (مطلوب: ${requiredColumns})`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

