'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ORDER_ISSUE_CATEGORIES,
  ORDER_ISSUE_CATEGORY_LABELS_AR,
  TICKET_TYPES,
  TICKET_TYPE_LABELS_AR,
  type TicketType } from '@/lib/ticketing/types';
import { ZONE_OPTIONS } from '@/lib/zones';

export default function NewTicketPage() {
  const router = useRouter();
  const [type, setType] = useState<TicketType>('general_request');
  const [zone, setZone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const [fields, setFields] = useState<Record<string, string>>({});

  const setField = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { type, zone, ...fields };
      if (type === 'rider_suspension' && fields.suspensionDays) {
        payload.suspensionDays = Number(fields.suspensionDays);
      }
      if (type === 'order_issue' && !fields.issueCategory) {
        throw new Error('فئة المشكلة مطلوبة');
      }
      if (type === 'general_request' && (!fields.subject || !fields.description)) {
        throw new Error('الموضوع والوصف مطلوبان');
      }

      const form = new FormData();
      form.append('data', JSON.stringify(payload));
      if (files) {
        Array.from(files).forEach((f) => form.append('files', f));
      }

      const res = await authFetch('/api/ticketing', {
        method: 'POST',
        body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الإرسال');
      router.push(`/ticketing/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <label className="block text-sm">
        نوع الطلب
        <select
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
          value={type}
          onChange={(e) => setType(e.target.value as TicketType)}
        >
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TICKET_TYPE_LABELS_AR[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        المنطقة *
        <select
          required
          className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="">اختر المنطقة</option>
          {ZONE_OPTIONS.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </label>

      {type === 'order_issue' && (
        <>
          <Field label="كود الطيار" value={fields.riderId} onChange={(v) => setField('riderId', v)} />
          <Field label="اسم الطيار" value={fields.riderName} onChange={(v) => setField('riderName', v)} />
          <Field label="رقم الطلب" value={fields.orderId} onChange={(v) => setField('orderId', v)} />
          <Field label="تاريخ الطلب" value={fields.orderDate} onChange={(v) => setField('orderDate', v)} />
          <label className="block text-sm">
            فئة المشكلة *
            <select
              required
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
              value={fields.issueCategory || ''}
              onChange={(e) => setField('issueCategory', e.target.value)}
            >
              <option value="">اختر</option>
              {ORDER_ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {ORDER_ISSUE_CATEGORY_LABELS_AR[c]}
                </option>
              ))}
            </select>
          </label>
          <TextArea label="الوصف *" required value={fields.description} onChange={(v) => setField('description', v)} />
        </>
      )}

      {type === 'security_clearance' && (
        <>
          <Field label="كود الطيار" value={fields.riderId} onChange={(v) => setField('riderId', v)} />
          <Field label="اسم الطيار" value={fields.riderName} onChange={(v) => setField('riderName', v)} />
          <Field label="الرقم القومي" value={fields.nationalId} onChange={(v) => setField('nationalId', v)} />
          <TextArea label="ملاحظات" value={fields.notes} onChange={(v) => setField('notes', v)} />
        </>
      )}

      {type === 'rider_suspension' && (
        <>
          <Field label="كود الطيار" value={fields.riderId} onChange={(v) => setField('riderId', v)} />
          <Field label="اسم الطيار" value={fields.riderName} onChange={(v) => setField('riderName', v)} />
          <TextArea label="سبب الإيقاف *" required value={fields.suspensionReason} onChange={(v) => setField('suspensionReason', v)} />
          <Field label="تاريخ البداية" type="date" value={fields.suspensionStartDate} onChange={(v) => setField('suspensionStartDate', v)} />
          <Field label="تاريخ النهاية" type="date" value={fields.suspensionEndDate} onChange={(v) => setField('suspensionEndDate', v)} />
          <Field label="عدد الأيام" type="number" value={fields.suspensionDays} onChange={(v) => setField('suspensionDays', v)} />
          <TextArea label="ملاحظات" value={fields.notes} onChange={(v) => setField('notes', v)} />
        </>
      )}

      {type === 'general_request' && (
        <>
          <Field label="الموضوع *" required value={fields.subject} onChange={(v) => setField('subject', v)} />
          <TextArea label="الوصف *" required value={fields.description} onChange={(v) => setField('description', v)} />
        </>
      )}

      <label className="block text-sm">
        مرفقات (PDF, PNG, JPG — حتى 20MB لكل ملف)
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf"
          className="mt-1 block w-full text-sm"
          onChange={(e) => setFiles(e.target.files)}
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2 rounded-lg bg-gradient-to-l from-cyan-500 to-purple-500 text-black font-medium disabled:opacity-50"
      >
        {loading ? 'جاري الإرسال…' : 'إرسال الطلب'}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required }: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type={type}
        required={required}
        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required }: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <textarea
        required={required}
        rows={4}
        className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 p-2"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
