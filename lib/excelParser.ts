import * as XLSX from 'xlsx';

export interface ExcelRow {
  [key: string]: any;
}

export interface ParsedExcelData {
  headers: string[];
  rows: ExcelRow[];
}

/**
 * Parse Excel file and return structured data
 */
export function parseExcelFile(file: File): Promise<ParsedExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length === 0) {
          reject(new Error('الملف فارغ'));
          return;
        }

        // First row is headers
        const headers = jsonData[0].map((h) => String(h || '').trim()).filter((h) => h);
        const rows: ExcelRow[] = [];

        // Process data rows
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row.every((cell) => !cell || cell === '')) continue; // Skip empty rows

          const rowObj: ExcelRow = {};
          headers.forEach((header, index) => {
            rowObj[header] = row[index] || '';
          });
          rows.push(rowObj);
        }

        resolve({ headers, rows });
      } catch (error) {
        reject(new Error(`خطأ في قراءة الملف: ${error}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('فشل قراءة الملف'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Validate rider data from Excel
 */
export function validateRiderData(row: ExcelRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!row['كود المندوب'] && !row['Rider Code'] && !row['Code']) {
    errors.push('كود المندوب مطلوب');
  }

  if (!row['الاسم'] && !row['Name'] && !row['اسم المندوب']) {
    errors.push('اسم المندوب مطلوب');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate debt data from Excel
 */
export function validateDebtData(row: ExcelRow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const riderCode = row['كود المندوب'] || row['Rider Code'] || row['Code'];
  const debtAmount = row['المبلغ'] || row['Debt Amount'] || row['Amount'] || row['المديونية'];

  if (!riderCode) {
    errors.push('كود المندوب مطلوب');
  }

  if (!debtAmount && debtAmount !== 0) {
    errors.push('المبلغ مطلوب');
  } else if (isNaN(Number(debtAmount))) {
    errors.push('المبلغ يجب أن يكون رقماً');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize column names (handle Arabic/English variations)
 */
export function normalizeColumnName(name: string): string {
  const normalized = name.trim();
  
  // Map common variations
  const columnMap: { [key: string]: string } = {
    'كود المندوب': 'riderCode',
    'Rider Code': 'riderCode',
    'Code': 'riderCode',
    'الاسم': 'name',
    'Name': 'name',
    'اسم المندوب': 'name',
    'المنطقة': 'region',
    'Region': 'region',
    'Zone': 'region',
    'المبلغ': 'amount',
    'Debt Amount': 'amount',
    'Amount': 'amount',
    'المديونية': 'amount',
  };

  return columnMap[normalized] || normalized;
}

