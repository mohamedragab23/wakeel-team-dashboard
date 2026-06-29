import { getTicketingSql } from '@/lib/ticketing/db/client';
import { appendTicketAudit } from '@/lib/ticketing/services/auditService';
import { notifyTicketEvent } from '@/lib/ticketing/services/notificationService';
import type {
  Actor,
  TicketCommentRow,
  TicketListFilters,
  TicketMetrics,
  TicketRow,
  TicketStatus,
  TicketType,
} from '@/lib/ticketing/types';
import { TICKET_STATUS_LABELS_AR } from '@/lib/ticketing/types';
import type { z } from 'zod';
import type { createTicketSchema, updateTicketSchema } from '@/lib/ticketing/validators';

type CreateInput = z.infer<typeof createTicketSchema>;
type UpdateInput = z.infer<typeof updateTicketSchema>;

const CLOSED_STATUSES = new Set<TicketStatus>(['closed', 'rejected', 'approved']);

function mapTicket(row: Record<string, unknown>): TicketRow {
  return {
    id: String(row.id),
    ticketNumber: Number(row.ticketNumber),
    type: row.type as TicketType,
    status: row.status as TicketStatus,
    priority: row.priority as TicketRow['priority'],
    zone: String(row.zone),
    supervisorCode: String(row.supervisorCode),
    supervisorName: String(row.supervisorName),
    subject: row.subject != null ? String(row.subject) : null,
    description: row.description != null ? String(row.description) : null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    closedAt: row.closedAt != null ? String(row.closedAt) : null,
    slaDueAt: row.slaDueAt != null ? String(row.slaDueAt) : null,
    assignedAdminCode: row.assignedAdminCode != null ? String(row.assignedAdminCode) : null,
  };
}

function buildPayload(input: CreateInput): Record<string, unknown> {
  const { type, zone: _z, ...rest } = input as CreateInput & { zone?: string };
  void _z;
  void type;
  return rest as Record<string, unknown>;
}

function deriveSubject(input: CreateInput): string | null {
  if (input.type === 'general_request') return input.subject;
  if (input.type === 'order_issue') return `مشكلة طلب — ${input.issueCategory}`;
  if (input.type === 'security_clearance') return `تسوية أمنية — ${input.riderName || input.riderId || ''}`.trim();
  if (input.type === 'rider_suspension') return `إيقاف طيار — ${input.riderName || input.riderId || ''}`.trim();
  return null;
}

function deriveDescription(input: CreateInput): string | null {
  if ('description' in input && input.description) return input.description;
  if (input.type === 'security_clearance') return input.notes ?? null;
  if (input.type === 'rider_suspension') return input.notes ?? input.suspensionReason;
  return null;
}

function slaDueHours(priority: string): number {
  switch (priority) {
    case 'urgent':
      return 4;
    case 'high':
      return 24;
    case 'low':
      return 72;
    default:
      return 48;
  }
}

export async function createTicket(input: CreateInput, actor: Actor): Promise<TicketRow> {
  const sql = getTicketingSql();
  const payload = buildPayload(input);
  const subject = deriveSubject(input);
  const description = deriveDescription(input);
  const priority = 'normal';

  const [row] = await sql`
    INSERT INTO tickets (
      type, status, priority, zone, supervisor_code, supervisor_name,
      subject, description, payload, sla_due_at
    ) VALUES (
      ${input.type},
      'new',
      ${priority},
      ${input.zone},
      ${actor.code},
      ${actor.name},
      ${subject},
      ${description},
      ${JSON.stringify(payload)}::jsonb,
      NOW() + (${slaDueHours(priority)}::int * INTERVAL '1 hour')
    )
    RETURNING
      id::text,
      ticket_number AS "ticketNumber",
      type, status, priority, zone,
      supervisor_code AS "supervisorCode",
      supervisor_name AS "supervisorName",
      subject, description, payload,
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt",
      closed_at::text AS "closedAt",
      sla_due_at::text AS "slaDueAt",
      assigned_admin_code AS "assignedAdminCode"
  `;

  const ticket = mapTicket(row as Record<string, unknown>);
  await appendTicketAudit({
    ticketId: ticket.id,
    actor,
    action: 'ticket_created',
    toStatus: 'new',
    metadata: { type: input.type },
  });

  await notifyTicketEvent({
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    supervisorCode: ticket.supervisorCode,
    supervisorName: ticket.supervisorName,
    eventType: 'ticket_created',
    message: `طلب جديد #${ticket.ticketNumber} من ${ticket.supervisorName}`,
    notifyAdmin: true,
  });

  return ticket;
}

export async function getTicketById(id: string): Promise<TicketRow | null> {
  const sql = getTicketingSql();
  const [row] = await sql`
    SELECT
      id::text,
      ticket_number AS "ticketNumber",
      type, status, priority, zone,
      supervisor_code AS "supervisorCode",
      supervisor_name AS "supervisorName",
      subject, description, payload,
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt",
      closed_at::text AS "closedAt",
      sla_due_at::text AS "slaDueAt",
      assigned_admin_code AS "assignedAdminCode"
    FROM tickets WHERE id = ${id}::uuid
  `;
  return row ? mapTicket(row as Record<string, unknown>) : null;
}

export async function listTickets(
  filters: TicketListFilters,
  scopeSupervisorCode?: string
): Promise<{ items: TicketRow[]; total: number; page: number; pageSize: number }> {
  const sql = getTicketingSql();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const status = filters.status ?? null;
  const type = filters.type ?? null;
  const priority = filters.priority ?? null;
  const zone = filters.zone ?? null;
  const search = filters.search?.trim() ? `%${filters.search.trim()}%` : null;
  const supervisorCode = scopeSupervisorCode ?? filters.supervisorCode ?? null;

  const [countRow] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM tickets t
    WHERE (${supervisorCode}::text IS NULL OR t.supervisor_code = ${supervisorCode})
      AND (${status}::text IS NULL OR t.status = ${status})
      AND (${type}::text IS NULL OR t.type = ${type})
      AND (${priority}::text IS NULL OR t.priority = ${priority})
      AND (${zone}::text IS NULL OR t.zone = ${zone})
      AND (
        ${search}::text IS NULL OR
        t.subject ILIKE ${search} OR
        t.description ILIKE ${search} OR
        t.supervisor_name ILIKE ${search} OR
        CAST(t.ticket_number AS TEXT) ILIKE ${search}
      )
  `;

  const rows = await sql`
    SELECT
      id::text,
      ticket_number AS "ticketNumber",
      type, status, priority, zone,
      supervisor_code AS "supervisorCode",
      supervisor_name AS "supervisorName",
      subject, description, payload,
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt",
      closed_at::text AS "closedAt",
      sla_due_at::text AS "slaDueAt",
      assigned_admin_code AS "assignedAdminCode"
    FROM tickets t
    WHERE (${supervisorCode}::text IS NULL OR t.supervisor_code = ${supervisorCode})
      AND (${status}::text IS NULL OR t.status = ${status})
      AND (${type}::text IS NULL OR t.type = ${type})
      AND (${priority}::text IS NULL OR t.priority = ${priority})
      AND (${zone}::text IS NULL OR t.zone = ${zone})
      AND (
        ${search}::text IS NULL OR
        t.subject ILIKE ${search} OR
        t.description ILIKE ${search} OR
        t.supervisor_name ILIKE ${search} OR
        CAST(t.ticket_number AS TEXT) ILIKE ${search}
      )
    ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        ELSE 4
      END,
      t.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return {
    items: (rows as Record<string, unknown>[]).map(mapTicket),
    total: Number(countRow?.count ?? 0),
    page,
    pageSize,
  };
}

export async function updateTicket(
  id: string,
  input: UpdateInput,
  actor: Actor,
  isAdmin: boolean
): Promise<TicketRow> {
  const existing = await getTicketById(id);
  if (!existing) throw new Error('التذكرة غير موجودة');

  if (!isAdmin && existing.supervisorCode !== actor.code) {
    throw new Error('غير مصرح');
  }
  if (!isAdmin && CLOSED_STATUSES.has(existing.status)) {
    throw new Error('لا يمكن تعديل طلب مغلق');
  }

  const sql = getTicketingSql();
  const nextStatus = input.status ?? existing.status;
  const nextPriority = input.priority ?? existing.priority;
  const nextAssigned = input.assignedAdminCode !== undefined ? input.assignedAdminCode : existing.assignedAdminCode;

  const closing = ['closed', 'rejected', 'approved'].includes(nextStatus) && !CLOSED_STATUSES.has(existing.status);

  const [row] = await sql`
    UPDATE tickets SET
      status = ${nextStatus},
      priority = ${nextPriority},
      assigned_admin_code = ${nextAssigned},
      updated_at = NOW(),
      closed_at = CASE WHEN ${closing} THEN NOW() ELSE closed_at END,
      sla_due_at = CASE
        WHEN ${nextPriority} != ${existing.priority}
        THEN NOW() + (${slaDueHours(nextPriority)}::int * INTERVAL '1 hour')
        ELSE sla_due_at
      END
    WHERE id = ${id}::uuid
    RETURNING
      id::text,
      ticket_number AS "ticketNumber",
      type, status, priority, zone,
      supervisor_code AS "supervisorCode",
      supervisor_name AS "supervisorName",
      subject, description, payload,
      created_at::text AS "createdAt",
      updated_at::text AS "updatedAt",
      closed_at::text AS "closedAt",
      sla_due_at::text AS "slaDueAt",
      assigned_admin_code AS "assignedAdminCode"
  `;

  const ticket = mapTicket(row as Record<string, unknown>);

  if (input.status && input.status !== existing.status) {
    await appendTicketAudit({
      ticketId: id,
      actor,
      action: 'status_changed',
      fromStatus: existing.status,
      toStatus: input.status,
    });

    const statusLabel = TICKET_STATUS_LABELS_AR[input.status];
    await notifyTicketEvent({
      ticketId: id,
      ticketNumber: ticket.ticketNumber,
      supervisorCode: ticket.supervisorCode,
      supervisorName: ticket.supervisorName,
      eventType: 'status_changed',
      message: `تم تحديث الطلب #${ticket.ticketNumber} إلى: ${statusLabel}`,
      notifySupervisor: true,
      notifyAdmin: actor.role === 'supervisor',
      adminCode: actor.code,
    });

    if (input.status === 'approved' || input.status === 'rejected' || input.status === 'closed') {
      await notifyTicketEvent({
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        supervisorCode: ticket.supervisorCode,
        supervisorName: ticket.supervisorName,
        eventType: input.status,
        message: `الطلب #${ticket.ticketNumber}: ${statusLabel}`,
        notifySupervisor: true,
      });
    }
  }

  if (input.priority && input.priority !== existing.priority) {
    await appendTicketAudit({
      ticketId: id,
      actor,
      action: 'priority_changed',
      metadata: { from: existing.priority, to: input.priority },
    });
  }

  if (input.adminNote && isAdmin) {
    await addComment(id, input.adminNote, actor);
  }

  return ticket;
}

export async function addComment(ticketId: string, body: string, actor: Actor): Promise<TicketCommentRow> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error('التذكرة غير موجودة');
  if (CLOSED_STATUSES.has(ticket.status) && actor.role === 'supervisor') {
    throw new Error('لا يمكن الرد على طلب مغلق');
  }

  const sql = getTicketingSql();
  const [row] = await sql`
    INSERT INTO ticket_comments (ticket_id, author_role, author_code, author_name, body)
    VALUES (
      ${ticketId}::uuid,
      ${actor.role},
      ${actor.code},
      ${actor.name},
      ${body}
    )
    RETURNING
      id::text,
      ticket_id::text AS "ticketId",
      author_role AS "authorRole",
      author_code AS "authorCode",
      author_name AS "authorName",
      body,
      created_at::text AS "createdAt"
  `;

  await appendTicketAudit({
    ticketId,
    actor,
    action: 'comment_added',
    metadata: { commentId: (row as TicketCommentRow).id },
  });

  const isAdminReply = actor.role === 'admin';
  await notifyTicketEvent({
    ticketId,
    ticketNumber: ticket.ticketNumber,
    supervisorCode: ticket.supervisorCode,
    supervisorName: ticket.supervisorName,
    eventType: 'comment',
    message: `${isAdminReply ? 'رد من الإدارة' : 'رد من المشرف'} على الطلب #${ticket.ticketNumber}`,
    notifySupervisor: isAdminReply,
    notifyAdmin: !isAdminReply,
    adminCode: '*',
  });

  if (isAdminReply && ticket.status === 'new') {
    await sql`UPDATE tickets SET status = 'waiting_supervisor_response', updated_at = NOW() WHERE id = ${ticketId}::uuid`;
  } else if (!isAdminReply && ticket.status === 'waiting_supervisor_response') {
    await sql`UPDATE tickets SET status = 'under_review', updated_at = NOW() WHERE id = ${ticketId}::uuid`;
  }

  return row as TicketCommentRow;
}

export async function listComments(ticketId: string): Promise<TicketCommentRow[]> {
  const sql = getTicketingSql();
  const rows = await sql`
    SELECT
      id::text,
      ticket_id::text AS "ticketId",
      author_role AS "authorRole",
      author_code AS "authorCode",
      author_name AS "authorName",
      body,
      created_at::text AS "createdAt"
    FROM ticket_comments
    WHERE ticket_id = ${ticketId}::uuid
    ORDER BY created_at ASC
  `;
  return rows as unknown as TicketCommentRow[];
}

export async function getTicketMetrics(): Promise<TicketMetrics & { statusCounts: Record<string, number> }> {
  const sql = getTicketingSql();

  const [agg] = await sql<{
    newRequests: string;
    openRequests: string;
    rejectedRequests: string;
    closedRequests: string;
    avgHours: string | null;
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE t.status = 'new')::text AS "newRequests",
      COUNT(*) FILTER (WHERE t.status NOT IN ('closed', 'rejected', 'approved'))::text AS "openRequests",
      COUNT(*) FILTER (WHERE t.status = 'rejected')::text AS "rejectedRequests",
      COUNT(*) FILTER (WHERE t.status = 'closed')::text AS "closedRequests",
      (AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 3600.0) FILTER (WHERE t.closed_at IS NOT NULL))::text AS "avgHours"
    FROM tickets t
  `;

  const statusRows = await sql<{ status: string; count: string }[]>`
    SELECT t.status, COUNT(*)::text AS count FROM tickets t GROUP BY t.status
  `;
  const statusCounts: Record<string, number> = {};
  for (const r of statusRows) {
    statusCounts[r.status] = Number(r.count);
  }

  return {
    newRequests: Number(agg?.newRequests ?? 0),
    openRequests: Number(agg?.openRequests ?? 0),
    rejectedRequests: Number(agg?.rejectedRequests ?? 0),
    closedRequests: Number(agg?.closedRequests ?? 0),
    averageResolutionHours: agg?.avgHours != null ? Math.round(Number(agg.avgHours) * 10) / 10 : null,
    statusCounts,
  };
}

export function assertTicketAccess(ticket: TicketRow, actor: Actor, isAdmin: boolean): void {
  if (isAdmin) return;
  if (ticket.supervisorCode !== actor.code) {
    throw new Error('غير مصرح بعرض هذا الطلب');
  }
}
