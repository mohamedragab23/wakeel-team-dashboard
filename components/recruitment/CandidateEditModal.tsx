'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui-v2/Button';
import type { Candidate } from '@/lib/recruitment/types';
import {
  ACTIVATION_STATUS_VALUES,
  CONFIRMATION_VALUES,
  CONTACT_STATUS_VALUES,
  EQUIPMENT_STATUS_VALUES,
  HIRING_DECISION_VALUES,
  LECTURE_ATTENDANCE_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@/lib/recruitment/types';
import { ZONE_OPTIONS } from '@/lib/zones';

type Props = {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function CandidateEditModal({ candidate, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Candidate>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (candidate) setForm({ ...candidate });
  }, [candidate]);

  if (!open || !candidate) return null;

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/recruitment/candidates/${candidate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الحفظ');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0a0e18] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-4">تعديل المرشح</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="الاسم الكامل">
            <input
              className={inputClass}
              value={form.fullName ?? ''}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label="رقم الهاتف">
            <input
              className={inputClass}
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="الإعلان">
            <input
              className={inputClass}
              value={form.jobAd ?? ''}
              onChange={(e) => setForm({ ...form, jobAd: e.target.value })}
            />
          </Field>
          <Field label="وسيلة العمل">
            <select
              className={inputClass}
              value={form.vehicleType ?? 'موتوسيكل'}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value as Candidate['vehicleType'] })}
            >
              {VEHICLE_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="اشتغل قبل كده؟">
            <select
              className={inputClass}
              value={form.workedBefore ?? 'لا'}
              onChange={(e) => setForm({ ...form, workedBefore: e.target.value as 'نعم' | 'لا' })}
            >
              <option value="لا">لا</option>
              <option value="نعم">نعم</option>
            </select>
          </Field>
          <Field label="المحافظة">
            <input
              className={inputClass}
              value={form.governorate ?? ''}
              onChange={(e) => setForm({ ...form, governorate: e.target.value })}
            />
          </Field>
          <Field label="الزون">
            <select className={inputClass} value={form.zone ?? ''} onChange={(e) => setForm({ ...form, zone: e.target.value })}>
              <option value="">— اختر —</option>
              {ZONE_OPTIONS.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="قرار التعيين">
            <select
              className={inputClass}
              value={form.hiringDecision ?? 'قيد المراجعة'}
              onChange={(e) => setForm({ ...form, hiringDecision: e.target.value as Candidate['hiringDecision'] })}
            >
              {HIRING_DECISION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {form.hiringDecision === 'لن يشتغل' && (
            <Field label="سبب عدم التشغيل" className="md:col-span-2">
              <textarea
                className={inputClass + ' min-h-[72px]'}
                value={form.notHiredReason ?? ''}
                onChange={(e) => setForm({ ...form, notHiredReason: e.target.value })}
              />
            </Field>
          )}
          {form.hiringDecision === 'هيشتغل' && (
            <Field label="ميعاد المحاضرة" className="md:col-span-2">
              <input
                type="date"
                className={inputClass}
                value={form.lecturePlannedDate ?? ''}
                onChange={(e) => setForm({ ...form, lecturePlannedDate: e.target.value })}
              />
            </Field>
          )}
          <Field label="تاريخ التقديم">
            <input
              type="date"
              className={inputClass}
              value={form.appliedDate ?? ''}
              onChange={(e) => setForm({ ...form, appliedDate: e.target.value })}
            />
          </Field>
          <Field label="حالة التواصل">
            <select
              className={inputClass}
              value={form.contactStatus ?? ''}
              onChange={(e) => setForm({ ...form, contactStatus: e.target.value as Candidate['contactStatus'] })}
            >
              {CONTACT_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="تاريخ التواصل">
            <input
              type="date"
              className={inputClass}
              value={form.contactDate ?? ''}
              onChange={(e) => setForm({ ...form, contactDate: e.target.value })}
            />
          </Field>
          <Field label="المشرف المسؤول">
            <input
              className={inputClass}
              value={form.assignedManager ?? ''}
              onChange={(e) => setForm({ ...form, assignedManager: e.target.value })}
            />
          </Field>
          <Field label="حضور المحاضرة">
            <select
              className={inputClass}
              value={form.lectureAttendance ?? ''}
              onChange={(e) =>
                setForm({ ...form, lectureAttendance: e.target.value as Candidate['lectureAttendance'] })
              }
            >
              {LECTURE_ATTENDANCE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="تاريخ المحاضرة">
            <input
              type="date"
              className={inputClass}
              value={form.lectureDate ?? ''}
              onChange={(e) => setForm({ ...form, lectureDate: e.target.value })}
            />
          </Field>
          <Field label="تأكيد حضور المحاضرة">
            <select
              className={inputClass}
              value={form.lectureConfirmed ?? 'غير مؤكد'}
              onChange={(e) => setForm({ ...form, lectureConfirmed: e.target.value as Candidate['lectureConfirmed'] })}
            >
              {CONFIRMATION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="حالة التفعيل">
            <select
              className={inputClass}
              value={form.activationStatus ?? ''}
              onChange={(e) =>
                setForm({ ...form, activationStatus: e.target.value as Candidate['activationStatus'] })
              }
            >
              {ACTIVATION_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="تاريخ التفعيل">
            <input
              type="date"
              className={inputClass}
              value={form.activationDate ?? ''}
              onChange={(e) => setForm({ ...form, activationDate: e.target.value })}
            />
          </Field>
          <Field label="تأكيد التفعيل">
            <select
              className={inputClass}
              value={form.activationConfirmed ?? 'غير مؤكد'}
              onChange={(e) =>
                setForm({ ...form, activationConfirmed: e.target.value as Candidate['activationConfirmed'] })
              }
            >
              {CONFIRMATION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {form.activationConfirmed === 'مؤكد' ? (
            <>
              <Field label="استلام المعدات">
                <select
                  className={inputClass}
                  value={form.equipmentStatus ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, equipmentStatus: e.target.value as Candidate['equipmentStatus'] })
                  }
                >
                  {EQUIPMENT_STATUS_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="تاريخ استلام المعدات">
                <input
                  type="date"
                  className={inputClass}
                  value={form.equipmentDate ?? ''}
                  onChange={(e) => setForm({ ...form, equipmentDate: e.target.value })}
                />
              </Field>
              {form.equipmentStatus === 'لم يستلم' && (
                <>
                  <Field label="سبب عدم الاستلام" className="md:col-span-2">
                    <textarea
                      className={inputClass + ' min-h-[72px]'}
                      value={form.equipmentNotReceivedReason ?? ''}
                      onChange={(e) => setForm({ ...form, equipmentNotReceivedReason: e.target.value })}
                    />
                  </Field>
                  <Field label="ميعاد الاستلام المتوقع" className="md:col-span-2">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.equipmentExpectedDate ?? ''}
                      onChange={(e) => setForm({ ...form, equipmentExpectedDate: e.target.value })}
                    />
                  </Field>
                </>
              )}
            </>
          ) : (
            <Field label="المعدات" className="md:col-span-2">
              <p className="text-xs text-[rgba(234,240,255,0.65)]">
                يظهر تتبع استلام المعدات بعد تأكيد التفعيل.
              </p>
            </Field>
          )}
          <Field label="ملاحظات" className="md:col-span-2">
            <textarea
              className={inputClass + ' min-h-[80px]'}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        {error && <p className="text-[#FB7185] text-sm mt-2">{error}</p>}
        <div className="flex gap-2 mt-6 justify-end">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={save} disabled={loading}>
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-[rgba(234,240,255,0.65)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}
