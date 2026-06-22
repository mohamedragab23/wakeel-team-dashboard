import { getTicketingSql } from '@/lib/ticketing/db/client';
import type { Actor, TicketAuditRow } from '@/lib/ticketing/types';

export async function appendTicketAudit(input: {
  ticketId: string;
  actor: Actor;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sql = getTicketingSql();
  await sql`
    INSERT INTO ticket_audit_logs (
      ticket_id, actor_role, actor_code, actor_name,
      action, from_status, to_status, metadata
    ) VALUES (
      ${input.ticketId},
      ${input.actor.role},
      ${input.actor.code},
      ${input.actor.name},
      ${input.action},
      ${input.fromStatus ?? null},
      ${input.toStatus ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
}

export async function listTicketAudit(ticketId: string): Promise<TicketAuditRow[]> {
  const sql = getTicketingSql();
  const rows = await sql`
    SELECT
      id::text,
      ticket_id::text AS "ticketId",
      actor_role AS "actorRole",
      actor_code AS "actorCode",
      actor_name AS "actorName",
      action,
      from_status AS "fromStatus",
      to_status AS "toStatus",
      metadata,
      created_at::text AS "createdAt"
    FROM ticket_audit_logs
    WHERE ticket_id = ${ticketId}::uuid
    ORDER BY created_at ASC
  `;
  return rows as unknown as TicketAuditRow[];
}
