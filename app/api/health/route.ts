import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** للتحقق أن خادم Next يعمل: افتح GET /api/health في المتصفح */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'next', time: new Date().toISOString() });
}
