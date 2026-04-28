import { getSheetData, findDataInSheet } from './googleSheets';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthResult {
  success: boolean;
  error?: string;
  code?: string;
  name?: string;
  region?: string;
  email?: string;
  permissions?: string;
  role?: 'supervisor' | 'admin';
  token?: string;
}

// Authenticate supervisor
export async function authenticateSupervisor(code: string, password: string): Promise<AuthResult> {
  try {
    const supervisorsData = await getSheetData('المشرفين');

    if (supervisorsData.length === 0) {
      return {
        success: false,
        error: 'ورقة المشرفين غير موجودة أو فارغة في قاعدة البيانات',
      };
    }

    for (let i = 1; i < supervisorsData.length; i++) {
      const row = supervisorsData[i];

      if (!row[0] || row[0].toString().trim() === '') continue;

      const supervisorCode = row[0].toString().trim();
      const supervisorName = row[1] ? row[1].toString().trim() : '';
      const supervisorRegion = row[2] ? row[2].toString().trim() : '';
      const supervisorEmail = row[3] ? row[3].toString().trim() : '';
      const supervisorPassword = row[4] ? row[4].toString().trim() : '';

      if (supervisorCode === code) {
        if (supervisorPassword === password) {
          const token = jwt.sign(
            {
              code: supervisorCode,
              name: supervisorName,
              role: 'supervisor',
            },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          return {
            success: true,
            code: supervisorCode,
            name: supervisorName,
            region: supervisorRegion,
            email: supervisorEmail,
            role: 'supervisor',
            token,
          };
        } else {
          return {
            success: false,
            error: 'كلمة المرور غير صحيحة',
          };
        }
      }
    }

    return {
      success: false,
      error: 'كود المشرف غير مسجل في النظام',
    };
  } catch (error: any) {
    return {
      success: false,
      error: 'حدث خطأ في النظام: ' + error.toString(),
    };
  }
}

// Authenticate admin
export async function authenticateAdmin(code: string, password: string): Promise<AuthResult> {
  try {
    const explicitSpreadsheetId =
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || process.env.GOOGLE_SHEETS_007SUP_SPREADSHEET_ID?.trim();
    const hasJsonCreds = !!(
      process.env.GOOGLE_SHEETS_007SUP_CREDENTIALS_JSON?.trim() || process.env.GOOGLE_CREDENTIALS_JSON?.trim()
    );
    const hasPathCreds = !!(
      process.env.GOOGLE_SHEETS_007SUP_CREDENTIALS_PATH?.trim() ||
      process.env.GOOGLE_SHEETS_MAIN_CREDENTIALS_PATH?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim()
    );
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    const hasClassicCreds = !!(serviceEmail && privateKey);
    const hasAnyCreds = hasJsonCreds || hasPathCreds || hasClassicCreds;

    if (!explicitSpreadsheetId || !hasAnyCreds) {
      const missing: string[] = [];
      if (!explicitSpreadsheetId) missing.push('GOOGLE_SHEETS_SPREADSHEET_ID أو GOOGLE_SHEETS_007SUP_SPREADSHEET_ID');
      if (!hasAnyCreds) {
        missing.push(
          'أحد خيارات حساب الخدمة: GOOGLE_SHEETS_007SUP_CREDENTIALS_JSON أو GOOGLE_SHEETS_007SUP_CREDENTIALS_PATH أو GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY'
        );
      }

      return {
        success: false,
        error:
          'إعدادات Google Sheets ناقصة على السيرفر. المتغيرات المفقودة: ' +
          missing.join('؛ ') +
          '. قم بإضافتها في Vercel Environment Variables ثم أعد النشر.',
      };
    }

    // Be tolerant to common Admins sheet naming differences.
    // Note: getSheetData returns [] on *any* read error (missing sheet, wrong spreadsheet ID,
    // missing permissions, invalid service account key, etc).
    const adminSheetCandidates = ['Admins', 'Admin', 'admins', 'admin', 'الأدمن', 'الادمن'];
    let adminsData: any[][] = [];
    let usedSheetName: string | null = null;

    for (const candidate of adminSheetCandidates) {
      const data = await getSheetData(candidate);
      if (data.length > 0) {
        adminsData = data;
        usedSheetName = candidate;
        break;
      }
    }

    // If admin sheet can't be read, return a diagnostic error (don't auto-create to avoid side effects)
    if (adminsData.length === 0) {
      return {
        success: false,
        error:
          'تعذر قراءة ورقة الأدمن. تأكد أن اسم التبويب أحد القيم التالية: ' +
          adminSheetCandidates.join(' / ') +
          '، وتأكد أن معرف الملف (GOOGLE_SHEETS_SPREADSHEET_ID أو GOOGLE_SHEETS_007SUP_SPREADSHEET_ID) صحيح وأن حساب الخدمة لديه صلاحية على الملف.',
      };
    }

    for (let i = 1; i < adminsData.length; i++) {
      const row = adminsData[i];

      if (!row[0] || row[0].toString().trim() === '') continue;

      const adminCode = row[0].toString().trim();
      const adminName = row[1] ? row[1].toString().trim() : '';
      const adminPassword = row[2] ? row[2].toString().trim() : '';
      const adminPermissions = row[3] ? row[3].toString().trim() : '';

      if (adminCode === code) {
        if (adminPassword === password) {
          const token = jwt.sign(
            {
              code: adminCode,
              name: adminName,
              role: 'admin',
            },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          return {
            success: true,
            code: adminCode,
            name: adminName,
            permissions: adminPermissions,
            role: 'admin',
            token,
          };
        } else {
          return {
            success: false,
            error: 'كلمة المرور غير صحيحة',
          };
        }
      }
    }

    return {
      success: false,
      error: usedSheetName
        ? `كود الأدمن غير مسجل في النظام (تمت القراءة من تبويب: ${usedSheetName})`
        : 'كود الأدمن غير مسجل في النظام',
    };
  } catch (error: any) {
    return {
      success: false,
      error: 'حدث خطأ في النظام: ' + error.toString(),
    };
  }
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

