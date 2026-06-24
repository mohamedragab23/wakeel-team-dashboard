import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { logStructured } from '@/lib/requestTrace';
import { getAllRiders, getAllSupervisors } from '@/lib/adminService';
import { buildSupervisorJoinDateAlerts } from '@/lib/riderMetadataNotifications';
import { notifySupervisorsMissingJoinDate } from '@/lib/supervisorNotifier';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!isCronAuthorized(req)) {
      logStructured('warn', 'cron_unauthorized', { route: 'rider-metadata-reminder' });
      return NextResponse.json({ success: false, error: 'Unauthorized cron' }, { status: 401 });
    }

    const [allRiders, supervisors] = await Promise.all([
      getAllRiders(false),
      getAllSupervisors(false),
    ]);

    const supervisorNameByCode = new Map(
      supervisors.map((s) => [String(s.code ?? '').trim(), s.name || String(s.code ?? '').trim()])
    );

    const alerts = buildSupervisorJoinDateAlerts(allRiders, supervisorNameByCode);
    const notify = await notifySupervisorsMissingJoinDate(alerts);

    return NextResponse.json({
      success: true,
      supervisorsWithMissingJoinDate: alerts.length,
      totalRidersMissingJoinDate: alerts.reduce((sum, a) => sum + a.missingJoinDateCount, 0),
      notify,
      envCheck: {
        hasTelegramBotToken: !!process.env.TELEGRAM_BOT_TOKEN?.trim(),
        hasWhatsApp: !!(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
        hasEmailResend: !!(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Cron failed';
    console.error('[api/cron/rider-metadata-reminder]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
