import { NextRequest, NextResponse } from 'next/server';
import { analyzeLegacyShifts } from '@/lib/shiftsLegacyAnalyze';
import { exportRoosterCsv, buildDefaultExportRangeNowCairo } from '@/lib/roosterExport';
import { notifySupervisorsShiftSummary } from '@/lib/supervisorNotifier';

export const dynamic = 'force-dynamic';

function isAuthorizedCron(req: NextRequest): boolean {
  // 1) Vercel Cron header
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron) return true;

  // 2) Shared secret (optional, recommended for manual triggering)
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const headerSecret = req.headers.get('x-cron-secret')?.trim();
  const querySecret = new URL(req.url).searchParams.get('secret')?.trim();
  return headerSecret === secret || querySecret === secret;
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
    }

    const cityLabel = (process.env.ROOSTER_CITY || 'Alexandria').trim();
    const cityId = (process.env.ROOSTER_CITY_ID || '').trim();
    if (!cityId) {
      return NextResponse.json({ success: false, error: 'Missing env: ROOSTER_CITY_ID' }, { status: 500 });
    }
    const { startDate, endDate } = buildDefaultExportRangeNowCairo();

    const exported = await exportRoosterCsv({ cityId, cityLabel, startDate, endDate });

    const analyzed = await analyzeLegacyShifts({
      viewer: { role: 'admin', name: 'cron' },
      files: [{ name: exported.filename, bytes: exported.bytes }],
      rangeStart: startDate,
      rangeEnd: endDate,
      selectedDates: [],
    });

    const summaryForToday = analyzed.reports?.supervisorSummaryByDate?.[startDate] || [];

    const notifyResult = summaryForToday.length
      ? await notifySupervisorsShiftSummary({
          date: startDate,
          cityLabel,
          summaryBySupervisor: summaryForToday.map((r: any) => ({
            supervisor: String(r.supervisor || '').trim(),
            date: startDate,
            total: Number(r.total || 0),
            booked: Number(r.booked || 0),
            notBooked: Number(r.notBooked || 0),
            pct: Number(r.pct || 0),
            totalBookedHours: Number(r.totalBookedHours || 0),
          })),
        })
      : { sent: 0, skipped: [], failed: [{ supervisor: '*', error: 'No supervisors summary for today' }] };

    return NextResponse.json({
      success: true,
      cityLabel,
      range: { startDate, endDate },
      exported: { filename: exported.filename, bytes: exported.bytes.byteLength },
      analysis: {
        datesUsed: analyzed.datesUsed,
        totalEmployees: analyzed.metrics?.totalEmployees ?? null,
        booked: analyzed.metrics?.booked ?? null,
        notBooked: analyzed.metrics?.notBooked ?? null,
        supervisorsCount: Array.isArray(summaryForToday) ? summaryForToday.length : 0,
      },
      envCheck: {
        hasTelegramBotToken: !!process.env.TELEGRAM_BOT_TOKEN?.trim(),
        hasTelegramDefaultChatId: !!process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim(),
        hasWhatsApp: !!(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
        hasEmailResend: !!(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()),
      },
      notify: notifyResult,
    });
  } catch (error: any) {
    console.error('[api/cron/rooster-sync]', error);
    return NextResponse.json({ success: false, error: error?.message || 'Cron failed' }, { status: 500 });
  }
}

