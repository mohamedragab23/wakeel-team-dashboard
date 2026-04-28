/**
 * Sync API - Manual sync trigger
 * Syncs system database to Google Sheets
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { syncEngine } from '@/lib/syncEngine';

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
    const { type } = body; // 'riders' | 'performance' | 'debts' | 'all'

    let result;

    if (type === 'riders') {
      result = await syncEngine.syncRidersToSheets();
    } else if (type === 'performance') {
      result = await syncEngine.syncPerformanceToSheets();
    } else if (type === 'debts') {
      result = await syncEngine.syncDebtsToSheets();
    } else if (type === 'all') {
      result = await syncEngine.fullSystemSync();
    } else {
      return NextResponse.json({ success: false, error: 'نوع المزامنة غير صحيح' }, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      message: 'تمت المزامنة بنجاح',
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

