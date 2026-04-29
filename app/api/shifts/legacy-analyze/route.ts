import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { analyzeLegacyShifts } from '@/lib/shiftsLegacyAnalyze';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token) as { role?: 'supervisor' | 'admin'; name?: string } | null;
    if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files');
    const fileList = files.filter((f) => f instanceof File) as File[];
    if (!fileList.length) return NextResponse.json({ success: false, error: 'لم يُرفع ملف' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const rangeStart = String(searchParams.get('start') || '').trim(); // YYYY-MM-DD
    const rangeEnd = String(searchParams.get('end') || '').trim(); // YYYY-MM-DD
    const selectedDates = (searchParams.getAll('dates') || []).map((d) => String(d || '').trim()).filter(Boolean);

    const analyzed = await analyzeLegacyShifts({
      viewer: { role: decoded.role, name: decoded.name || '' },
      files: await Promise.all(fileList.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() }))),
      rangeStart,
      rangeEnd,
      selectedDates,
    });

    return NextResponse.json({ success: true, ...analyzed });
  } catch (error: any) {
    console.error('[api/shifts/legacy-analyze]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}

