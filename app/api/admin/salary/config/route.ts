/**
 * Salary Configuration API
 * Admin can configure supervisor salary settings
 * Stores in Google Sheets "المشرفين" sheet
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData, updateSheetRange } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      supervisorId, 
      salaryMethod, 
      fixedSalary, 
      type1Ranges,
      type2BasePercentage,
      type2SupervisorPercentage
    } = body;

    if (!supervisorId) {
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }

    if (!salaryMethod || !['fixed', 'commission_type1', 'commission_type2'].includes(salaryMethod)) {
      return NextResponse.json({ success: false, error: 'نوع الراتب غير صحيح' }, { status: 400 });
    }

    // Use dedicated sheet for salary configs
    const { appendToSheet, ensureSheetExists } = await import('@/lib/googleSheets');
    
    try {
      // Ensure sheet exists with headers
      const headers = ['كود المشرف', 'نوع الراتب', 'الراتب الثابت', 'نطاقات النوع الأول', 'النسبة الأساسية', 'نسبة المشرف'];
      await ensureSheetExists('إعدادات_الرواتب', headers);
      
      // Get existing configs
      let configData: any[][] = [];
      try {
        const sheetData = await getSheetData('إعدادات_الرواتب', false);
        configData = Array.isArray(sheetData) ? (sheetData as any[][]) : [];
      } catch (error) {
        console.error('Error getting salary config data:', error);
        configData = [];
      }

      // Find if config exists
      let existingRowIndex = -1;
      const supervisorIdTrimmed = supervisorId.toString().trim();
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0]?.toString().trim() === supervisorIdTrimmed) {
          existingRowIndex = i + 1; // Google Sheets is 1-indexed
          break;
        }
      }

      // Prepare config row
      const configRow = [
        supervisorIdTrimmed, // Column A: Supervisor Code
        salaryMethod, // Column B: Method (fixed, commission_type1, commission_type2)
        salaryMethod === 'fixed' ? (fixedSalary || 0) : '', // Column C: Fixed Amount
        salaryMethod === 'commission_type1' ? JSON.stringify(type1Ranges || []) : '', // Column D: Type1 Ranges
        salaryMethod === 'commission_type2' ? (type2BasePercentage || 11) : '', // Column E: Type2 Base %
        salaryMethod === 'commission_type2' ? (type2SupervisorPercentage || 60) : '', // Column F: Type2 Supervisor %
      ];

      if (existingRowIndex > 0) {
        // Update existing row
        const { updateSheetRow } = await import('@/lib/googleSheets');
        await updateSheetRow('إعدادات_الرواتب', existingRowIndex, configRow);
      } else {
        // Append new row
        await appendToSheet('إعدادات_الرواتب', [configRow], false);
      }

      // Also update the supervisor's salaryType in المشرفين sheet
      try {
        const { updateSupervisor } = await import('@/lib/adminService');
        const updateResult = await updateSupervisor(supervisorIdTrimmed, {
          salaryType: salaryMethod as 'fixed' | 'commission_type1' | 'commission_type2',
          salaryAmount: salaryMethod === 'fixed' ? fixedSalary : undefined,
        });
        
        if (!updateResult.success) {
          console.error(`[SalaryConfig] Failed to update supervisor salaryType: ${updateResult.error}`);
          // Continue anyway - the config is saved in إعدادات_الرواتب sheet
        } else {
          console.log(`[SalaryConfig] Successfully updated supervisor "${supervisorIdTrimmed}" salaryType to "${salaryMethod}"`);
        }
      } catch (updateError: any) {
        console.error(`[SalaryConfig] Error updating supervisor:`, updateError);
        // Continue - config is saved in إعدادات_الرواتب sheet
      }

      return NextResponse.json({
        success: true,
        message: 'تم حفظ إعدادات الراتب بنجاح',
        config: {
          supervisorId,
          salaryMethod,
          fixedSalary,
          type1Ranges,
          type2BasePercentage,
          type2SupervisorPercentage,
        },
      });
    } catch (error: any) {
      console.error('Error saving salary config:', error);
      return NextResponse.json({ 
        success: false, 
        error: error.message || 'حدث خطأ في حفظ الإعدادات' 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Salary config error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supervisorId = searchParams.get('supervisorId');

    // Get supervisors sheet
    const supervisorsData = await getSheetData('المشرفين', false);

    if (supervisorId) {
      // Get specific supervisor config from إعدادات_الرواتب sheet
      let configData: any[][] = [];
      try {
        const sheetData = await getSheetData('إعدادات_الرواتب', false);
        configData = Array.isArray(sheetData) ? (sheetData as any[][]) : [];
      } catch (error) {
        // Sheet doesn't exist, return default
        return NextResponse.json({
          success: true,
          data: {
            supervisorId,
            salaryMethod: 'fixed',
            fixedSalary: 0,
          },
        });
      }

      for (let i = 1; i < configData.length; i++) {
        const row = configData[i];
        if (row[0]?.toString().trim() === supervisorId) {
          const method = row[1]?.toString().trim() || 'fixed';
          const fixedAmount = parseFloat(row[2]?.toString() || '0');
          
          let type1Ranges = null;
          if (row[3]) {
            try {
              type1Ranges = JSON.parse(row[3].toString());
            } catch {
              type1Ranges = null;
            }
          }

          const type2BasePercentage = row[4] ? parseFloat(row[4].toString()) : 11;
          const type2SupervisorPercentage = row[5] ? parseFloat(row[5].toString()) : 60;

          return NextResponse.json({
            success: true,
            data: {
              supervisorId,
              salaryMethod: method,
              fixedSalary: method === 'fixed' ? fixedAmount : undefined,
              type1Ranges: method === 'commission_type1' ? (type1Ranges || [
                { minHours: 0, maxHours: 100, ratePerOrder: 1.0 },
                { minHours: 101, maxHours: 200, ratePerOrder: 1.20 },
                { minHours: 201, maxHours: 300, ratePerOrder: 1.30 },
                { minHours: 301, maxHours: 400, ratePerOrder: 1.40 },
                { minHours: 401, maxHours: 999999, ratePerOrder: 1.50 },
              ]) : undefined,
              type2BasePercentage: method === 'commission_type2' ? type2BasePercentage : undefined,
              type2SupervisorPercentage: method === 'commission_type2' ? type2SupervisorPercentage : undefined,
            },
          });
        }
      }

      // Config not found, return default
      return NextResponse.json({
        success: true,
        data: {
          supervisorId,
          salaryMethod: 'fixed',
          fixedSalary: 0,
        },
      });
    } else {
      // Get all configs (admin only)
      if (decoded.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
      }

      const configs: any[] = [];
      for (let i = 1; i < supervisorsData.length; i++) {
        const row = supervisorsData[i];
        if (!row[0]) continue;

        const salaryType = row[5]?.toString().trim() || '';
        const salaryAmount = row[6] ? parseFloat(row[6].toString()) : 0;
        const formulaStr = row[7]?.toString().trim() || '';

        let hoursMultipliers;
        try {
          hoursMultipliers = formulaStr ? JSON.parse(formulaStr) : null;
        } catch {
          hoursMultipliers = null;
        }

        configs.push({
          supervisorId: row[0].toString().trim(),
          salaryMethod: salaryType === 'ثابت' ? 'fixed' : 'commission',
          fixedSalary: salaryType === 'ثابت' ? salaryAmount : undefined,
          commissionRate: salaryType === 'عمولة' ? salaryAmount : undefined,
          hoursMultipliers: hoursMultipliers || [
            { minHours: 0, maxHours: 4, multiplier: 0.8 },
            { minHours: 4, maxHours: 6, multiplier: 1.0 },
            { minHours: 6, maxHours: 8, multiplier: 1.2 },
            { minHours: 8, maxHours: 24, multiplier: 1.5 },
          ],
        });
      }

      return NextResponse.json({
        success: true,
        data: configs,
      });
    }
  } catch (error: any) {
    console.error('Get salary config error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

