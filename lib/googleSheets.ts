import { cache, CACHE_KEYS } from './cache';
import {
  getMainSpreadsheetId,
  getSheetsClientFor,
  getShiftsSpreadsheetIdFromEnv,
} from './googleSheetsAuth';

export { getMainSpreadsheetId } from './googleSheetsAuth';

async function getSheetsClient() {
  return getSheetsClientFor('main');
}

// Get sheet data with enhanced caching (5 minutes cache for better performance)
export async function getSheetData(sheetName: string, useCache: boolean = true): Promise<any[][]> {
  const cacheKey = CACHE_KEYS.sheetData(sheetName);
  
  // Check server-side cache first
  if (useCache) {
    const cached = cache.get<any[][]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const sheets = await getSheetsClient();
    
    // Use batchGet for better performance if multiple ranges needed
    // Get formatted values to ensure dates written as "YYYY-MM-DD" are read correctly
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: getMainSpreadsheetId(),
      range: `${sheetName}!A:Z`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE', // Get formatted values (dates as strings in locale format)
      // This ensures dates written as "YYYY-MM-DD" are read as strings, not converted
    });

    const data = response.data.values || [];
    
    // Cache the data for 15 minutes (optimized for mobile performance)
    if (useCache) {
      cache.set(cacheKey, data, 15 * 60 * 1000);
    }
    
    return data;
  } catch (error: any) {
    console.error(`Error fetching sheet ${sheetName}:`, error);
    // Return empty array instead of throwing to prevent crashes
    return [];
  }
}

// Append data to sheet with batch processing for large datasets
// Data is ADDED to existing data (not replaced) - important for historical tracking
export async function appendToSheet(sheetName: string, values: any[][], useCache: boolean = true): Promise<boolean> {
  try {
    if (!values || values.length === 0) {
      console.log(`[GoogleSheets] No values to append to ${sheetName}`);
      return true; // Nothing to append
    }

    const sheets = await getSheetsClient();
    
    // Use append API which automatically adds data after the last row
    // This avoids calculating row numbers and prevents exceeding grid limits
    const BATCH_SIZE = 100;
    
    if (values.length <= BATCH_SIZE) {
      // Small dataset - single append
      // Use A1 as range - Google Sheets will automatically find the last row
      await sheets.spreadsheets.values.append({
        spreadsheetId: getMainSpreadsheetId(),
        range: `${sheetName}!A1`, // Use A1 - Google Sheets will find the last row automatically
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS', // Insert new rows instead of overwriting
        requestBody: {
          values,
        },
      });
      
      console.log(`[GoogleSheets] Appended ${values.length} rows to ${sheetName}`);
    } else {
      // Large dataset - batch processing
      const totalBatches = Math.ceil(values.length / BATCH_SIZE);
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const chunk = values.slice(i, i + BATCH_SIZE);
        await sheets.spreadsheets.values.append({
          spreadsheetId: getMainSpreadsheetId(),
          range: `${sheetName}!A1`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: chunk,
          },
        });
        // Log progress for large batches
        if (totalBatches > 5 && (i / BATCH_SIZE) % 5 === 0) {
          console.log(`[GoogleSheets] Progress: ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches} batches (${i + chunk.length}/${values.length} rows)`);
        }
      }
      console.log(`[GoogleSheets] Appended ${values.length} rows to ${sheetName} in ${totalBatches} batches`);
    }

    // Clear cache after successful write
    cache.clear(CACHE_KEYS.sheetData(sheetName));

    return true;
  } catch (error: any) {
    console.error(`[GoogleSheets] Error appending to sheet ${sheetName}:`, error);
    console.error(`[GoogleSheets] Error details:`, {
      message: error.message,
      code: error.code,
      errors: error.errors,
    });
    throw new Error(`فشل كتابة البيانات: ${error.message || 'خطأ غير معروف'}`);
  }
}

/** Append rows to a tab in the Shifts spreadsheet (uses Shifts service account when configured). */
export async function appendToShiftsSheet(sheetName: string, values: any[][], useCache: boolean = true): Promise<boolean> {
  const shiftsSpreadsheetId = getShiftsSpreadsheetIdFromEnv();
  if (!shiftsSpreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID is not configured');
  }

  try {
    if (!values || values.length === 0) {
      return true;
    }

    const sheets = await getSheetsClientFor('shifts');
    const BATCH_SIZE = 100;

    if (values.length <= BATCH_SIZE) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: shiftsSpreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
      console.log(`[GoogleSheets:Shifts] Appended ${values.length} rows to ${sheetName}`);
    } else {
      const totalBatches = Math.ceil(values.length / BATCH_SIZE);
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const chunk = values.slice(i, i + BATCH_SIZE);
        await sheets.spreadsheets.values.append({
          spreadsheetId: shiftsSpreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: chunk },
        });
        if (totalBatches > 5 && (i / BATCH_SIZE) % 5 === 0) {
          console.log(
            `[GoogleSheets:Shifts] Progress: ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches} batches (${i + chunk.length}/${values.length} rows)`
          );
        }
      }
      console.log(`[GoogleSheets:Shifts] Appended ${values.length} rows to ${sheetName} in ${totalBatches} batches`);
    }

    cache.clear(CACHE_KEYS.shiftsSheetData(sheetName));
    return true;
  } catch (error: any) {
    console.error(`[GoogleSheets:Shifts] Error appending to ${sheetName}:`, error);
    throw new Error(`فشل كتابة بيانات الشفتات: ${error.message || 'خطأ غير معروف'}`);
  }
}

/** Create tab in Shifts workbook if missing (optional header row on create). */
export async function ensureShiftsSheetExists(sheetName: string, headers?: string[]): Promise<boolean> {
  const shiftsSpreadsheetId = getShiftsSpreadsheetIdFromEnv();
  if (!shiftsSpreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID is not configured');
  }

  try {
    const sheets = await getSheetsClientFor('shifts');
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: shiftsSpreadsheetId,
    });

    const sheetExists = spreadsheet.data.sheets?.some((sheet: any) => sheet.properties?.title === sheetName);

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: shiftsSpreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });
      console.log(`[GoogleSheets:Shifts] Created sheet: ${sheetName}`);

      if (headers && headers.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: shiftsSpreadsheetId,
          range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [headers] },
        });
      }

      cache.clear(CACHE_KEYS.shiftsSheetData(sheetName));
    }

    return true;
  } catch (error: any) {
    console.error(`Error ensuring shifts sheet ${sheetName} exists:`, error);
    if (error.message?.includes('already exists')) {
      return true;
    }
    throw error;
  }
}

// Update specific range in sheet with formatting preservation
export async function updateSheetRange(
  sheetName: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  try {
    const sheets = await getSheetsClient();
    const fullRange = `${sheetName}!${range}`;
    
    console.log(`[UpdateSheetRange] Updating ${fullRange} with ${values.length} row(s)`);
    console.log(`[UpdateSheetRange] Values:`, JSON.stringify(values, null, 2));
    
    // First, update the values
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: getMainSpreadsheetId(),
      range: fullRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });
    
    console.log(`[UpdateSheetRange] Successfully updated ${fullRange}`);
    console.log(`[UpdateSheetRange] Response:`, {
      updatedRange: response.data.updatedRange,
      updatedRows: response.data.updatedRows,
      updatedColumns: response.data.updatedColumns,
      updatedCells: response.data.updatedCells,
    });
    
    // For supervisor sheet, ensure proper formatting and column alignment
    if (sheetName === 'المشرفين') {
      try {
        // Parse the range to get row number
        const rangeMatch = range.match(/A(\d+):/);
        if (rangeMatch) {
          const rowNumber = parseInt(rangeMatch[1]);
          
          // Get sheet metadata to find sheet ID
          const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: getMainSpreadsheetId(),
          });
          
          const sheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title === sheetName);
          const sheetId = sheet?.properties?.sheetId;
          
          if (sheetId !== undefined) {
            // Use batchUpdate to preserve formatting and ensure proper column structure
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: getMainSpreadsheetId(),
              requestBody: {
                requests: [
                  {
                    // Clear any extra cells beyond column I (index 8)
                    updateCells: {
                      range: {
                        sheetId: sheetId,
                        startRowIndex: rowNumber - 1,
                        endRowIndex: rowNumber,
                        startColumnIndex: 9, // Column J (index 9) onwards
                        endColumnIndex: 26, // Column Z (index 26)
                      },
                      fields: 'userEnteredValue',
                    },
                  },
                ],
              },
            });
            
            console.log(`[UpdateSheetRange] Cleared extra cells in row ${rowNumber} for sheet ${sheetName}`);
          }
        }
      } catch (formatError: any) {
        // Don't fail the update if formatting fails
        console.warn(`[UpdateSheetRange] Warning: Could not apply formatting:`, formatError.message);
      }
    }
    
    // Clear cache after successful write - clear ALL related caches
    cache.clear(CACHE_KEYS.sheetData(sheetName));
    
    // Also clear all supervisor rider caches (we don't know which supervisors are affected)
    // This is a bit aggressive but ensures data consistency
    const cacheKeys = cache.keys();
    for (const key of cacheKeys) {
      if (key.includes('supervisor-riders') || key.includes('riders-data')) {
        cache.clear(key);
      }
    }
    
    console.log(`[UpdateSheetRange] Cleared all caches for ${sheetName} and related rider caches`);
    
    return true;
  } catch (error: any) {
    console.error(`[UpdateSheetRange] Error updating sheet ${sheetName}:`, error);
    console.error(`[UpdateSheetRange] Error details:`, {
      message: error.message,
      code: error.code,
      errors: error.errors,
    });
    return false;
  }
}

// Update a specific row in sheet (1-based row number)
export async function updateSheetRow(
  sheetName: string,
  rowNumber: number,
  values: any[]
): Promise<boolean> {
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: getMainSpreadsheetId(),
      range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });
    
    // Clear cache after successful write
    cache.clear(CACHE_KEYS.sheetData(sheetName));
    
    return true;
  } catch (error) {
    console.error(`Error updating row ${rowNumber} in sheet ${sheetName}:`, error);
    return false;
  }
}

// Find data in sheet
export function findDataInSheet(
  data: any[][],
  searchColumn: number,
  searchValue: string,
  dateColumn: number | null = null,
  month?: number,
  year?: number
): any[][] {
  const results: any[][] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[searchColumn] && row[searchColumn].toString().trim() === searchValue) {
      if (dateColumn !== null && month && year && row[dateColumn]) {
        const rowDate = new Date(row[dateColumn]);
        if (rowDate.getMonth() + 1 === month && rowDate.getFullYear() === year) {
          results.push(row);
        }
      } else {
        results.push(row);
      }
    }
  }

  return results;
}

// Check if two dates are the same day
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

// Delete a specific row from sheet (1-based row number)
export async function deleteSheetRow(sheetName: string, rowNumber: number): Promise<boolean> {
  try {
    const sheets = await getSheetsClient();
    
    // First, get the sheet ID
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: getMainSpreadsheetId(),
    });
    
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    );
    
    if (!sheet) {
      console.error(`[GoogleSheets] Sheet "${sheetName}" not found`);
      return false;
    }
    
    const sheetId = sheet.properties.sheetId;
    
    // Delete the row using batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getMainSpreadsheetId(),
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1, // 0-based index
                endIndex: rowNumber, // endIndex is exclusive
              },
            },
          },
        ],
      },
    });
    
    console.log(`[GoogleSheets] Deleted row ${rowNumber} from ${sheetName}`);
    
    // Clear cache after successful deletion
    cache.clear(CACHE_KEYS.sheetData(sheetName));
    
    return true;
  } catch (error: any) {
    console.error(`[GoogleSheets] Error deleting row ${rowNumber} from ${sheetName}:`, error);
    return false;
  }
}

// Clear all data from a sheet (keep header row)
export async function clearSheetData(sheetName: string, keepHeaderRow: boolean = true): Promise<boolean> {
  try {
    const sheets = await getSheetsClient();
    
    // Get the sheet data to find the last row
    const data = await getSheetData(sheetName, false);
    
    if (data.length <= (keepHeaderRow ? 1 : 0)) {
      console.log(`[GoogleSheets] Sheet "${sheetName}" is already empty or only has header`);
      return true;
    }
    
    // Get the sheet ID
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: getMainSpreadsheetId(),
    });
    
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title === sheetName
    );
    
    if (!sheet) {
      console.error(`[GoogleSheets] Sheet "${sheetName}" not found`);
      return false;
    }
    
    const sheetId = sheet.properties.sheetId;
    const startRow = keepHeaderRow ? 1 : 0; // Keep header row (row 1) if requested
    const endRow = data.length; // Delete from startRow to endRow
    
    console.log(`[GoogleSheets] Clearing ${endRow - startRow} rows from ${sheetName} (keeping header: ${keepHeaderRow})`);
    
    // Delete all data rows (keep header if requested)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: getMainSpreadsheetId(),
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: startRow, // 0-based index (row 2 if keeping header)
                endIndex: endRow, // endIndex is exclusive
              },
            },
          },
        ],
      },
    });
    
    console.log(`[GoogleSheets] Successfully cleared data from ${sheetName}`);
    
    // Clear cache after successful deletion
    cache.clear(CACHE_KEYS.sheetData(sheetName));
    
    // Clear all related caches
    const cacheKeys = cache.keys();
    for (const key of cacheKeys) {
      if (key.includes('performance') || key.includes('dashboard') || key.includes('riders-data')) {
        cache.clear(key);
      }
    }
    
    return true;
  } catch (error: any) {
    console.error(`[GoogleSheets] Error clearing data from ${sheetName}:`, error);
    return false;
  }
}

// Ensure sheet exists, create it if it doesn't
export async function ensureSheetExists(sheetName: string, headers?: string[]): Promise<boolean> {
  try {
    const sheets = await getSheetsClient();
    
    // Get spreadsheet metadata to check if sheet exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: getMainSpreadsheetId(),
    });
    
    const sheetExists = spreadsheet.data.sheets?.some(
      (sheet: any) => sheet.properties?.title === sheetName
    );
    
    if (!sheetExists) {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: getMainSpreadsheetId(),
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
      
      console.log(`[GoogleSheets] Created sheet: ${sheetName}`);
      
      // Add headers if provided
      if (headers && headers.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: getMainSpreadsheetId(),
          range: `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [headers],
          },
        });
        console.log(`[GoogleSheets] Added headers to ${sheetName}`);
      }
      
      // Clear cache
      cache.clear(CACHE_KEYS.sheetData(sheetName));
    }
    
    return true;
  } catch (error: any) {
    console.error(`Error ensuring sheet ${sheetName} exists:`, error);
    // If sheet already exists, that's fine
    if (error.message?.includes('already exists')) {
      return true;
    }
    throw error;
  }
}

/**
 * Reads a tab from the Shifts Streamlit spreadsheet (`spreadsheet_id` in `.streamlit/secrets.toml`).
 * Uses `GOOGLE_SHEETS_SHIFTS_CREDENTIALS_*` when set; otherwise the same credentials as the main app.
 */
export async function getShiftsSheetData(sheetName: string = 'all', useCache: boolean = true): Promise<any[][]> {
  const shiftsSpreadsheetId = getShiftsSpreadsheetIdFromEnv();
  if (!shiftsSpreadsheetId) {
    console.warn('[GoogleSheets] GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID is not set');
    return [];
  }

  const cacheKey = CACHE_KEYS.shiftsSheetData(sheetName);
  if (useCache) {
    const cached = cache.get<any[][]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const sheets = await getSheetsClientFor('shifts');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: shiftsSpreadsheetId,
      range: `${sheetName}!A:Z`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const data = response.data.values || [];
    if (useCache) {
      cache.set(cacheKey, data, 15 * 60 * 1000);
    }
    return data;
  } catch (error: any) {
    console.error(`Error fetching shifts sheet ${sheetName}:`, error);
    return [];
  }
}

