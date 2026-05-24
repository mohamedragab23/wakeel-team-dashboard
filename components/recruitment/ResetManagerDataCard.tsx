'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import Toast, { type ToastMessage } from '@/components/ui-v2/Toast';

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function ResetManagerDataCard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [managerCode, setManagerCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      setIsAdmin(user.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const { data: managers = [] } = useQuery({
    queryKey: ['recruitment', 'managers-list'],
    enabled: isAdmin,
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recruitment/managers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json.success ? (json.data as Array<{ code: string; name: string }>) : [];
    },
  });

  if (!isAdmin) return null;

  const resetData = async () => {
    if (!managerCode.trim()) {
      setToast({ type: 'warning', text: 'اختر مسؤول التعيينات أولاً' });
      return;
    }
    const selected = managers.find((m) => m.code === managerCode);
    const ok = window.confirm(
      `سيتم حذف كل بيانات مسؤول التعيينات ${selected?.name || managerCode} بشكل دائم من التعيينات. هل أنت متأكد؟`
    );
    if (!ok) return;

    setLoading(true);
    setSummary('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recruitment/reset-manager-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ managerCode }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تصفير البيانات');
      const data = json.data as {
        candidatesDeleted: number;
        outreachDeleted: number;
        activityDeleted: number;
        notificationsDeleted: number;
      };
      setSummary(
        `تم الحذف: ${data.candidatesDeleted} مرشح، ${data.outreachDeleted} من داتا العروض، ${data.activityDeleted} سجل نشاط، ${data.notificationsDeleted} إشعار`
      );
      setToast({ type: 'success', text: 'تم تصفير بيانات مسؤول التعيينات بنجاح' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ';
      setToast({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold">تصفير بيانات مسؤول التعيينات</h3>
        <p className="text-xs text-[rgba(234,240,255,0.65)] mt-1">
          للأدمن فقط: حذف كل سجلات مسؤول تعيينات محدد (مرشحين + عروض + سجل النشاط + الإشعارات).
        </p>
      </div>
      <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
        <label className="block">
          <span className="text-xs text-[rgba(234,240,255,0.65)] mb-1 block">اختر مسؤول التعيينات</span>
          <select className={inputClass} value={managerCode} onChange={(e) => setManagerCode(e.target.value)}>
            <option value="">— اختر —</option>
            {managers.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={resetData} disabled={loading || !managerCode}>
          {loading ? 'جاري التصفير...' : 'تصفير بيانات المسؤول'}
        </Button>
      </div>
      {summary ? <p className="text-xs text-[rgba(234,240,255,0.8)]">{summary}</p> : null}
      <Toast message={toast} />
    </Card>
  );
}
