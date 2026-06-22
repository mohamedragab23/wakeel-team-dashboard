import { getTicketingSql } from '@/lib/ticketing/db/client';
import type { TicketNotificationRow } from '@/lib/ticketing/types';

export async function createNotification(input: {
  recipientRole: string;
  recipientCode: string;
  ticketId: string;
  eventType: string;
  message: string;
}): Promise<void> {
  const sql = getTicketingSql();
  await sql`
    INSERT INTO ticket_notifications (
      recipient_role, recipient_code, ticket_id, event_type, message
    ) VALUES (
      ${input.recipientRole},
      ${input.recipientCode},
      ${input.ticketId}::uuid,
      ${input.eventType},
      ${input.message}
    )
  `;
}

export async function notifyTicketEvent(input: {
  ticketId: string;
  ticketNumber: number;
  supervisorCode: string;
  supervisorName: string;
  eventType: string;
  message: string;
  notifySupervisor?: boolean;
  notifyAdmin?: boolean;
  adminCode?: string;
}): Promise<void> {
  const sql = getTicketingSql();
  if (input.notifySupervisor) {
    await sql`
      INSERT INTO ticket_notifications (
        recipient_role, recipient_code, ticket_id, event_type, message
      ) VALUES (
        'supervisor',
        ${input.supervisorCode},
        ${input.ticketId}::uuid,
        ${input.eventType},
        ${input.message}
      )
    `;
  }
  if (input.notifyAdmin) {
    await sql`
      INSERT INTO ticket_notifications (
        recipient_role, recipient_code, ticket_id, event_type, message
      ) VALUES (
        'admin',
        ${input.adminCode ?? '*'},
        ${input.ticketId}::uuid,
        ${input.eventType},
        ${input.message}
      )
    `;
  }
}

export async function listNotifications(
  recipientRole: string,
  recipientCode: string,
  limit = 30
): Promise<TicketNotificationRow[]> {
  const sql = getTicketingSql();
  const rows = await sql`
    SELECT
      id::text,
      recipient_role AS "recipientRole",
      recipient_code AS "recipientCode",
      ticket_id::text AS "ticketId",
      event_type AS "eventType",
      message,
      read_at::text AS "readAt",
      created_at::text AS "createdAt"
    FROM ticket_notifications
    WHERE recipient_role = ${recipientRole}
      AND (recipient_code = ${recipientCode} OR recipient_code = '*')
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as TicketNotificationRow[];
}

export async function countUnreadNotifications(recipientRole: string, recipientCode: string): Promise<number> {
  const sql = getTicketingSql();
  const [row] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM ticket_notifications
    WHERE recipient_role = ${recipientRole}
      AND (recipient_code = ${recipientCode} OR recipient_code = '*')
      AND read_at IS NULL
  `;
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(id: string, recipientRole: string, recipientCode: string): Promise<boolean> {
  const sql = getTicketingSql();
  const rows = await sql`
    UPDATE ticket_notifications
    SET read_at = NOW()
    WHERE id = ${id}::uuid
      AND recipient_role = ${recipientRole}
      AND (recipient_code = ${recipientCode} OR recipient_code = '*')
      AND read_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function markAllNotificationsRead(recipientRole: string, recipientCode: string): Promise<void> {
  const sql = getTicketingSql();
  await sql`
    UPDATE ticket_notifications
    SET read_at = NOW()
    WHERE recipient_role = ${recipientRole}
      AND (recipient_code = ${recipientCode} OR recipient_code = '*')
      AND read_at IS NULL
  `;
}
