-- Operations Ticketing — isolated schema (do not mix with analytics tables)

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGSERIAL UNIQUE,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  zone VARCHAR(100) NOT NULL,
  supervisor_code VARCHAR(50) NOT NULL,
  supervisor_name VARCHAR(200) NOT NULL,
  subject VARCHAR(500),
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  assigned_admin_code VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_tickets_supervisor ON tickets (supervisor_code);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets (type);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets (priority);
CREATE INDEX IF NOT EXISTS idx_tickets_zone ON tickets (zone);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_open ON tickets (status) WHERE status NOT IN ('closed', 'rejected');

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author_role VARCHAR(20) NOT NULL,
  author_code VARCHAR(50) NOT NULL,
  author_name VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  comment_id UUID REFERENCES ticket_comments (id) ON DELETE SET NULL,
  storage_key VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments (ticket_id);

CREATE TABLE IF NOT EXISTS ticket_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role VARCHAR(20) NOT NULL,
  recipient_code VARCHAR(50) NOT NULL,
  ticket_id UUID REFERENCES tickets (id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_notifications_recipient_unread
  ON ticket_notifications (recipient_code, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_notifications_recipient_created
  ON ticket_notifications (recipient_code, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  actor_role VARCHAR(20) NOT NULL,
  actor_code VARCHAR(50) NOT NULL,
  actor_name VARCHAR(200) NOT NULL,
  action VARCHAR(100) NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_ticket ON ticket_audit_logs (ticket_id, created_at DESC);
