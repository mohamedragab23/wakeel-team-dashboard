import { z } from 'zod';

export const loginBodySchema = z.object({
  code: z.string().min(1, 'الكود مطلوب'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
  role: z.enum(['supervisor', 'admin', 'recruitment_manager']).optional(),
});

export const terminationPutSchema = z.object({
  requestId: z.union([z.number(), z.string()]),
  action: z.enum(['approve', 'reject']),
  newSupervisorCode: z.string().optional(),
  deleteRider: z.boolean().optional(),
});

export const terminationPostSchema = z.object({
  riderCode: z.string().min(1),
  reason: z.string().min(1),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
