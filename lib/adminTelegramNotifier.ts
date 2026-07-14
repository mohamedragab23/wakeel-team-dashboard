/**
 * ADMIN TELEGRAM NOTIFIER
 *
 * Notification service for sending Telegram alerts to administrators.
 *
 * ## Features
 * - Send notifications to all admins with configured Telegram Chat IDs
 * - Support for multiple notification types (termination, assignment, equipment, tickets, etc.)
 * - Formatted Arabic messages with emojis for better readability
 * - Non-blocking: failures won't stop the main operation
 * - Optional group chat for consolidated notifications
 *
 * ## Configuration
 * Admin Telegram Chat IDs are stored in the Google Sheet (الأدمن tab), column "telegram_chat_id"
 * Optional: TELEGRAM_ADMIN_GROUP_CHAT_ID for sending to a single admin group
 *
 * ## Usage
 * ```ts
 * await sendAdminTelegramNotification({
 *   type: 'termination_request',
 *   supervisorName: 'أحمد محمد',
 *   riderName: 'محمود علي',
 *   url: 'https://...'
 * });
 * ```
 */

import { getAdminContacts } from '@/lib/adminContacts';

export type NotificationType =
  | 'termination_request'
  | 'assignment_request'
  | 'reactivation_request'
  | 'equipment_delivery'
  | 'equipment_return'
  | 'new_ticket'
  | 'incomplete_rider_data'
  | 'system_alert';

export type NotificationPayload = {
  type: NotificationType;
  supervisorName?: string;
  supervisorCode?: string;
  riderName?: string;
  riderCode?: string;
  reason?: string;
  zone?: string;
  contractType?: string;
  items?: Array<{ name: string; quantity: number }>;
  totalCost?: number;
  ticketType?: string;
  priority?: 'low' | 'medium' | 'high';
  count?: number;
  riders?: Array<{ name: string; code: string }>;
  url?: string;
  requestDate?: string;
  // Generic fields for system_alert type
  alertTitle?: string;
  alertMessage?: string;
};

/**
 * Format notification message with Arabic text and emojis
 */
function formatNotificationMessage(payload: NotificationPayload): string {
  const lines: string[] = ['🔔 *طلب جديد يحتاج مراجعة*', ''];

  const date = payload.requestDate || new Date().toLocaleDateString('ar-EG');

  switch (payload.type) {
    case 'termination_request':
      lines.push('📋 *النوع:* طلب إقالة');
      if (payload.supervisorName) {
        lines.push(`👤 *المشرف:* ${payload.supervisorName}${payload.supervisorCode ? ` (${payload.supervisorCode})` : ''}`);
      }
      if (payload.riderName) {
        lines.push(`🆔 *الطيار:* ${payload.riderName}${payload.riderCode ? ` (${payload.riderCode})` : ''}`);
      }
      lines.push(`📅 *التاريخ:* ${date}`);
      if (payload.reason) {
        lines.push(`📝 *السبب:* ${payload.reason}`);
      }
      break;

    case 'assignment_request':
      lines.push('📋 *النوع:* طلب تعيين');
      if (payload.supervisorName) {
        lines.push(`👤 *المشرف:* ${payload.supervisorName}${payload.supervisorCode ? ` (${payload.supervisorCode})` : ''}`);
      }
      if (payload.riderName) {
        lines.push(`🆔 *الطيار:* ${payload.riderName}${payload.riderCode ? ` (${payload.riderCode})` : ''}`);
      }
      if (payload.zone) {
        lines.push(`📍 *الزون:* ${payload.zone}`);
      }
      if (payload.contractType) {
        lines.push(`📄 *نوع العقد:* ${payload.contractType}`);
      }
      lines.push(`📅 *التاريخ:* ${date}`);
      break;

    case 'reactivation_request':
      lines.push('📋 *النوع:* طلب إعادة تفعيل');
      if (payload.supervisorName) {
        lines.push(`👤 *المشرف:* ${payload.supervisorName}${payload.supervisorCode ? ` (${payload.supervisorCode})` : ''}`);
      }
      if (payload.riderName) {
        lines.push(`🆔 *الطيار:* ${payload.riderName}${payload.riderCode ? ` (${payload.riderCode})` : ''}`);
      }
      if (payload.zone) {
        lines.push(`📍 *الزون:* ${payload.zone}`);
      }
      lines.push(`📅 *التاريخ:* ${date}`);
      break;

    case 'equipment_delivery':
      lines.push('📋 *النوع:* طلب تسليم معدات');
      if (payload.supervisorName) {
        lines.push(`👤 *المشرف:* ${payload.supervisorName}`);
      }
      if (payload.items && payload.items.length > 0) {
        lines.push('📦 *المعدات:*');
        payload.items.forEach((item) => {
          lines.push(`  • ${item.name} × ${item.quantity}`);
        });
      }
      if (payload.totalCost) {
        lines.push(`💰 *التكلفة الإجمالية:* ${payload.totalCost} جنيه`);
      }
      lines.push(`📅 *التاريخ:* ${date}`);
      break;

    case 'equipment_return':
      lines.push('📋 *النوع:* طلب استرجاع معدات');
      if (payload.supervisorName) {
        lines.push(`👤 *المشرف:* ${payload.supervisorName}`);
      }
      if (payload.items && payload.items.length > 0) {
        lines.push('📦 *المعدات:*');
        payload.items.forEach((item) => {
          lines.push(`  • ${item.name} × ${item.quantity}`);
        });
      }
      lines.push(`📅 *التاريخ:* ${date}`);
      break;

    case 'new_ticket':
      const priorityEmoji = payload.priority === 'high' ? '🔴' : payload.priority === 'medium' ? '🟡' : '🟢';
      lines[0] = `${priorityEmoji} *تذكرة جديدة تحتاج مراجعة*`;
      lines.push('📋 *النوع:* تذكرة جديدة');
      if (payload.ticketType) {
        const ticketTypeLabels: Record<string, string> = {
          order_issue: 'مشكلة في طلب',
          security_clearance: 'تصريح أمني',
          rider_suspension: 'إيقاف طيار',
          general_request: 'طلب عام',
        };
        lines.push(`🎫 *نوع التذكرة:* ${ticketTypeLabels[payload.ticketType] || payload.ticketType}`);
      }
      if (payload.supervisorName) {
        lines.push(`👤 *المشرف:* ${payload.supervisorName}`);
      }
      lines.push(`📅 *التاريخ:* ${date}`);
      break;

    case 'incomplete_rider_data':
      lines[0] = '⚠️ *تنبيه: طيارين ببيانات ناقصة*';
      lines.push('');
      if (payload.count) {
        lines.push(`📊 *العدد:* ${payload.count} طيار`);
      }
      if (payload.riders && payload.riders.length > 0) {
        lines.push('');
        lines.push('*الطيارين (أول 10):*');
        payload.riders.slice(0, 10).forEach((rider) => {
          lines.push(`  • ${rider.name} (${rider.code})`);
        });
        if (payload.riders.length > 10) {
          lines.push(`  ... و ${payload.riders.length - 10} طيار آخرين`);
        }
      }
      lines.push('');
      lines.push('⚠️ *مطلوب:* إكمال تاريخ التعيين (Join Date) للطيارين');
      break;

    case 'system_alert':
      const alertPriorityEmoji = payload.priority === 'high' ? '🚨' : payload.priority === 'medium' ? '⚠️' : 'ℹ️';
      lines[0] = payload.alertTitle ? `${alertPriorityEmoji} *${payload.alertTitle}*` : `${alertPriorityEmoji} *تنبيه نظام*`;
      lines.push('');
      if (payload.alertMessage) {
        lines.push(payload.alertMessage);
      }
      lines.push('');
      lines.push(`📅 *الوقت:* ${new Date().toLocaleString('ar-EG')}`);
      break;
  }

  // Add URL if provided
  if (payload.url) {
    lines.push('');
    lines.push(`🔗 [رابط المراجعة](${payload.url})`);
  }

  return lines.join('\n');
}

/**
 * Send Telegram message to a specific chat ID
 */
async function sendToTelegram(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Telegram send failed: ${res.status} ${text}`.trim());
  }
}

/**
 * Send notification to all admins with configured Telegram Chat IDs
 * Returns statistics about sent/failed notifications
 */
export async function sendAdminTelegramNotification(
  payload: NotificationPayload
): Promise<{
  sent: number;
  skipped: number;
  failed: Array<{ admin: string; error: string }>;
}> {
  // Check if Telegram is configured
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.log('[AdminTelegramNotifier] Skipping: TELEGRAM_BOT_TOKEN not configured');
    return { sent: 0, skipped: 0, failed: [] };
  }

  const message = formatNotificationMessage(payload);

  // Check if there's a default admin group chat
  const adminGroupChatId = process.env.TELEGRAM_ADMIN_GROUP_CHAT_ID?.trim();
  if (adminGroupChatId) {
    try {
      await sendToTelegram(adminGroupChatId, message);
      console.log('[AdminTelegramNotifier] Sent to admin group chat:', adminGroupChatId);
      return { sent: 1, skipped: 0, failed: [] };
    } catch (error: any) {
      console.error('[AdminTelegramNotifier] Failed to send to admin group:', error?.message || error);
      return { sent: 0, skipped: 0, failed: [{ admin: 'Admin Group', error: error?.message || String(error) }] };
    }
  }

  // Otherwise, send to individual admins
  const contacts = await getAdminContacts();
  const adminsWithTelegram = contacts.filter((c) => c.telegramChatId);

  if (adminsWithTelegram.length === 0) {
    console.log('[AdminTelegramNotifier] No admins with Telegram Chat IDs found');
    return { sent: 0, skipped: contacts.length, failed: [] };
  }

  let sent = 0;
  const failed: Array<{ admin: string; error: string }> = [];

  // Send to each admin (with retry logic)
  for (const admin of adminsWithTelegram) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        await sendToTelegram(admin.telegramChatId!, message);
        sent += 1;
        console.log(`[AdminTelegramNotifier] Sent to ${admin.name} (${admin.code})`);
        break; // Success, exit retry loop
      } catch (error: any) {
        attempts += 1;
        if (attempts >= maxAttempts) {
          const errorMsg = error?.message || String(error);
          failed.push({ admin: `${admin.name} (${admin.code})`, error: errorMsg });
          console.error(`[AdminTelegramNotifier] Failed to send to ${admin.name} after ${maxAttempts} attempts:`, errorMsg);
        } else {
          // Wait a bit before retry
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
  }

  const skipped = contacts.length - adminsWithTelegram.length;
  console.log(`[AdminTelegramNotifier] Summary: sent=${sent}, skipped=${skipped}, failed=${failed.length}`);

  return { sent, skipped, failed };
}

/**
 * Wrapper that catches all errors to ensure notifications never break the main flow
 */
export async function sendAdminTelegramNotificationSafe(payload: NotificationPayload): Promise<void> {
  try {
    await sendAdminTelegramNotification(payload);
  } catch (error: any) {
    console.error('[AdminTelegramNotifier] Unexpected error:', error?.message || error);
    // Don't throw - notification failures should never break the main operation
  }
}
