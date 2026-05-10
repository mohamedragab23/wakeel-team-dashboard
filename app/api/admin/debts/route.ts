import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getAllRiders } from '@/lib/adminService';
import { getSupervisorCodesInZoneScope } from '@/lib/adminZoneScope';
import { getSupervisorDebtsFiltered } from '@/lib/dataFilter';

export const dynamic = 'force-dynamic';

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

    if (decoded.role === 'admin') {
      const db = assertAdminApiAccess(decoded, 'debts');
      if (db) return db;
    }

    // If admin, return all debts
    // If supervisor, return only their riders' debts
    const { searchParams } = new URL(request.url);
    const supervisorCode = searchParams.get('supervisorCode');

    try {
      if (decoded.role === 'admin' && supervisorCode) {
        const z = await getSupervisorCodesInZoneScope(decoded);
        if (z && !z.has(String(supervisorCode).trim())) {
          return NextResponse.json(
            { success: false, error: 'لا تملك صلاحية على مشرفين خارج الزونات المحددة لك' },
            { status: 403 }
          );
        }
        // Use optimized filtering
        const debts = await getSupervisorDebtsFiltered(supervisorCode);
        return NextResponse.json({ success: true, data: debts });
      } else if (decoded.role === 'supervisor') {
        // Use optimized filtering
        const debts = await getSupervisorDebtsFiltered(decoded.code);
        return NextResponse.json({ success: true, data: debts });
      } else if (decoded.role === 'admin') {
        // Return all debts for admin
        const { getDebtsSheet } = await import('@/lib/adminService');
        let debtsData: any[][];
        
        try {
          debtsData = await getDebtsSheet();
        } catch (error) {
          // Sheet might not exist, return empty array
          console.warn('Debts sheet not found, returning empty array');
          return NextResponse.json({ success: true, data: [] });
        }

        // Skip header row and process data
        let rawRows =
          debtsData.length > 1 ? debtsData.slice(1).filter((row) => row && row[0]) : [];

        const zAll = await getSupervisorCodesInZoneScope(decoded);
        if (zAll) {
          const allRiders = await getAllRiders(false);
          const riderToSup = new Map(
            allRiders.map((r) => [String(r.code ?? '').trim(), String(r.supervisorCode ?? '').trim()])
          );
          rawRows = rawRows.filter((row) => {
            const rc = row[0]?.toString().trim() || '';
            const sup = riderToSup.get(rc) || '';
            return Boolean(sup && zAll.has(sup));
          });
        }

        const debts = rawRows.map((row) => ({
          riderCode: row[0]?.toString().trim() || '',
          amount: parseFloat(row[1]?.toString() || '0') || 0,
          date: row[2]?.toString().trim() || undefined,
          notes: row[3]?.toString().trim() || undefined,
        }));

        return NextResponse.json({ success: true, data: debts });
      }
    } catch (error: any) {
      console.error('Error fetching debts:', error);
      // Return empty array instead of error to prevent crashes
      return NextResponse.json({ success: true, data: [], warning: 'حدث خطأ في جلب البيانات' });
    }

    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

