import { getSupervisorContacts } from '@/lib/supervisorContacts';
import { renderSupervisorSummaryPng } from '@/lib/supervisorSummaryImage';
import { Buffer } from 'buffer';

export type SupervisorShiftSummary = {
  supervisor: string;
  date: string; // YYYY-MM-DD
  total: number;
  booked: number;
  notBooked: number;
  pct: number;
  totalBookedHours: number;
};

function norm(v: any): string {
  return String(v ?? '').trim();
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtmlEmail(params: { date: string; cityLabel: string; rows: SupervisorShiftSummary[] }): string {
  const { date, cityLabel, rows } = params;
  const safeCity = htmlEscape(cityLabel || '—');
  const safeDate = htmlEscape(date);

  const tr = (cells: string[]) => `<tr>${cells.map((c) => `<td style="padding:8px;border:1px solid #2a2f3a;">${c}</td>`).join('')}</tr>`;
  const th = (cells: string[]) =>
    `<tr>${cells
      .map(
        (c) =>
          `<th style="padding:8px;border:1px solid #2a2f3a;text-align:right;background:#141823;color:#eaf0ff;">${c}</th>`
      )
      .join('')}</tr>`;

  const header = th(['المشرف', 'الإجمالي', 'الحاجزين', 'غير الحاجزين', 'نسبة الحاجزين', 'إجمالي ساعات الحاجزين']);
  const body = rows
    .map((r) =>
      tr([
        htmlEscape(r.supervisor),
        String(r.total),
        String(r.booked),
        String(r.notBooked),
        `${Number(r.pct || 0).toFixed(1)}%`,
        Number(r.totalBookedHours || 0).toFixed(2),
      ])
    )
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;background:#0b0f19;color:#eaf0ff;font-family:Arial, sans-serif;">
    <div style="max-width:720px;margin:0 auto;padding:16px 16px 24px;">
      <h2 style="margin:0 0 8px;font-size:18px;">ملخص الشفتات — ${safeDate}</h2>
      <div style="margin:0 0 12px;font-size:13px;color:rgba(234,240,255,0.75);">
        المحافظة/المدينة: <b style="color:#eaf0ff;">${safeCity}</b>
      </div>
      <div style="border:1px solid #2a2f3a;border-radius:10px;overflow:hidden;background:#0f121c;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>${header}</thead>
          <tbody>${body || tr(['—', '—', '—', '—', '—', '—'])}</tbody>
        </table>
      </div>
      <div style="margin-top:12px;font-size:12px;color:rgba(234,240,255,0.65);">
        تم إنشاء هذه الرسالة تلقائيًا من نظام الشفتات كل ساعة.
      </div>
    </div>
  </body>
</html>`;
}

async function sendViaResend(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY و RESEND_FROM_EMAIL غير مُعرّفين.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Resend failed: ${res.status} ${t}`.trim());
  }
}

export async function notifySupervisorsShiftSummary(params: {
  date: string;
  cityLabel: string;
  summaryBySupervisor: SupervisorShiftSummary[];
}) {
  const { date, cityLabel, summaryBySupervisor } = params;
  const contacts = await getSupervisorContacts();
  const byName = new Map(contacts.map((c) => [norm(c.name).toLowerCase(), c]));

  const title = `ملخص الشفتات — ${date} — ${cityLabel || '—'}`;
  const imageTitle = `Shifts summary — ${cityLabel || '—'} — ${date}`;
  const defaultTelegramChatId = process.env.TELEGRAM_DEFAULT_CHAT_ID?.trim();
  const linesFor = (r: SupervisorShiftSummary) => {
    const pct = `${Number(r.pct || 0).toFixed(1)}%`;
    const hrs = Number(r.totalBookedHours || 0).toFixed(2);
    return [
      `*${r.supervisor}*`,
      `التاريخ: ${date}`,
      `الإجمالي: ${r.total}`,
      `الحاجزين: ${r.booked}`,
      `غير الحاجزين: ${r.notBooked}`,
      `نسبة الحاجزين: ${pct}`,
      `إجمالي ساعات الحاجزين: ${hrs}`,
    ].join('\n');
  };

  const preferWhatsApp = !!(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
  const preferTelegram = !!(process.env.TELEGRAM_BOT_TOKEN?.trim());
  const preferEmail = !!(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());

  let sent = 0;
  const skipped: Array<{ supervisor: string; reason: string }> = [];
  const failed: Array<{ supervisor: string; error: string }> = [];

  // If a default (group) chat is configured, send one consolidated message and stop.
  if (preferTelegram && defaultTelegramChatId) {
    const png = await renderSupervisorSummaryPng({
      title: imageTitle,
      date,
      cityLabel,
      rows: summaryBySupervisor,
    });
    await sendViaTelegramPhoto({
      chatId: defaultTelegramChatId,
      caption: imageTitle,
      pngBytes: png,
    });
    return { sent: 1, skipped: [], failed: [] };
  }

  for (const row of summaryBySupervisor) {
    const c = byName.get(norm(row.supervisor).toLowerCase());
    if (!c) {
      skipped.push({ supervisor: row.supervisor, reason: 'المشرف غير موجود في جدول المشرفين أو الاسم غير مطابق' });
      continue;
    }

    // 1) WhatsApp Cloud API
    if (preferWhatsApp) {
      if (!c.phoneE164) {
        skipped.push({ supervisor: row.supervisor, reason: 'لا يوجد رقم واتساب (E.164) في جدول المشرفين' });
      } else {
        try {
          await sendViaWhatsAppCloud({
            toE164: c.phoneE164,
            body: `${title}\n\n${linesFor(row)}`,
          });
          sent += 1;
          continue;
        } catch (e: any) {
          failed.push({ supervisor: row.supervisor, error: e?.message || String(e) });
          continue;
        }
      }
    }

    // 2) Telegram
    if (preferTelegram) {
      const chatId = c.telegramChatId || defaultTelegramChatId;
      if (!chatId) {
        skipped.push({ supervisor: row.supervisor, reason: 'لا يوجد Telegram Chat ID في جدول المشرفين' });
      } else {
        try {
          await sendViaTelegram({
            chatId,
            text: `${title}\n\n${linesFor(row)}`,
          });
          sent += 1;
          continue;
        } catch (e: any) {
          failed.push({ supervisor: row.supervisor, error: e?.message || String(e) });
          continue;
        }
      }
    }

    // 3) Email (fallback)
    if (preferEmail) {
      if (!c.email) {
        skipped.push({ supervisor: row.supervisor, reason: 'لا يوجد بريد في جدول المشرفين' });
        continue;
      }

      const html = buildHtmlEmail({
        date,
        cityLabel,
        rows: [
          {
            supervisor: row.supervisor,
            date,
            total: row.total,
            booked: row.booked,
            notBooked: row.notBooked,
            pct: row.pct,
            totalBookedHours: row.totalBookedHours,
          },
        ],
      });

      try {
        await sendViaResend({ to: c.email, subject: title, html });
        sent += 1;
        continue;
      } catch (e: any) {
        failed.push({ supervisor: row.supervisor, error: e?.message || String(e) });
        continue;
      }
    }

    failed.push({
      supervisor: row.supervisor,
      error:
        'لا توجد قناة إرسال مفعلة. فعّل WhatsApp (WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID) أو Telegram (TELEGRAM_BOT_TOKEN) أو Email (RESEND_*).',
    });
  }

  return { sent, skipped, failed };
}

async function sendViaWhatsAppCloud(params: { toE164: string; body: string }) {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) throw new Error('WhatsApp is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');

  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: params.toE164.replace(/^\+/, ''), // Graph API expects numeric string
      type: 'text',
      text: { body: params.body },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`WhatsApp send failed: ${res.status} ${t}`.trim());
  }
}

async function sendViaTelegram(params: { chatId: string; text: string }) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Telegram is not configured (TELEGRAM_BOT_TOKEN).');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Telegram send failed: ${res.status} ${t}`.trim());
  }
}

async function sendViaTelegramPhoto(params: { chatId: string; caption: string; pngBytes: Uint8Array }) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Telegram is not configured (TELEGRAM_BOT_TOKEN).');

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  const fd = new FormData();
  fd.append('chat_id', params.chatId);
  fd.append('caption', params.caption);
  const buf = Buffer.from(params.pngBytes);
  fd.append('photo', new Blob([buf as any], { type: 'image/png' }), 'supervisors-summary.png');

  const res = await fetch(url, {
    method: 'POST',
    body: fd as any,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Telegram sendPhoto failed: ${res.status} ${t}`.trim());
  }
}

function buildGroupSummaryText(params: { title: string; rows: SupervisorShiftSummary[] }) {
  const { title, rows } = params;
  const lines: string[] = [title, ''];
  for (const r of rows) {
    const pct = `${Number(r.pct || 0).toFixed(1)}%`;
    const hrs = Number(r.totalBookedHours || 0).toFixed(2);
    lines.push(
      `*${r.supervisor}*`,
      `- الإجمالي: ${r.total}`,
      `- الحاجزين: ${r.booked}`,
      `- غير الحاجزين: ${r.notBooked}`,
      `- نسبة الحاجزين: ${pct}`,
      `- ساعات الحاجزين: ${hrs}`,
      ''
    );
  }
  return lines.join('\n').trim();
}

