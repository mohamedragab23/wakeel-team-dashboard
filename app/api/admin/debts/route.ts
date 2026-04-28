import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSupervisorDebts } from '@/lib/adminService';
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

    // If admin, return all debts
    // If supervisor, return only their riders' debts
    const { searchParams } = new URL(request.url);
    const supervisorCode = searchParams.get('supervisorCode');

    try {
      if (decoded.role === 'admin' && supervisorCode) {
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
        const debts = debtsData.length > 1 
          ? debtsData.slice(1)
              .filter((row) => row && row[0]) // Filter out empty rows
              .map((row) => ({
                riderCode: row[0]?.toString().trim() || '',
                amount: parseFloat(row[1]?.toString() || '0') || 0,
                date: row[2]?.toString().trim() || undefined,
                notes: row[3]?.toString().trim() || undefined,
              }))
          : [];

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

