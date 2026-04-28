import * as XLSX from 'xlsx';

/**
 * Convert Excel serial date to YYYY-MM-DD string
 * Excel uses 1900-01-00 as epoch (with a bug where 1900 is treated as leap year)
 */
function excelSerialToDate(serial: number): string {
  // Excel serial date: days since 1899-12-30 (accounting for Excel's leap year bug)
  // Serial 1 = 1900-01-01
  // Serial 2 = 1900-01-02
  // But Excel incorrectly treats 1900 as a leap year (serial 60 = Feb 29, 1900 which doesn't exist)
  // So for dates after Feb 28, 1900, we need to subtract 1
  
  // Use XLSX's built-in date parsing which handles this correctly
  const date = XLSX.SSF.parse_date_code(serial);
  if (date) {
    const year = date.y;
    const month = String(date.m).padStart(2, '0');
    const day = String(date.d).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Fallback: manual calculation
  const baseDate = new Date(Date.UTC(1899, 11, 30)); // December 30, 1899
  const resultDate = new Date(baseDate.getTime() + serial * 24 * 60 * 60 * 1000);
  
  const year = resultDate.getUTCFullYear();
  const month = String(resultDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(resultDate.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Read Excel file from ArrayBuffer (server-side)
 */
export async function readExcelFromBuffer(buffer: ArrayBuffer): Promise<any[][]> {
  try {
    const data = new Uint8Array(buffer);
    // Don't use cellDates: true - we'll handle dates manually for more control
    const workbook = XLSX.read(data, { type: 'array', cellDates: false });

    if (workbook.SheetNames.length === 0) {
      throw new Error('الملف لا يحتوي على أوراق');
    }

    // Get first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to array of arrays
    // Use raw: true to get actual cell values (numbers for dates)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: true,
    }) as any[][];

    // Log first few rows for debugging
    console.log('[ExcelProcessor] First 3 rows raw:', jsonData.slice(0, 3));

    // Process dates: convert Excel serial numbers to YYYY-MM-DD strings
    // Only process first column (date column) for performance data
    for (let i = 1; i < jsonData.length; i++) { // Skip header row
      const cell = jsonData[i][0]; // First column is date
      
      if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
        // This is likely an Excel serial date (40000 = ~2009, 50000 = ~2036)
        const dateStr = excelSerialToDate(cell);
        console.log(`[ExcelProcessor] Row ${i + 1}: Converting serial ${cell} to ${dateStr}`);
        jsonData[i][0] = dateStr;
      } else if (cell instanceof Date) {
        // If it's already a Date object (shouldn't happen with cellDates: false)
        const year = cell.getFullYear();
        const month = String(cell.getMonth() + 1).padStart(2, '0');
        const day = String(cell.getDate()).padStart(2, '0');
        jsonData[i][0] = `${year}-${month}-${day}`;
      } else if (typeof cell === 'string') {
        // If it's a string, try to parse it
        const dateStr = cell.trim();
        
        // Handle M/D/YYYY format (common in Excel)
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
          const parts = dateStr.split('/');
          const month = parts[0].padStart(2, '0');
          const day = parts[1].padStart(2, '0');
          const year = parts[2];
          jsonData[i][0] = `${year}-${month}-${day}`;
          console.log(`[ExcelProcessor] Row ${i + 1}: Converting M/D/YYYY ${dateStr} to ${jsonData[i][0]}`);
        }
      }
    }

    console.log('[ExcelProcessor] Processed first 3 data rows:', jsonData.slice(1, 4));

    return jsonData;
  } catch (error: any) {
    throw new Error(`خطأ في قراءة الملف: ${error.message}`);
  }
}

