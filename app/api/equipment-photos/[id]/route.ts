import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { loadEquipmentPhoto } from '@/lib/equipmentPhotoStorage';
import { verifyPhotoSignature } from '@/lib/photoAccess';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const photoId = decodeURIComponent(context.params.id || '').trim();
    if (!photoId || !/^eq-[\w-]+$/.test(photoId)) {
      return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 });
    }

    const sig = request.nextUrl.searchParams.get('sig');
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
    const authed = !!(token && verifyToken(token));
    const sigOk = verifyPhotoSignature(photoId, sig);

    if (!authed && !sigOk) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const loaded = await loadEquipmentPhoto(photoId);
    if (!loaded) {
      return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(loaded.buffer), {
      status: 200,
      headers: {
        'Content-Type': loaded.mimeType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('[equipment-photos GET]', error);
    return NextResponse.json({ error: error.message || 'خطأ' }, { status: 500 });
  }
}
