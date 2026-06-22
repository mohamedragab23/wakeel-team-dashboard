/** Operations Ticketing — isolated from analytics / strategic ops */

export const TICKET_TYPES = [
  'order_issue',
  'security_clearance',
  'rider_suspension',
  'general_request',
] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = [
  'new',
  'under_review',
  'waiting_supervisor_response',
  'approved',
  'rejected',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ORDER_ISSUE_CATEGORIES = [
  'missing_order',
  'wrong_payment',
  'customer_complaint',
  'rider_complaint',
  'technical_issue',
  'order_cancellation',
  'other',
] as const;
export type OrderIssueCategory = (typeof ORDER_ISSUE_CATEGORIES)[number];

export const TICKET_TYPE_LABELS_AR: Record<TicketType, string> = {
  order_issue: 'مشكلة طلب',
  security_clearance: 'تسوية التصريح الأمني',
  rider_suspension: 'طلب إيقاف طيار',
  general_request: 'طلب عام',
};

export const TICKET_STATUS_LABELS_AR: Record<TicketStatus, string> = {
  new: 'جديد',
  under_review: 'قيد المراجعة',
  waiting_supervisor_response: 'بانتظار رد المشرف',
  approved: 'موافق عليه',
  rejected: 'مرفوض',
  closed: 'مغلق',
};

export const TICKET_PRIORITY_LABELS_AR: Record<TicketPriority, string> = {
  low: 'منخفض',
  normal: 'عادي',
  high: 'مرتفع',
  urgent: 'عاجل',
};

export const ORDER_ISSUE_CATEGORY_LABELS_AR: Record<OrderIssueCategory, string> = {
  missing_order: 'طلب مفقود',
  wrong_payment: 'دفع خاطئ',
  customer_complaint: 'شكوى عميل',
  rider_complaint: 'شكوى طيار',
  technical_issue: 'مشكلة تقنية',
  order_cancellation: 'إلغاء طلب',
  other: 'أخرى',
};

export const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export type OrderIssuePayload = {
  riderId?: string;
  riderName?: string;
  orderId?: string;
  orderDate?: string;
  issueCategory: OrderIssueCategory;
};

export type SecurityClearancePayload = {
  riderId?: string;
  riderName?: string;
  nationalId?: string;
  notes?: string;
};

export type RiderSuspensionPayload = {
  riderId?: string;
  riderName?: string;
  suspensionReason?: string;
  suspensionStartDate?: string;
  suspensionEndDate?: string;
  suspensionDays?: number;
  notes?: string;
};

export type GeneralRequestPayload = {
  subject: string;
};

export type TicketPayload =
  | OrderIssuePayload
  | SecurityClearancePayload
  | RiderSuspensionPayload
  | GeneralRequestPayload;

export type TicketRow = {
  id: string;
  ticketNumber: number;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  zone: string;
  supervisorCode: string;
  supervisorName: string;
  subject: string | null;
  description: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  slaDueAt: string | null;
  assignedAdminCode: string | null;
};

export type TicketCommentRow = {
  id: string;
  ticketId: string;
  authorRole: string;
  authorCode: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type TicketAttachmentMeta = {
  id: string;
  ticketId: string;
  commentId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByCode: string;
  createdAt: string;
};

export type TicketNotificationRow = {
  id: string;
  recipientRole: string;
  recipientCode: string;
  ticketId: string | null;
  eventType: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type TicketAuditRow = {
  id: string;
  ticketId: string;
  actorRole: string;
  actorCode: string;
  actorName: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type TicketListFilters = {
  status?: TicketStatus;
  type?: TicketType;
  priority?: TicketPriority;
  zone?: string;
  search?: string;
  supervisorCode?: string;
  page?: number;
  pageSize?: number;
};

export type TicketMetrics = {
  newRequests: number;
  openRequests: number;
  averageResolutionHours: number | null;
  rejectedRequests: number;
  closedRequests: number;
};

export type Actor = {
  role: string;
  code: string;
  name: string;
};
