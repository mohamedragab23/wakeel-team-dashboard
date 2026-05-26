import { NextRequest, NextResponse } from 'next/server';
import { loadEquipmentPhoto } from '@/lib/equipmentPhotoStorage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const photoId = decodeURIComponent(context.params.id || '').trim();
    if (!photoId || !/^eq-[\w-]+$/.test(photoId)) {
      return NextResponse.json({ error: 'معرف غير صالح' }, { status: 400 });
    }

    const loaded = await loadEquipmentPhoto(photoId);
    if (!loaded) {
      return NextResponse.json({ error: 'الصورة غير موجودة' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(loaded.buffer), {
      status: 200,
      headers: {
        'Content-Type': loaded.mimeType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error: any) {
    console.error('[equipment-photos GET]', error);
    return NextResponse.json({ error: error.message || 'خطأ' }, { status: 500 });
  }
}
