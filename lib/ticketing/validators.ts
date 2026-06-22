import { z } from 'zod';
import {
  ORDER_ISSUE_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from '@/lib/ticketing/types';

export const createTicketSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('order_issue'),
    zone: z.string().min(1).max(100),
    description: z.string().min(1).max(10000),
    riderId: z.string().max(50).optional(),
    riderName: z.string().max(200).optional(),
    orderId: z.string().max(100).optional(),
    orderDate: z.string().max(30).optional(),
    issueCategory: z.enum(ORDER_ISSUE_CATEGORIES),
  }),
  z.object({
    type: z.literal('security_clearance'),
    zone: z.string().min(1).max(100),
    riderId: z.string().max(50).optional(),
    riderName: z.string().max(200).optional(),
    nationalId: z.string().max(50).optional(),
    notes: z.string().max(5000).optional(),
  }),
  z.object({
    type: z.literal('rider_suspension'),
    zone: z.string().min(1).max(100),
    riderId: z.string().max(50).optional(),
    riderName: z.string().max(200).optional(),
    suspensionReason: z.string().min(1).max(2000),
    suspensionStartDate: z.string().max(30).optional(),
    suspensionEndDate: z.string().max(30).optional(),
    suspensionDays: z.number().int().min(1).max(365).optional(),
    notes: z.string().max(5000).optional(),
  }),
  z.object({
    type: z.literal('general_request'),
    zone: z.string().min(1).max(100),
    subject: z.string().min(1).max(500),
    description: z.string().min(1).max(10000),
  }),
]);

export const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedAdminCode: z.string().max(50).nullable().optional(),
  adminNote: z.string().max(5000).optional(),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const listTicketsQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  type: z.enum(TICKET_TYPES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  zone: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
