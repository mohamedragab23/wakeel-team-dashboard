import { getSheetData, findDataInSheet } from './googleSheets';
import { getSupervisorRiders } from './dataService';
import { getAllSupervisors } from './adminService';

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

// Get rider data for a date range
async function getRiderDataInRange(riderCode: string, startDate: Date, endDate: Date) {
  try {
    const dailyData = await getSheetData('البيانات اليومية', false); // Don't use cache for salary calculations
    let totalOrders = 0;
    let totalHours = 0;
    let matchedRows = 0;

    // Normalize dates for comparison
    const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    for (let i = 1; i < dailyData.length; i++) {
      if (dailyData[i][1]?.toString().trim() === riderCode) {
        const rowDateValue = dailyData[i][0];
        if (!rowDateValue) continue;

        // Parse date using improved function
        const rowDate = parseDateForSalary(rowDateValue);
        if (!rowDate || isNaN(rowDate.getTime())) {
          if (i <= 3) {
            console.warn(`[Salary] Row ${i + 1}: Invalid date for rider ${riderCode}:`, rowDateValue);
          }
          continue;
        }

        const normalizedRowDate = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());

        if (normalizedRowDate >= normalizedStart && normalizedRowDate <= normalizedEnd) {
          totalOrders += Number(dailyData[i][6]) || 0;
          totalHours += Number(dailyData[i][2]) || 0;
          matchedRows++;
        }
      }
    }

    console.log(`[Salary] Rider ${riderCode}: Matched ${matchedRows} rows, Total Orders: ${totalOrders}, Total Hours: ${totalHours}`);

    return {
      totalOrders,
      totalHours,
    };
  } catch (error) {
    console.error('Error fetching rider data:', error);
    return {
      totalOrders: 0,
      totalHours: 0,
    };
  }
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
    // Get supervisor data to check salary type
    const supervisors = await getAllSupervisors();
    const supervisor = supervisors.find((s) => s.code === supervisorCode);

    const riders = await getSupervisorRiders(supervisorCode);
    let totalOrders = 0;
    let totalHours = 0;

    for (const rider of riders) {
      const riderData = await getRiderDataInRange(rider.code, startDate, endDate);
      totalOrders += riderData.totalOrders;
      totalHours += riderData.totalHours;
    }

    let baseSalary = 0;
    let commission = 0;
    let commissionType: 'type1' | 'type2' | undefined = undefined;
    let commissionDetails: any = undefined;

    // Get supervisor config from Google Sheets
    let salaryConfig: any = null;
    try {
      const configData = await getSheetData('إعدادات_الرواتب', false);
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0]?.toString().trim() === supervisorCode) {
          salaryConfig = {
            method: configData[i][1]?.toString().trim() || 'fixed', // fixed, commission_type1, commission_type2
            fixedAmount: parseFloat(configData[i][2]?.toString() || '0'),
            // For commission_type1: ranges and rates
            type1Ranges: configData[i][3] ? JSON.parse(configData[i][3].toString()) : null,
            // For commission_type2: basePercentage (11%), supervisorPercentage (60%)
            type2BasePercentage: parseFloat(configData[i][4]?.toString() || '11'),
            type2SupervisorPercentage: parseFloat(configData[i][5]?.toString() || '60'),
          };
          break;
        }
      }
    } catch (error) {
      console.warn('Could not load salary config from Sheets, using supervisor data');
    }

    // If no config found, use supervisor data (backward compatibility)
    if (!salaryConfig) {
      salaryConfig = {
        method: supervisor?.salaryType === 'fixed' ? 'fixed' : 'commission_type1',
        fixedAmount: supervisor?.salaryAmount || 0,
      };
    }

    // Calculate salary based on method
    if (salaryConfig.method === 'fixed') {
      // Fixed salary
      baseSalary = salaryConfig.fixedAmount || 0;
      commission = 0;
    } else if (salaryConfig.method === 'commission_type1') {
      // Commission Type 1: Based on DAILY AVERAGE hours and total orders
      commissionType = 'type1';
      
      // Calculate number of working days in the period
      const { getSupervisorPerformanceFiltered } = await import('./dataFilter');
      const dailyData = await getSupervisorPerformanceFiltered(supervisorCode, startDate, endDate);
      
      // Count unique days with data
      const uniqueDays = new Set<string>();
      const dailyHours: number[] = [];
      const dailyHoursMap = new Map<string, number>();
      
      dailyData.forEach((record) => {
        let dateKey: string;
        if (record.date instanceof Date) {
          dateKey = `${record.date.getFullYear()}-${record.date.getMonth()}-${record.date.getDate()}`;
        } else {
          const d = new Date(record.date + 'T00:00:00');
          dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        }
        uniqueDays.add(dateKey);
        dailyHoursMap.set(dateKey, (dailyHoursMap.get(dateKey) || 0) + (record.hours || 0));
      });
      
      // Get daily hours for averaging
      dailyHoursMap.forEach((hours) => dailyHours.push(hours));
      
      // Calculate daily average hours
      const workingDays = uniqueDays.size || 1;
      const dailyAverageHours = dailyHours.length > 0 
        ? dailyHours.reduce((a, b) => a + b, 0) / dailyHours.length 
        : 0;
      
      console.log(`[Salary] Commission Type 1: Working days: ${workingDays}, Daily average hours: ${dailyAverageHours.toFixed(2)}`);
      
      // Default ranges if not configured
      const ranges = salaryConfig.type1Ranges || [
        { minHours: 0, maxHours: 100, ratePerOrder: 1.0 },
        { minHours: 101, maxHours: 200, ratePerOrder: 1.20 },
        { minHours: 201, maxHours: 300, ratePerOrder: 1.30 },
        { minHours: 301, maxHours: 400, ratePerOrder: 1.40 },
        { minHours: 401, maxHours: 999999, ratePerOrder: 1.50 },
      ];

      // Find the appropriate rate based on DAILY AVERAGE hours (not total hours)
      let ratePerOrder = 1.0;
      for (const range of ranges) {
        if (dailyAverageHours >= range.minHours && dailyAverageHours <= range.maxHours) {
          ratePerOrder = range.ratePerOrder;
          break;
        }
      }

      commission = totalOrders * ratePerOrder;
      commissionDetails = {
        totalHours,
        dailyAverageHours,
        workingDays,
        totalOrders,
        ratePerOrder,
        ranges,
        calculationNote: 'العمولة محسوبة بناءً على متوسط الساعات اليومي',
      };
      baseSalary = 0;
    } else if (salaryConfig.method === 'commission_type2') {
      // Commission Type 2: Percentage of rider receipts
      commissionType = 'type2';
      
      // Get performance data to calculate total receipts
      // Note: "المحفظة" column (column 8) contains debt, not receipts
      // For commission_type2, we need "إجمالي قبض المناديب"
      // TODO: Add a separate "receipts" or "total_collected" column to performance data
      // For now, we'll use orders * average_order_value as estimate
      let totalReceipts = 0;
      
      const { getSupervisorPerformanceFiltered } = await import('./dataFilter');
      const dailyData = await getSupervisorPerformanceFiltered(supervisorCode, startDate, endDate);
      
      // Calculate total receipts
      // Option 1: If there's a receipts column (column 9+), use it
      // Option 2: Use orders * average_order_value (default: 50 EGP per order)
      // Option 3: Use debt column as proxy (if it represents total sales, not just debt)
      for (const record of dailyData) {
        // For now, estimate: receipts = orders * 50 EGP average
        // This should be replaced with actual receipts data when a receipts column is added
        const estimatedReceipts = (record.orders || 0) * 50; // Placeholder
        totalReceipts += estimatedReceipts;
      }

      const basePercentage = salaryConfig.type2BasePercentage || 11;
      const supervisorPercentage = salaryConfig.type2SupervisorPercentage || 60;
      
      // Calculate: القيمة الأساسية = (إجمالي قبض المناديب) × 11%
      const baseValue = totalReceipts * (basePercentage / 100);
      // Calculate: عمولة المشرف = (القيمة الأساسية) × (النسبة المئوية للمشرف)
      commission = baseValue * (supervisorPercentage / 100);
      
      commissionDetails = {
        totalReceipts,
        basePercentage,
        supervisorPercentage,
        baseValue,
        note: 'يتم استخدام تقدير للقبض بناءً على الطلبات. يرجى إضافة عمود "إجمالي القبض" في ملف الأداء للحصول على حساب دقيق.',
      };
      baseSalary = 0;
    } else {
      // Legacy calculation (for backward compatibility)
      let multiplier = 1;
      if (totalHours >= 400) multiplier = 1.5;
      else if (totalHours >= 300) multiplier = 1.4;
      else if (totalHours >= 200) multiplier = 1.3;
      else if (totalHours >= 100) multiplier = 1.2;

      baseSalary = totalOrders * multiplier;
      commission = 0;
    }

    const totalSalary = baseSalary + commission;

    // Fetch deductions for the entire date range with details
    const deductionsDetails = await getSupervisorDeductionsDetails(supervisorCode, startDate, endDate);
    const advancesDetails = await getSupervisorAdvancesDetails(supervisorCode, startDate, endDate);
    const securityCost = await getSecurityInquiriesCost(supervisorCode, startDate, endDate);
    const equipmentDetails = await getEquipmentCostDetails(supervisorCode, startDate, endDate);
    
    const deductions = deductionsDetails.total;
    const advances = advancesDetails.total;
    const equipmentCost = equipmentDetails.totalCost;
    const bonus = await getBonus(supervisorCode, month, year); // Bonus still uses month/year

    const netSalary = totalSalary + bonus - deductions - advances - securityCost - equipmentCost;
    
    console.log(`[Salary] Calculation for ${supervisorCode}:`);
    console.log(`  Base/Commission: ${totalSalary}, Bonus: ${bonus}`);
    console.log(`  Deductions: ${deductions}, Advances: ${advances}, Security: ${securityCost}, Equipment: ${equipmentCost}`);
    console.log(`  Net Salary: ${netSalary}`);

    // Get daily breakdown for commission-based salary
    const breakdown: Array<{ date: string; orders: number; hours: number; multiplier: number; dailyCommission: number }> = [];
    
    if (salaryConfig.method !== 'fixed') {
      // Get daily performance data for breakdown
      const { getSupervisorPerformanceFiltered } = await import('./dataFilter');
      const dailyData = await getSupervisorPerformanceFiltered(supervisorCode, startDate, endDate);
      
      // Group by date
      const dataByDate = new Map<string, { orders: number; hours: number }>();
      dailyData.forEach((record) => {
        const dateStr = typeof record.date === 'string' ? record.date : new Date(record.date).toISOString().split('T')[0];
        const existing = dataByDate.get(dateStr) || { orders: 0, hours: 0 };
        dataByDate.set(dateStr, {
          orders: existing.orders + (record.orders || 0),
          hours: existing.hours + (record.hours || 0),
        });
      });

      // Create breakdown
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayData = dataByDate.get(dateStr) || { orders: 0, hours: 0 };
        const dailyMultiplier = 1; // Default multiplier
        const commissionRate = supervisor?.salaryAmount || salaryConfig.commissionRate || 0;
        const dailyCommission = (dayData.orders * dayData.hours) * commissionRate;

        breakdown.push({
          date: dateStr,
          orders: dayData.orders,
          hours: dayData.hours,
          multiplier: dailyMultiplier,
          dailyCommission,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Return in the format expected by the UI
    return {
      supervisorId: supervisorCode,
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      salaryMethod: salaryConfig.method === 'fixed' ? 'fixed' : 'commission',
      baseAmount: baseSalary + commission, // Total salary amount
      commission: (commissionType || salaryConfig.method !== 'fixed') ? {
        type: commissionType || 'type1',
        totalOrders,
        totalHours,
        // Add commissionRate for UI compatibility
        commissionRate: commissionDetails?.ratePerOrder || 0,
        dailyAverageHours: commissionDetails?.dailyAverageHours || 0,
        workingDays: commissionDetails?.workingDays || 0,
        calculatedCommission: commission,
        details: commissionDetails,
      } : undefined,
      deductions: {
        advances,
        advancesDetails: advancesDetails.items,
        deductions,
        deductionsDetails: deductionsDetails.items,
        equipment: equipmentCost,
        equipmentDetails: equipmentDetails.items,
        security: securityCost,
        performance: 0,
        total: deductions + advances + securityCost + equipmentCost,
      },
      netSalary,
      breakdown,
    };
  } catch (error) {
    console.error('Error calculating supervisor salary:', error);
    throw error;
  }
}


