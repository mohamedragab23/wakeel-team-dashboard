import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import {
  applyPerformanceImport,
  buildPerformanceImportPreview,
} from '@/lib/performanceFileImport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function authAdmin(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'admin') {
    return { error: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  const deny = assertAdminApiAccess(decoded, 'performance_upload');
  if (deny) return { error: deny };
  return { decoded };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authAdmin(request);
    if (auth.error) return auth.error;

    const formData = await request.formData();
    const action = String(formData.get('action') ?? 'preview').trim();
    const dateIso = String(formData.get('date') ?? '').trim();
    const forceReplace = formData.get('forceReplace') === 'true' || formData.get('forceReplace') === '1';
    const skipQualityBlock =
      formData.get('skipQualityBlock') === 'true' || formData.get('skipQualityBlock') === '1';

    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return NextResponse.json({ success: false, error: 'تاريخ الأداء مطلوب (YYYY-MM-DD)' }, { status: 400 });
    }

    const perfFile = formData.get('performanceFile');
    if (!(perfFile instanceof File) || perfFile.size === 0) {
      return NextResponse.json({ success: false, error: 'ملف الأداء (Excel من Tableau) مطلوب' }, { status: 400 });
    }

    const perfBuffer = await perfFile.arrayBuffer();
    const codFile = formData.get('codFile');
    const codBuffer =
      codFile instanceof File && codFile.size > 0 ? await codFile.arrayBuffer() : undefined;

    if (action === 'preview') {
      const preview = await buildPerformanceImportPreview(dateIso, perfBuffer, codBuffer);
      return NextResponse.json({ success: true, preview });
    }

    if (action === 'apply') {
      const result = await applyPerformanceImport(dateIso, perfBuffer, {
        codBuffer,
        forceReplace,
        skipQualityBlock,
      });
      return NextResponse.json({
        success: true,
        message: `تم حفظ أداء ${dateIso}: ${result.written} مندوب (حُذف ${result.deleted} سجل قديم)`,
        ...result,
      });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const isConflict = msg.includes('موجود مسبقاً');
    return NextResponse.json({ success: false, error: msg }, { status: isConflict ? 409 : 500 });
  }
}
