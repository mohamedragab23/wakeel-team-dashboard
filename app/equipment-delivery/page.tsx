'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import { ZONE_OPTIONS } from '@/lib/zones';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function EquipmentDeliveryPage() {
  const [riderCode, setRiderCode] = useState('');
  const [riderName, setRiderName] = useState('');
  const [zone, setZone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'تعيين' | 'تبديل'>('تعيين');
  const [motorcyclePouch, setMotorcyclePouch] = useState(0);
  const [bicyclePouch, setBicyclePouch] = useState(0);
  const [tshirt, setTshirt] = useState(0);
  const [jacket, setJacket] = useState(0);
  const [helmet, setHelmet] = useState(0);
  const [photoData, setPhotoData] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const onFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'err', text: 'الملف يجب أن يكون صورة' });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setMessage({ type: 'err', text: 'حجم الصورة كبير جداً (الحد الأقصى 5 ميجا)' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoData(String(reader.result || ''));
      setMessage({ type: 'ok', text: 'تم اختيار الصورة — سيتم رفعها وإنشاء رابط في الشيت عند الإرسال' });
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await authFetch('/api/equipment-deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderCode,
          riderName,
          zone,
          deliveryType,
          motorcyclePouch,
          bicyclePouch,
          tshirt,
          jacket,
          helmet,
          photoData: photoData || undefined }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الإرسال');
      setMessage({ type: 'ok', text: data.message || 'تم إرسال الطلب' });
      setRiderCode('');
      setRiderName('');
      setZone('');
      setMotorcyclePouch(0);
      setBicyclePouch(0);
      setTshirt(0);
      setJacket(0);
      setHelmet(0);
      setPhotoData('');
    } catch (err: any) {
      setMessage({ type: 'err', text: err.message || 'خطأ' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
        <h1 className="text-2xl font-semibold text-[#EAF0FF]">تسليم معدات للمندوب</h1>
        <p className="text-sm text-[rgba(234,240,255,0.65)]">
          يُرسل كطلب معلق؛ بعد موافقة المدير يُسجَّل في ورقة Google «تسليم_المعدات» ويُخصم من المخزون
          الرئيسي. تأكد أن الاسم يطابق ورقة المناديب حرفياً.
        </p>

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

        <Card title="بيانات الطلب">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1 text-[rgba(234,240,255,0.75)]">كود المندوب</label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-3 py-2"
                  value={riderCode}
                  onChange={(e) => setRiderCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-[rgba(234,240,255,0.75)]">اسم المندوب (كما بالتطبيق)</label>
                <input
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-3 py-2"
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1 text-[rgba(234,240,255,0.75)]">الزون</label>
                <select
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-3 py-2"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  required
                >
                  <option value="">اختر الزون</option>
                  {ZONE_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1 text-[rgba(234,240,255,0.75)]">نوع التسليم</label>
                <select
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-3 py-2"
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value as 'تعيين' | 'تبديل')}
                >
                  <option value="تعيين">تسليم تعيين</option>
                  <option value="تبديل">تبديل</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1 text-[rgba(234,240,255,0.7)]">باوتش موتوسيكل</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-2 py-2"
                  value={motorcyclePouch}
                  onChange={(e) => setMotorcyclePouch(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-[rgba(234,240,255,0.7)]">باوتش عجلة</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-2 py-2"
                  value={bicyclePouch}
                  onChange={(e) => setBicyclePouch(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-[rgba(234,240,255,0.7)]">تيشرت</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-2 py-2"
                  value={tshirt}
                  onChange={(e) => setTshirt(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-[rgba(234,240,255,0.7)]">جاكيت</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-2 py-2"
                  value={jacket}
                  onChange={(e) => setJacket(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-[rgba(234,240,255,0.7)]">خوذة</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-white/10 bg-[#070A14] text-[#EAF0FF] px-2 py-2"
                  value={helmet}
                  onChange={(e) => setHelmet(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1 text-[rgba(234,240,255,0.75)]">صورة بعد الاستلام (اختياري)</label>
              <input
                type="file"
                accept="image/*"
                className="text-sm text-[#EAF0FF]"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
              {photoData && (
                <p className="text-xs text-emerald-300 mt-1">
                  تم اختيار الصورة — سيظهر رابط معاينة في الشيت بعد الإرسال
                </p>
              )}
            </div>

            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </Button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
