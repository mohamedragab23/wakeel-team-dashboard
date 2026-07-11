'use client';

import Badge from '@/components/ui-v2/Badge';
import type { LiveRiderStatusBucket } from '@/lib/roosterLive/types';

const STATUS_CONFIG: Record<LiveRiderStatusBucket, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  online: { label: 'متصل', variant: 'success' },
  busy: { label: 'مشغول', variant: 'info' },
  on_break: { label: 'استراحة', variant: 'warning' },
  late: { label: 'متأخر', variant: 'danger' },
  offline: { label: 'غير متصل', variant: 'default' },
  unknown: { label: 'غير معروف', variant: 'default' },
};

export default function LiveStatusBadge({ status }: { status: LiveRiderStatusBucket }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
