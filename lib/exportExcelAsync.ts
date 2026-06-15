import * as XLSX from 'xlsx';

/** Run Excel file generation off the critical UI path. */
export function exportJsonToExcelFile(
  rows: Record<string, unknown>[],
  sheetName: string,
  fileName: string,
  columnOrder?: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const run = () => {
      try {
        const worksheet = columnOrder
          ? XLSX.utils.json_to_sheet(rows, { header: columnOrder })
          : XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, fileName);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(run);
    } else {
      setTimeout(run, 0);
    }
  });
}
