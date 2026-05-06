'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import { adminPermissionAllowed } from '@/lib/adminPermissions';

interface Counts {
  motorcyclePouch: number;
  bicyclePouch: number;
  tshirt: number;
  jacket: number;
  helmet: number;
}

export default function AdminMainInventoryPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Counts>({
    motorcyclePouch: 0,
    bicyclePouch: 0,
    tshirt: 0,
    jacket: 0,
    helmet: 0,
  });
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      router.replace('/');
      return;
    }
    try {
      const u = JSON.parse(userStr) as { role?: string; permissions?: string };
      if (u.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      setCanEdit(adminPermissionAllowed(u.permissions, 'inventory'));
    } catch {
      router.replace('/');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/main-inventory', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'فشل التحميل');
        setCounts(data.data);
      } catch (e: any) {
        setMessage({ type: 'err', text: e.message || 'خطأ' });
      } finally {
        setLoading(false);
      }
    })();
  }, [authChecked]);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/main-inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(counts),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الحفظ');
      setMessage({ type: 'ok', text: data.message || 'تم الحفظ' });
    } catch (e: any) {
      setMessage({ type: 'err', text: e.message || 'خطأ' });
    } finally {
      setSaving(false);
    }
  };

  if (!authChecked) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-[#EAF0FF]">
        جاري التحميل...
      </div>
    );
  }

  const field = (label: string, key: keyof Counts) => (
    <div>
      <label className="block text-sm text-[rgba(234,240,255,0.75)] mb-1">{label}</label>
      <input
        type="number"
        min={0}
        className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-3 py-2"
        value={counts[key]}
        disabled={!canEdit || loading}
        onChange={(e) =>
          setCounts((c) => ({ ...c, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))
        }
      />
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAF0FF]">المخزون الرئيسي</h1>
          <p className="text-[rgba(234,240,255,0.65)] text-sm mt-1">
            أرقام الصناديق والمعدات المتوفرة مركزياً. الموافقة على تسليم معدات تخصم تلقائياً من هنا؛
            الموافقة على استرجاع تضيف للمخزون.
          </p>
        </div>

        {!canEdit && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-100 px-4 py-3 text-sm">
            لديك صلاحية عرض فقط. لتمكين التعديل، أضف الكلمة المفتاحية <strong>inventory</strong> (أو{' '}
            <strong>all</strong>) في عمود الصلاحيات بورقة الأدمن ثم سجّل دخولك من جديد.
          </div>
        )}

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'ok'
                ? 'bg-emerald-500/15 text-emerald-100 border border-emerald-500/30'
                : 'bg-red-500/15 text-red-100 border border-red-500/30'
            }`}
          >
            {message.text}
          </div>
        )}

        <Card title="الكميات الحالية" subtitle="باوتشات موتوسيكل / عجلة — تيشرت — جاكيت — خوذة">
          {loading ? (
            <p className="text-[rgba(234,240,255,0.7)]">جاري التحميل...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {field('باوتش موتوسيكل (صندوق)', 'motorcyclePouch')}
              {field('باوتش عجلة (صندوق)', 'bicyclePouch')}
              {field('تيشرت', 'tshirt')}
              {field('جاكيت', 'jacket')}
              {field('خوذة', 'helmet')}
            </div>
          )}
          {canEdit && (
            <div className="mt-6">
              <Button type="button" variant="primary" disabled={saving || loading} onClick={save}>
                {saving ? 'جاري الحفظ...' : 'حفظ في Google Sheets'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
