import { getSheetData, findDataInSheet } from './googleSheets';
import { getSupervisorRiders } from './dataService';
import { getAllSupervisors } from './adminService';
import { aggregateSupervisorDailyPerformance } from './dataFilter';

const SHEET_SUPERVISOR_RECEIPTS = 'قبض_المشرفين';
const SHEET_ADMIN_DEDUCTIONS = 'خصومات_الإدارة';

const PERFORMANCE_DEDUCTION_REASON_RE = /خصم\s*الأداء|^\s*أداء|الأداء|اداء/i;

// Helper function to parse date (same as in dataFilter)
function parseDateForSalary(dateValue: any): Date | null {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  const dateStr = dateValue.toString().trim();
  if (!dateStr) return null;
  
  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parsed = new Date(dateStr + 'T00:00:00');
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  // Try M/D/YYYY or D/M/YYYY (common in Excel and Google Sheets)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      // Try M/D/YYYY first (US format - common in Excel exports)
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      const parsed = new Date(year, month, day);
      // Validate: check if the parsed date matches what we expect
      if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
        return parsed;
      }
      // Try D/M/YYYY (European/Arabic format)
      const day2 = parseInt(parts[0]);
      const month2 = parseInt(parts[1]) - 1;
      const year2 = parseInt(parts[2]);
      const parsed2 = new Date(year2, month2, day2);
      if (!isNaN(parsed2.getTime()) && parsed2.getDate() === day2 && parsed2.getMonth() === month2 && parsed2.getFullYear() === year2) {
        return parsed2;
      }
    }
  }
  
  // Standard Date parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
    return parsed;
  }
  
  // Excel serial date format
  if (!isNaN(Number(dateStr)) && !dateStr.includes('/') && !dateStr.includes('-')) {
    const serialNumber = Number(dateStr);
    if (serialNumber >= 1 && serialNumber < 100000) {
      const excelDate = new Date(1899, 11, 30);
      excelDate.setDate(excelDate.getDate() + serialNumber);
      if (!isNaN(excelDate.getTime()) && excelDate.getFullYear() > 1900 && excelDate.getFullYear() < 2100) {
        return excelDate;
      }
    }
  }
  
  return null;
}

/** Sum supervisor cash receipts from sheet قبض_المشرفين for commission type 2. */
async function getSupervisorReceiptsInRange(
  supervisorCode: string,
  startDate: Date,
  endDate: Date
): Promise<{ total: number; items: { date: string; amount: number; note?: string }[] }> {
  const items: { date: string; amount: number; note?: string }[] = [];
  let total = 0;
  try {
    const data = await getSheetData(SHEET_SUPERVISOR_RECEIPTS, false);
    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row?.[0] || row[0].toString().trim() !== supervisorCode) continue;

      let inRange = false;
      let dateStr = '';
      if (row[1]) {
        const d = parseDateForSalary(row[1]);
        if (d) {
          const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          inRange = nd >= normalizedStart && nd <= normalizedEnd;
          dateStr = d.toISOString().split('T')[0];
        } else {
          const month = parseInt(row[1].toString());
          if (!isNaN(month) && month >= 1 && month <= 12) {
            const monthStart = new Date(normalizedStart.getFullYear(), month - 1, 1);
            const monthEnd = new Date(normalizedStart.getFullYear(), month, 0);
            inRange = monthStart <= normalizedEnd && monthEnd >= normalizedStart;
            dateStr = `شهر ${month}`;
          }
        }
      } else {
        inRange = true;
        dateStr = 'غير محدد';
      }

      if (!inRange) continue;
      const amount = Number(row[2]?.toString() || '0') || 0;
      if (amount <= 0) continue;
      total += amount;
      items.push({
        date: dateStr,
        amount,
        note: row[3]?.toString().trim() || undefined,
      });
    }
  } catch (e) {
    console.warn('[Salary] قبض_المشرفين sheet missing or error:', e);
  }
  return { total, items };
}

/** Admin-only deductions visible to supervisor with line detail. */
async function getAdminDeductionsInRange(
  supervisorCode: string,
  startDate: Date,
  endDate: Date
): Promise<{ total: number; items: { date: string; reason: string; amount: number }[] }> {
  const items: { date: string; reason: string; amount: number }[] = [];
  let total = 0;
  try {
    const data = await getSheetData(SHEET_ADMIN_DEDUCTIONS, false);
    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row?.[0] || row[0].toString().trim() !== supervisorCode) continue;

      let inRange = false;
      let dateStr = '';
      if (row[1]) {
        const d = parseDateForSalary(row[1]);
        if (d) {
          const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          inRange = nd >= normalizedStart && nd <= normalizedEnd;
          dateStr = d.toISOString().split('T')[0];
        } else {
          const month = parseInt(row[1].toString());
          if (!isNaN(month) && month >= 1 && month <= 12) {
            const monthStart = new Date(normalizedStart.getFullYear(), month - 1, 1);
            const monthEnd = new Date(normalizedStart.getFullYear(), month, 0);
            inRange = monthStart <= normalizedEnd && monthEnd >= normalizedStart;
            dateStr = `شهر ${month}`;
          }
        }
      } else {
        inRange = true;
        dateStr = 'غير محدد';
      }

      if (!inRange) continue;
      const amount = Number(row[3]?.toString() || '0') || 0;
      if (amount <= 0) continue;
      total += amount;
      items.push({
        date: dateStr,
        reason: row[2]?.toString().trim() || 'خصم إداري',
        amount,
      });
    }
  } catch (e) {
    console.warn('[Salary] خصومات_الإدارة sheet missing or error:', e);
  }
  return { total, items };
}

// Deduction detail interface
interface DeductionDetail {
  date: string;
  reason: string;
  amount: number;
}

// Get supervisor deductions for a date range with details
async function getSupervisorDeductionsDetails(supervisorCode: string, startDate: Date, endDate: Date): Promise<{ total: number; items: DeductionDetail[] }> {
  try {
    // Don't use cache for salary calculations to ensure fresh data
    const deductionsData = await getSheetData('الخصومات', false);
    let totalDeductions = 0;
    const items: DeductionDetail[] = [];

    // Parse dates for comparison
    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    console.log(`[Salary] Fetching deductions for ${supervisorCode} from ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`);
    console.log(`[Salary] Deductions data rows: ${deductionsData.length}`);

    // Column structure: A=كود المشرف, B=الشهر, C=سبب الخصم, D=المبلغ
    for (let i = 1; i < deductionsData.length; i++) {
      const row = deductionsData[i];
      if (!row || !row[0]) continue;
      
      const rowSupervisorCode = row[0].toString().trim();
      if (rowSupervisorCode !== supervisorCode) continue;
      
      // Column structure: [0] supervisorCode, [1] month or date, [2] reason, [3] amount
      let inRange = false;
      let dateStr = '';
      
      if (row[1]) {
        const deductionDate = parseDateForSalary(row[1]);
        if (deductionDate) {
          const normalizedDeductionDate = new Date(deductionDate.getFullYear(), deductionDate.getMonth(), deductionDate.getDate());
          inRange = normalizedDeductionDate >= normalizedStart && normalizedDeductionDate <= normalizedEnd;
          dateStr = deductionDate.toISOString().split('T')[0];
        } else {
          const month = parseInt(row[1].toString());
          if (!isNaN(month) && month >= 1 && month <= 12) {
            const monthStart = new Date(normalizedStart.getFullYear(), month - 1, 1);
            const monthEnd = new Date(normalizedStart.getFullYear(), month, 0);
            inRange = (monthStart <= normalizedEnd && monthEnd >= normalizedStart);
            dateStr = `شهر ${month}`;
          }
        }
      } else {
        inRange = true;
        dateStr = 'غير محدد';
      }
      
      if (inRange) {
        // Column D (index 3) contains the amount
        const amount = Number(row[3]?.toString() || '0') || 0;
        if (amount > 0) {
          totalDeductions += amount;
          items.push({
            date: dateStr,
            reason: row[2]?.toString() || 'خصم',
            amount,
          });
          console.log(`[Salary] Found deduction: ${amount} EGP - ${row[2]?.toString() || 'خصم'} (${dateStr})`);
        }
      }
    }
    
    console.log(`[Salary] Total deductions for ${supervisorCode}: ${totalDeductions} EGP (${items.length} items)`);
    return { total: totalDeductions, items };
  } catch (error) {
    console.error('Error fetching deductions:', error);
    return { total: 0, items: [] };
  }
}

// Get supervisor deductions for a date range (backward compatible)
async function getSupervisorDeductions(supervisorCode: string, startDate: Date, endDate: Date) {
  const result = await getSupervisorDeductionsDetails(supervisorCode, startDate, endDate);
  return result.total;
}

// Advance detail interface
interface AdvanceDetail {
  date: string;
  amount: number;
}

// Get supervisor advances for a date range with details
async function getSupervisorAdvancesDetails(supervisorCode: string, startDate: Date, endDate: Date): Promise<{ total: number; items: AdvanceDetail[] }> {
  try {
    // Don't use cache for salary calculations to ensure fresh data
    const advancesData = await getSheetData('السلف', false);
    let totalAdvances = 0;
    const items: AdvanceDetail[] = [];

    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    console.log(`[Salary] Fetching advances for ${supervisorCode} from ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`);
    console.log(`[Salary] Advances data rows: ${advancesData.length}`);

    for (let i = 1; i < advancesData.length; i++) {
      const row = advancesData[i];
      if (!row || !row[0]) continue;
      
      const rowSupervisorCode = row[0].toString().trim();
      if (rowSupervisorCode !== supervisorCode) continue;
      
      // Column structure: [0] supervisorCode, [1] month or date, [2] amount
      let inRange = false;
      let dateStr = '';
      
      if (row[1]) {
        const advanceDate = parseDateForSalary(row[1]);
        if (advanceDate) {
          const normalizedAdvanceDate = new Date(advanceDate.getFullYear(), advanceDate.getMonth(), advanceDate.getDate());
          inRange = normalizedAdvanceDate >= normalizedStart && normalizedAdvanceDate <= normalizedEnd;
          dateStr = advanceDate.toISOString().split('T')[0];
        } else {
          const month = parseInt(row[1].toString());
          if (!isNaN(month) && month >= 1 && month <= 12) {
            const monthStart = new Date(normalizedStart.getFullYear(), month - 1, 1);
            const monthEnd = new Date(normalizedStart.getFullYear(), month, 0);
            inRange = (monthStart <= normalizedEnd && monthEnd >= normalizedStart);
            dateStr = `شهر ${month}`;
          }
        }
      } else {
        inRange = true;
        dateStr = 'غير محدد';
      }
      
      if (inRange) {
        // Column C (index 2) contains the amount
        const amount = Number(row[2]?.toString() || '0') || 0;
        if (amount > 0) {
          totalAdvances += amount;
          items.push({ date: dateStr, amount });
          console.log(`[Salary] Found advance: ${amount} EGP (${dateStr})`);
        }
      }
    }
    
    console.log(`[Salary] Total advances for ${supervisorCode}: ${totalAdvances} EGP (${items.length} items)`);
    return { total: totalAdvances, items };
  } catch (error) {
    console.error('Error fetching advances:', error);
    return { total: 0, items: [] };
  }
}

// Get supervisor advances for a date range (backward compatible)
async function getSupervisorAdvances(supervisorCode: string, startDate: Date, endDate: Date) {
  const result = await getSupervisorAdvancesDetails(supervisorCode, startDate, endDate);
  return result.total;
}

// Get security inquiries cost for a date range
async function getSecurityInquiriesCost(supervisorCode: string, startDate: Date, endDate: Date) {
  try {
    // Don't use cache for salary calculations to ensure fresh data
    const securityData = await getSheetData('استعلام أمني', false);
    let inquiryCount = 0;

    // Parse dates for comparison
    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    console.log(`[Salary] Fetching security inquiries for ${supervisorCode} from ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`);
    console.log(`[Salary] Security data rows: ${securityData.length}`);

    // Column structure: A=التاريخ, B=كود المشرف, C=المكتب, D=اسم المندوب, E=الهاتف, F=الرقم القومي, G=اسم المشرف
    for (let i = 1; i < securityData.length; i++) {
      const row = securityData[i];
      let foundSupervisor = false;
      
      // Column B (index 1) contains supervisor code
      if (!row || !row[1]) continue;
      
      const rowSupervisorCode = row[1].toString().trim();
      if (rowSupervisorCode !== supervisorCode) continue;
      
      // Check date if available (Column A - index 0)
      let inRange = false;
      if (row[0]) {
        const inquiryDate = parseDateForSalary(row[0]);
        if (inquiryDate) {
          const normalizedInquiryDate = new Date(inquiryDate.getFullYear(), inquiryDate.getMonth(), inquiryDate.getDate());
          inRange = normalizedInquiryDate >= normalizedStart && normalizedInquiryDate <= normalizedEnd;
        } else {
          // If date parsing fails, include it (backward compatibility)
          inRange = true;
        }
      } else {
        // If no date, include it (backward compatibility)
        inRange = true;
      }
      
      if (inRange) {
        inquiryCount++;
      }
    }

    const cost = inquiryCount * 100;
    console.log(`[Salary] Security inquiries for ${supervisorCode}: ${inquiryCount} inquiries = ${cost} EGP`);
    if (inquiryCount > 0) {
      console.log(`[Salary] Security inquiry details: Found ${inquiryCount} inquiries in date range`);
    }
    return cost;
  } catch (error) {
    console.error('Error fetching security inquiries cost:', error);
    return 0;
  }
}

// Get equipment pricing from Google Sheets (Vercel) or local file or defaults
async function getEquipmentPricing() {
  const defaults = {
    motorcycleBox: 550,
    bicycleBox: 550,
    tshirt: 100,
    jacket: 200,
    helmet: 150,
  };

  try {
    const { getSheetData } = await import('./googleSheets');
    const data = await getSheetData('أسعار_المعدات', true);
    if (data && data.length >= 2 && data[1] && data[1].length >= 5) {
      const row = data[1];
      const pricing = {
        motorcycleBox: Number(row[0]) >= 0 ? Number(row[0]) : defaults.motorcycleBox,
        bicycleBox: Number(row[1]) >= 0 ? Number(row[1]) : defaults.bicycleBox,
        tshirt: Number(row[2]) >= 0 ? Number(row[2]) : defaults.tshirt,
        jacket: Number(row[3]) >= 0 ? Number(row[3]) : defaults.jacket,
        helmet: Number(row[4]) >= 0 ? Number(row[4]) : defaults.helmet,
      };
      console.log('[Salary] Equipment pricing loaded from Google Sheets:', pricing);
      return pricing;
    }
  } catch (e) {
    console.log('[Salary] Equipment pricing from Sheets failed, trying local file:', e);
  }

  try {
    const fs = await import('fs');
    const path = await import('path');
    const localFile = path.join(process.cwd(), 'data', 'equipment-pricing.json');
    if (fs.existsSync(localFile)) {
      const data = fs.readFileSync(localFile, 'utf-8');
      const pricing = JSON.parse(data);
      console.log('[Salary] Equipment pricing loaded from file:', pricing);
      return {
        motorcycleBox: typeof pricing.motorcycleBox === 'number' ? pricing.motorcycleBox : 550,
        bicycleBox: typeof pricing.bicycleBox === 'number' ? pricing.bicycleBox : 550,
        tshirt: typeof pricing.tshirt === 'number' ? pricing.tshirt : 100,
        jacket: typeof pricing.jacket === 'number' ? pricing.jacket : 200,
        helmet: typeof pricing.helmet === 'number' ? pricing.helmet : 150,
      };
    }
  } catch (error) {
    console.log('[Salary] Equipment pricing file not found, using defaults:', error);
  }

  return defaults;
}

// Equipment details interface
interface EquipmentDetails {
  totalCost: number;
  items: {
    name: string;
    quantity: number;
    price: number;
    total: number;
  }[];
}

// Get equipment cost for a date range with detailed breakdown
async function getEquipmentCost(supervisorCode: string, startDate: Date, endDate: Date): Promise<number> {
  const details = await getEquipmentCostDetails(supervisorCode, startDate, endDate);
  return details.totalCost;
}

// Get equipment cost with detailed breakdown
async function getEquipmentCostDetails(supervisorCode: string, startDate: Date, endDate: Date): Promise<EquipmentDetails> {
  try {
    // Don't use cache for salary calculations to ensure fresh data
    const [equipmentData, pricing] = await Promise.all([
      getSheetData('المعدات', false),
      getEquipmentPricing(),
    ]);

    // Parse dates for comparison
    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    console.log(`[Salary] Fetching equipment for ${supervisorCode} from ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}`);
    console.log(`[Salary] Equipment data rows: ${equipmentData.length}`);
    console.log(`[Salary] Equipment pricing:`, pricing);

    let totalMotorcycleBoxes = 0;
    let totalBicycleBoxes = 0;
    let totalTshirts = 0;
    let totalJackets = 0;
    let totalHelmets = 0;

    // Column structure: A=كود المشرف, B=الشهر, C=عدد الصناديق دراجة نارية, D=عدد الصناديق دراجة هوائية, E=عدد التيشرتات, F=عدد الجواكيت, G=عدد الخوذ
    for (let i = 1; i < equipmentData.length; i++) {
      const row = equipmentData[i];
      if (!row || !row[0]) continue;
      
      const rowSupervisorCode = row[0].toString().trim();
      if (rowSupervisorCode !== supervisorCode) continue;
      
      // Check if equipment is in date range (Column B - الشهر)
      let inRange = false;
      
      if (row[1]) {
        const equipmentDate = parseDateForSalary(row[1]);
        if (equipmentDate) {
          const normalizedEquipmentDate = new Date(equipmentDate.getFullYear(), equipmentDate.getMonth(), equipmentDate.getDate());
          inRange = normalizedEquipmentDate >= normalizedStart && normalizedEquipmentDate <= normalizedEnd;
        } else {
          // If it's a month number (1-12), check if it falls within the date range
          const month = parseInt(row[1].toString());
          if (!isNaN(month) && month >= 1 && month <= 12) {
            const monthStart = new Date(normalizedStart.getFullYear(), month - 1, 1);
            const monthEnd = new Date(normalizedStart.getFullYear(), month, 0);
            inRange = (monthStart <= normalizedEnd && monthEnd >= normalizedStart);
          }
        }
      } else {
        // If no date specified, include it (backward compatibility)
        inRange = true;
      }
      
      if (inRange) {
        const motorcycleBoxes = parseInt(row[2]?.toString() || '0') || 0;
        const bicycleBoxes = parseInt(row[3]?.toString() || '0') || 0;
        const tshirts = parseInt(row[4]?.toString() || '0') || 0;
        const jackets = parseInt(row[5]?.toString() || '0') || 0;
        const helmets = parseInt(row[6]?.toString() || '0') || 0;
        
        totalMotorcycleBoxes += motorcycleBoxes;
        totalBicycleBoxes += bicycleBoxes;
        totalTshirts += tshirts;
        totalJackets += jackets;
        totalHelmets += helmets;
        
        if (motorcycleBoxes > 0 || bicycleBoxes > 0 || tshirts > 0 || jackets > 0 || helmets > 0) {
          console.log(`[Salary] Found equipment: ${row[1]?.toString() || 'no date'} - Motorcycle: ${motorcycleBoxes}, Bicycle: ${bicycleBoxes}, Tshirts: ${tshirts}, Jackets: ${jackets}, Helmets: ${helmets}`);
        }
      }
    }

    // Calculate costs
    const items = [];
    
    if (totalMotorcycleBoxes > 0) {
      items.push({
        name: 'صندوق دراجة نارية',
        quantity: totalMotorcycleBoxes,
        price: pricing.motorcycleBox,
        total: totalMotorcycleBoxes * pricing.motorcycleBox,
      });
    }
    
    if (totalBicycleBoxes > 0) {
      items.push({
        name: 'صندوق دراجة هوائية',
        quantity: totalBicycleBoxes,
        price: pricing.bicycleBox,
        total: totalBicycleBoxes * pricing.bicycleBox,
      });
    }
    
    if (totalTshirts > 0) {
      items.push({
        name: 'تيشرت',
        quantity: totalTshirts,
        price: pricing.tshirt,
        total: totalTshirts * pricing.tshirt,
      });
    }
    
    if (totalJackets > 0) {
      items.push({
        name: 'جاكت',
        quantity: totalJackets,
        price: pricing.jacket,
        total: totalJackets * pricing.jacket,
      });
    }
    
    if (totalHelmets > 0) {
      items.push({
        name: 'خوذة',
        quantity: totalHelmets,
        price: pricing.helmet,
        total: totalHelmets * pricing.helmet,
      });
    }

    const totalCost = items.reduce((sum, item) => sum + item.total, 0);
    
    console.log(`[Salary] Equipment cost for ${supervisorCode}: ${totalCost} EGP (${items.length} item types)`);
    console.log(`[Salary] Equipment breakdown:`, items);
    
    return { totalCost, items };
  } catch (error) {
    console.error('Error fetching equipment cost:', error);
    return { totalCost: 0, items: [] };
  }
}

// Get bonus
async function getBonus(supervisorCode: string, month: number, year: number) {
  try {
    const targetsData = await getSheetData('الأهداف');

    for (let i = 1; i < targetsData.length; i++) {
      if (targetsData[i][0] === supervisorCode && targetsData[i][1] == month) {
        return Number(targetsData[i][4]) || 0;
      }
    }
    return 0;
  } catch (error) {
    console.error('Error fetching bonus:', error);
    return 0;
  }
}

// Calculate supervisor salary with support for fixed/commission methods
// Accepts either month/year or startDate/endDate
export async function calculateSupervisorSalary(
  supervisorCode: string,
  startDateOrMonth: string | number,
  endDateOrYear?: string | number
) {
  // Determine if we're using date range or month/year
  let startDate: Date;
  let endDate: Date;
  let month: number;
  let year: number;

  if (typeof startDateOrMonth === 'string' && typeof endDateOrYear === 'string') {
    // Date range mode
    startDate = new Date(startDateOrMonth);
    endDate = new Date(endDateOrYear);
    month = startDate.getMonth() + 1;
    year = startDate.getFullYear();
  } else if (typeof startDateOrMonth === 'number' && typeof endDateOrYear === 'number') {
    // Month/year mode (legacy)
    month = startDateOrMonth;
    year = endDateOrYear;
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0); // Last day of month
  } else {
    // Default to current month
    const now = new Date();
    month = now.getMonth() + 1;
    year = now.getFullYear();
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0);
  }
  try {
    const [supervisors, riders, configData] = await Promise.all([
      getAllSupervisors(),
      getSupervisorRiders(supervisorCode, false),
      getSheetData('إعدادات_الرواتب', false),
    ]);

    const supervisor = supervisors.find((s) => s.code === supervisorCode);

    const agg = await aggregateSupervisorDailyPerformance(supervisorCode, startDate, endDate, {
      useCache: false,
      riders,
    });

    const totalOrders = agg.totalOrders;
    const totalHours = agg.totalHours;

    const riderByCode = new Map(riders.map((r) => [r.code, r] as const));
    const riderPerformance: {
      code: string;
      name: string;
      totalOrders: number;
      totalHours: number;
    }[] = [];
    for (const [code, t] of agg.byRider.entries()) {
      const rider = riderByCode.get(code);
      riderPerformance.push({
        code,
        name: rider?.name ?? code,
        totalOrders: t.orders,
        totalHours: t.hours,
      });
    }
    riderPerformance.sort((a, b) => a.code.localeCompare(b.code));

    let salaryConfig: any = null;
    try {
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0]?.toString().trim() === supervisorCode) {
          salaryConfig = {
            method: configData[i][1]?.toString().trim() || 'fixed',
            fixedAmount: parseFloat(configData[i][2]?.toString() || '0'),
            type1Ranges: configData[i][3] ? JSON.parse(configData[i][3].toString()) : null,
            type2BasePercentage: parseFloat(configData[i][4]?.toString() || '11'),
            type2SupervisorPercentage: parseFloat(configData[i][5]?.toString() || '60'),
          };
          break;
        }
      }
    } catch {
      console.warn('Could not parse salary config from Sheets, using supervisor data');
    }

    if (!salaryConfig) {
      salaryConfig = {
        method: supervisor?.salaryType === 'fixed' ? 'fixed' : 'commission_type1',
        fixedAmount: supervisor?.salaryAmount || 0,
      };
    }

    let baseSalary = 0;
    let commission = 0;
    let commissionType: 'type1' | 'type2' | undefined;
    let commissionDetails: any;
    let salaryMethod: 'fixed' | 'commission_type1' | 'commission_type2' | 'legacy_multiplier' = 'fixed';
    const workingDays = agg.byDate.size;

    const breakdown: Array<{
      date: string;
      orders: number;
      hours: number;
      multiplier: number;
      dailyCommission: number;
    }> = [];

    function type1RateForDailyHours(dayHours: number, ranges: { minHours: number; maxHours: number; ratePerOrder: number }[]) {
      for (const range of ranges) {
        if (dayHours >= range.minHours && dayHours <= range.maxHours) {
          return range.ratePerOrder;
        }
      }
      return ranges.length > 0 ? ranges[ranges.length - 1].ratePerOrder : 1.0;
    }

    if (salaryConfig.method === 'fixed') {
      salaryMethod = 'fixed';
      baseSalary = salaryConfig.fixedAmount || 0;
      commission = 0;
    } else if (salaryConfig.method === 'commission_type1') {
      salaryMethod = 'commission_type1';
      commissionType = 'type1';
      const ranges = salaryConfig.type1Ranges || [
        { minHours: 0, maxHours: 500, ratePerOrder: 1.0 },
        { minHours: 501, maxHours: 999999, ratePerOrder: 1.25 },
      ];
      commission = 0;
      const sortedDates = [...agg.byDate.keys()].sort();
      for (const dateStr of sortedDates) {
        const dayData = agg.byDate.get(dateStr)!;
        const dayHours = dayData.hours;
        const rate = type1RateForDailyHours(dayHours, ranges);
        const dayComm = dayData.orders * rate;
        commission += dayComm;
        breakdown.push({
          date: dateStr,
          orders: dayData.orders,
          hours: dayHours,
          multiplier: rate,
          dailyCommission: dayComm,
        });
      }
      const blendedRatePerOrder = totalOrders > 0 ? commission / totalOrders : 0;
      const averageDailyHours = workingDays > 0 ? totalHours / workingDays : 0;
      commissionDetails = {
        totalHours,
        totalOrders,
        ratePerOrder: blendedRatePerOrder,
        blendedRatePerOrder,
        averageDailyHours,
        ranges,
        workingDays,
        calculationNote:
          'لكل يوم: إجمالي ساعات مناديبك ذلك اليوم يحدد النطاق، ثم عمولة ذلك اليوم = طلبات ذلك اليوم × المعدل. إجمالي العمولة = مجموع العمولات اليومية.',
      };
      baseSalary = 0;
    } else if (salaryConfig.method === 'commission_type2') {
      salaryMethod = 'commission_type2';
      commissionType = 'type2';
      const receipts = await getSupervisorReceiptsInRange(supervisorCode, startDate, endDate);
      const totalReceipts = receipts.total;
      const basePercentage = salaryConfig.type2BasePercentage || 11;
      const supervisorPercentage = salaryConfig.type2SupervisorPercentage || 60;
      const baseValue = totalReceipts * (basePercentage / 100);
      commission = baseValue * (supervisorPercentage / 100);
      commissionDetails = {
        totalSupervisorReceipts: totalReceipts,
        receiptItems: receipts.items,
        basePercentage,
        supervisorPercentage,
        baseValue,
        note: 'القيمة من شيت قبض_المشرفين (إجمالي قبض المشرف في الفترة).',
      };
      baseSalary = 0;
    } else {
      salaryMethod = 'legacy_multiplier';
      let multiplier = 1;
      if (totalHours >= 400) multiplier = 1.5;
      else if (totalHours >= 300) multiplier = 1.4;
      else if (totalHours >= 200) multiplier = 1.3;
      else if (totalHours >= 100) multiplier = 1.2;
      baseSalary = totalOrders * multiplier;
      commissionDetails = { legacyMultiplier: multiplier, totalOrders, totalHours };
    }

    const totalSalary = baseSalary + commission;

    const [
      deductionsDetails,
      advancesDetails,
      securityCost,
      equipmentDetails,
      bonus,
      adminDeductions,
    ] = await Promise.all([
      getSupervisorDeductionsDetails(supervisorCode, startDate, endDate),
      getSupervisorAdvancesDetails(supervisorCode, startDate, endDate),
      getSecurityInquiriesCost(supervisorCode, startDate, endDate),
      getEquipmentCostDetails(supervisorCode, startDate, endDate),
      getBonus(supervisorCode, month, year),
      getAdminDeductionsInRange(supervisorCode, startDate, endDate),
    ]);

    const performanceItems = deductionsDetails.items.filter((it) =>
      PERFORMANCE_DEDUCTION_REASON_RE.test(it.reason || '')
    );
    const generalDeductionItems = deductionsDetails.items.filter(
      (it) => !PERFORMANCE_DEDUCTION_REASON_RE.test(it.reason || '')
    );
    const performanceDeductions = performanceItems.reduce((s, it) => s + it.amount, 0);
    const deductionsGeneral = generalDeductionItems.reduce((s, it) => s + it.amount, 0);
    const deductionsSheetTotal = deductionsDetails.total;

    const advances = advancesDetails.total;
    const equipmentCost = equipmentDetails.totalCost;
    const adminDeductionTotal = adminDeductions.total;

    const netSalary =
      totalSalary +
      bonus -
      deductionsSheetTotal -
      advances -
      securityCost -
      equipmentCost -
      adminDeductionTotal;

    console.log(`[Salary] Calculation for ${supervisorCode}:`);
    console.log(`  Base/Commission: ${totalSalary}, Bonus: ${bonus}`);
    console.log(
      `  Deductions(sheet): ${deductionsSheetTotal}, Admin: ${adminDeductionTotal}, Advances: ${advances}, Security: ${securityCost}, Equipment: ${equipmentCost}`
    );
    console.log(`  Net Salary: ${netSalary}`);

    if (salaryMethod === 'commission_type2' || salaryMethod === 'legacy_multiplier') {
      const sortedDates = [...agg.byDate.keys()].sort();
      for (const dateStr of sortedDates) {
        const dayData = agg.byDate.get(dateStr)!;
        breakdown.push({
          date: dateStr,
          orders: dayData.orders,
          hours: dayData.hours,
          multiplier: 1,
          dailyCommission: 0,
        });
      }
    }

    const showCommissionBlock = salaryMethod !== 'fixed' && salaryMethod !== 'legacy_multiplier';

    return {
      supervisorId: supervisorCode,
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      periodTotals: { totalOrders, totalHours },
      salaryMethod,
      baseAmount: baseSalary + commission,
      commission: showCommissionBlock
        ? {
            type: commissionType || 'type1',
            totalOrders,
            totalHours,
            commissionRate: commissionDetails?.ratePerOrder ?? 0,
            workingDays,
            calculatedCommission: commission,
            details: commissionDetails,
          }
        : undefined,
      deductions: {
        advances,
        advancesDetails: advancesDetails.items,
        deductions: deductionsGeneral,
        deductionsDetails: generalDeductionItems,
        performance: performanceDeductions,
        performanceDetails: performanceItems,
        equipment: equipmentCost,
        equipmentDetails: equipmentDetails.items,
        security: securityCost,
        admin: adminDeductionTotal,
        adminDetails: adminDeductions.items,
        total:
          deductionsSheetTotal + advances + securityCost + equipmentCost + adminDeductionTotal,
      },
      netSalary,
      breakdown,
      riderPerformance,
    };
  } catch (error) {
    console.error('Error calculating supervisor salary:', error);
    throw error;
  }
}


