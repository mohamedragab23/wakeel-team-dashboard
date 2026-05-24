'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '@/components/ui-v2/Button';
import type { Candidate } from '@/lib/recruitment/types';
import {
  CONFIRMATION_VALUES,
  EQUIPMENT_STATUS_VALUES,
  HIRING_DECISION_VALUES,
  OFFICE_MANAGER_ASSIGNMENT_OPTION,
} from '@/lib/recruitment/types';

type Props = {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function CandidateFollowupWizardModal({ candidate, open, onClose, onSaved }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Candidate>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('');

  const { data: supervisors = [] } = useQuery({
    queryKey: ['recruitment', 'operational-supervisors'],
    enabled: open,
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recruitment/supervisors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json.success ? (json.data as Array<{ code: string; name: string }>) : [];
    },
  });

  useEffect(() => {
    if (candidate) {
      setForm({ ...candidate });
      setStep(1);
      setError('');
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        setUserRole(String(user.role ?? ''));
      } catch {
        setUserRole('');
      }
    }
  }, [candidate]);

  const canMoveNext = useMemo(() => {
    if (step === 1) {
      if (form.hiringDecision === 'لن يشتغل') return !!form.notHiredReason?.trim();
      if (form.hiringDecision === 'هيشتغل') return !!form.lecturePlannedDate;
      return true;
    }
    if (step === 4 && form.equipmentStatus === 'لم يستلم') {
      return !!form.equipmentNotReceivedReason?.trim() && !!form.equipmentExpectedDate;
    }
    if (
      step === 3 &&
      userRole === 'admin' &&
      form.assignedSupervisorCode === OFFICE_MANAGER_ASSIGNMENT_OPTION &&
      (form.activationConfirmed === 'مؤكد' || form.activationStatus === 'مفعل - تم القبول')
    ) {
      return !!form.finalAssignedSupervisorCode?.trim();
    }
    return true;
  }, [form, step, userRole]);

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0a0e18] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold">متابعة المرشح خطوة بخطوة</h2>
          <p className="text-sm text-[rgba(234,240,255,0.65)] mt-1">
            {candidate.fullName} — خطوة {step} من 4
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <Field label="حالة التعيين">
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
              <Field label="لو لا.. السبب">
                <textarea
                  className={inputClass + ' min-h-[90px]'}
                  value={form.notHiredReason ?? ''}
                  onChange={(e) => setForm({ ...form, notHiredReason: e.target.value })}
                />
              </Field>
            )}
            {form.hiringDecision === 'هيشتغل' && (
              <Field label="ميعاد المحاضرة (تاريخ)">
                <input
                  type="date"
                  className={inputClass}
                  value={form.lecturePlannedDate ?? ''}
                  onChange={(e) => setForm({ ...form, lecturePlannedDate: e.target.value })}
                />
              </Field>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
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
            <Field label="حضور المحاضرة">
              <select
                className={inputClass}
                value={form.lectureAttendance ?? 'لم يحضر'}
                onChange={(e) => setForm({ ...form, lectureAttendance: e.target.value as Candidate['lectureAttendance'] })}
              >
                <option value="لم يحضر">لم يحضر</option>
                <option value="حضر">حضر</option>
                <option value="غائب">غائب</option>
              </select>
            </Field>
            <Field label="تاريخ الحضور">
              <input
                type="date"
                className={inputClass}
                value={form.lectureDate ?? ''}
                onChange={(e) => setForm({ ...form, lectureDate: e.target.value })}
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
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
            <Field label="حالة التفعيل">
              <select
                className={inputClass}
                value={form.activationStatus ?? 'غير مفعل'}
                onChange={(e) => setForm({ ...form, activationStatus: e.target.value as Candidate['activationStatus'] })}
              >
                <option value="غير مفعل">غير مفعل</option>
                <option value="مفعل - تم القبول">مفعل - تم القبول</option>
                <option value="مرفوض">مرفوض</option>
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
            {userRole === 'admin' &&
              form.assignedSupervisorCode === OFFICE_MANAGER_ASSIGNMENT_OPTION &&
              (form.activationConfirmed === 'مؤكد' || form.activationStatus === 'مفعل - تم القبول') && (
                <>
                  <Field label="تعيين المشرف بواسطة مدير المكتب">
                    <select
                      className={inputClass}
                      value={form.finalAssignedSupervisorCode ?? ''}
                      onChange={(e) => setForm({ ...form, finalAssignedSupervisorCode: e.target.value })}
                    >
                      <option value="">— اختر مشرف تشغيل —</option>
                      {supervisors.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ملاحظة التعيين (اختياري)">
                    <input
                      className={inputClass}
                      value={form.assignmentNote ?? ''}
                      onChange={(e) => setForm({ ...form, assignmentNote: e.target.value })}
                    />
                  </Field>
                </>
              )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Field label="هل استلم معداته؟">
              <select
                className={inputClass}
                value={form.equipmentStatus ?? 'لم يستلم'}
                onChange={(e) => setForm({ ...form, equipmentStatus: e.target.value as Candidate['equipmentStatus'] })}
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
                <Field label="لو لا.. ليه؟">
                  <textarea
                    className={inputClass + ' min-h-[90px]'}
                    value={form.equipmentNotReceivedReason ?? ''}
                    onChange={(e) => setForm({ ...form, equipmentNotReceivedReason: e.target.value })}
                  />
                </Field>
                <Field label="هيستلم امتى (تاريخ متوقع)">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.equipmentExpectedDate ?? ''}
                    onChange={(e) => setForm({ ...form, equipmentExpectedDate: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
        )}

        {error && <p className="text-[#FB7185] text-sm mt-3">{error}</p>}

        <div className="flex justify-between mt-6">
          <Button variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              السابق
            </Button>
            {step < 4 ? (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canMoveNext}>
                التالي
              </Button>
            ) : (
              <Button variant="primary" onClick={save} disabled={loading || !canMoveNext}>
                {loading ? 'جاري الحفظ...' : 'حفظ المتابعة'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[rgba(234,240,255,0.65)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}

