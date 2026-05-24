'use client';

import { useQuery } from '@tanstack/react-query';
import Button from '@/components/ui-v2/Button';
import type { Candidate } from '@/lib/recruitment/types';

type Props = {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
};

export default function ActivityLogModal({ candidate, open, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['recruitment', 'activity', candidate?.id],
    enabled: open && !!candidate?.id,
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/recruitment/activity-log/${candidate!.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json.success ? json.data : [];
    },
  });

  if (!open || !candidate) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0a0e18] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col p-6">
        <h2 className="text-xl font-bold mb-2">سجل النشاطات</h2>
        <p className="text-sm text-[rgba(234,240,255,0.7)] mb-4">{candidate.fullName}</p>
        <div className="flex-1 overflow-y-auto space-y-2 text-sm">
          {isLoading ? (
            <p>جاري التحميل...</p>
          ) : !data?.length ? (
            <p className="text-[rgba(234,240,255,0.6)]">لا يوجد سجل تعديلات</p>
          ) : (
            data.map(
              (
                entry: {
                  field: string;
                  oldValue: string;
                  newValue: string;
                  changedByName: string;
                  timestamp: string;
                },
                i: number
              ) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]"
                >
                  <p className="font-medium">{entry.field}</p>
                  <p className="text-[rgba(234,240,255,0.65)]">
                    {entry.oldValue || '—'} → {entry.newValue || '—'}
                  </p>
                  <p className="text-xs mt-1 text-[rgba(234,240,255,0.5)]">
                    {entry.changedByName} · {entry.timestamp}
                  </p>
                </div>
              )
            )
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  );
}
