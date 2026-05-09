import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllSupervisors } from '@/lib/adminService';

export const dynamic = 'force-dynamic';

/** Minimal name+region for UI filters (no passwords). */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const supervisors = await getAllSupervisors(false);
    const data = supervisors.map((s) => ({
      name: (s.name || '').trim(),
      region: (s.region || '').trim(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[supervisor-zone-map]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
