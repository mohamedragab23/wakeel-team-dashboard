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
import { ZONE_OPTIONS } from '@/lib/zones';

type Props = {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type AssignmentRequestDraft = {
  riderCode: string;
  riderName: string;
  zone: string;
  supervisorCode: string;
};

type ProgressState = 'done' | 'current' | 'upcoming' | 'blocked';

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function CandidateFollowupWizardModal({ candidate, open, onClose, onSaved }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Candidate>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');
  const [activationRejectReason, setActivationRejectReason] = useState('');
  const [assignmentReq, setAssignmentReq] = useState<AssignmentRequestDraft>({
    riderCode: '',
    riderName: '',
    zone: (ZONE_OPTIONS[0] as string) || '',
    supervisorCode: '',
  });
  const canManageFinalAssignment = userRole === 'admin' || userRole === 'recruitment_manager';

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
      setRequestError('');
      setRequestSuccess('');
      setActivationRejectReason('');
      setAssignmentReq({
        riderCode: '',
        riderName: candidate.fullName || '',
        zone: candidate.zone || (ZONE_OPTIONS[0] as string) || '',
        supervisorCode:
          candidate.finalAssignedSupervisorCode ||
          candidate.assignedSupervisorCode ||
          '',
      });
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        setUserRole(String(user.role ?? ''));
      } catch {
        setUserRole('');
      }
    }
  }, [candidate]);

  const canMoveNext = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (step === 1) {
      if (form.hiringDecision === 'لن يشتغل') return !!form.notHiredReason?.trim();
      if (form.hiringDecision === 'هيشتغل') {
        if (!form.lecturePlannedDate) return false;
        return form.lecturePlannedDate <= today;
      }
      return true;
    }
    if (step === 4 && form.equipmentStatus === 'لم يستلم') {
      return !!form.equipmentNotReceivedReason?.trim() && !!form.equipmentExpectedDate;
    }
    if (
      step === 3 &&
      canManageFinalAssignment &&
      form.assignedSupervisorCode === OFFICE_MANAGER_ASSIGNMENT_OPTION &&
      (form.activationConfirmed === 'مؤكد' || form.activationStatus === 'مفعل - تم القبول')
    ) {
      return !!form.finalAssignedSupervisorCode?.trim();
    }
    if (step === 3 && form.activationStatus === 'مرفوض') {
      return !!activationRejectReason.trim();
    }
    if (step === 4 && form.equipmentStatus === 'تم الاستلام') {
      return !!form.equipmentDate;
    }
    return true;
  }, [activationRejectReason, canManageFinalAssignment, form, step]);

  const activationDone = form.activationConfirmed === 'مؤكد' || form.activationStatus === 'مفعل - تم القبول';

  const progressStages = useMemo(
    () =>
      [
        {
          key: 'decision',
          label: 'قرار التشغيل',
          state: (step > 1 ? 'done' : step === 1 ? 'current' : 'upcoming') as ProgressState,
        },
        {
          key: 'lecture',
          label: 'المحاضرة',
          state: (step > 2 ? 'done' : step === 2 ? 'current' : 'upcoming') as ProgressState,
        },
        {
          key: 'activation',
          label: 'التفعيل',
          state: (step > 3 ? 'done' : step === 3 ? 'current' : 'upcoming') as ProgressState,
        },
        {
          key: 'adminRequest',
          label: 'طلب الأدمن',
          state: (requestSuccess
            ? 'done'
            : activationDone && step >= 3
              ? 'current'
              : 'blocked') as ProgressState,
        },
        {
          key: 'equipment',
          label: 'الاستلام',
          state: (step === 4 ? 'current' : step > 4 ? 'done' : 'upcoming') as ProgressState,
        },
      ] as Array<{ key: string; label: string; state: ProgressState }>,
    [activationDone, requestSuccess, step]
  );

  if (!open || !candidate) return null;

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      const payload: Partial<Candidate> = { ...form };
      if (form.activationStatus === 'مرفوض' && activationRejectReason.trim()) {
        const reasonText = `سبب عدم التفعيل: ${activationRejectReason.trim()}`;
        payload.notes = [form.notes?.trim(), reasonText].filter(Boolean).join(' | ');
      }
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/recruitment/candidates/${candidate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
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

  const sendAssignmentRequest = async () => {
    const riderCode = assignmentReq.riderCode.trim();
    const riderName = assignmentReq.riderName.trim();
    const zone = assignmentReq.zone.trim();
    const supervisorCode = assignmentReq.supervisorCode.trim();
    if (!riderCode || !riderName || !zone || !supervisorCode) {
      setRequestError('اكتب كود واسم المندوب والزون واختر المشرف');
      return;
    }
    setRequestLoading(true);
    setRequestError('');
    setRequestSuccess('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/assignment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          riderCode,
          riderName,
          zone,
          supervisorCode,
          source: 'recruitment',
          candidateId: candidate.id,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل إرسال طلب التعيين');
      setRequestSuccess('تم إرسال الطلب للإدارة بنجاح. سيظهر في صفحة طلبات التعيين لدى الأدمن.');
    } catch (e: unknown) {
      setRequestError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setRequestLoading(false);
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
        <WizardProgress stages={progressStages} />

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
              <>
                <Field label="ميعاد المحاضرة (تاريخ)">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.lecturePlannedDate ?? ''}
                    onChange={(e) => setForm({ ...form, lecturePlannedDate: e.target.value })}
                  />
                </Field>
                {form.lecturePlannedDate && form.lecturePlannedDate > new Date().toISOString().slice(0, 10) && (
                  <p className="text-xs text-amber-300">
                    تم حفظ موعد المحاضرة. المتابعة لباقي المراحل ستكون متاحة في يوم المحاضرة أو بعده.
                  </p>
                )}
              </>
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
            {form.activationStatus === 'مرفوض' && (
              <Field label="سبب عدم التفعيل">
                <textarea
                  className={inputClass + ' min-h-[80px]'}
                  value={activationRejectReason}
                  onChange={(e) => setActivationRejectReason(e.target.value)}
                />
              </Field>
            )}
            <Field label="تاريخ التفعيل">
              <input
                type="date"
                className={inputClass}
                value={form.activationDate ?? ''}
                onChange={(e) => setForm({ ...form, activationDate: e.target.value })}
              />
            </Field>
            {canManageFinalAssignment &&
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
            {(form.activationConfirmed === 'مؤكد' || form.activationStatus === 'مفعل - تم القبول') &&
              canManageFinalAssignment && (
                <div className="mt-2 p-3 rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] space-y-3">
                  <p className="text-sm font-semibold">إرسال طلب تعيين المندوب للأدمن</p>
                  <p className="text-xs text-[rgba(234,240,255,0.65)]">
                    بعد إرسال الطلب وموافقة الأدمن، سيتم إضافة المندوب تلقائيًا لقائمة مناديب المشرف.
                  </p>
                  <div className="grid md:grid-cols-2 gap-2">
                    <Field label="كود المندوب">
                      <input
                        className={inputClass}
                        value={assignmentReq.riderCode}
                        onChange={(e) => setAssignmentReq({ ...assignmentReq, riderCode: e.target.value })}
                      />
                    </Field>
                    <Field label="اسم المندوب">
                      <input
                        className={inputClass}
                        value={assignmentReq.riderName}
                        onChange={(e) => setAssignmentReq({ ...assignmentReq, riderName: e.target.value })}
                      />
                    </Field>
                    <Field label="الزون">
                      <select
                        className={inputClass}
                        value={assignmentReq.zone}
                        onChange={(e) => setAssignmentReq({ ...assignmentReq, zone: e.target.value })}
                      >
                        {ZONE_OPTIONS.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="المشرف المستهدف">
                      <select
                        className={inputClass}
                        value={assignmentReq.supervisorCode}
                        onChange={(e) =>
                          setAssignmentReq({ ...assignmentReq, supervisorCode: e.target.value })
                        }
                      >
                        <option value="">— اختر مشرف —</option>
                        {supervisors.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {requestError ? <p className="text-[#FB7185] text-xs">{requestError}</p> : null}
                  {requestSuccess ? <p className="text-emerald-300 text-xs">{requestSuccess}</p> : null}
                  <div className="flex justify-end">
                    <Button variant="secondary" onClick={sendAssignmentRequest} disabled={requestLoading}>
                      {requestLoading ? 'جاري الإرسال...' : 'إرسال طلب للأدمن'}
                    </Button>
                  </div>
                </div>
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

function WizardProgress({
  stages,
}: {
  stages: Array<{ key: string; label: string; state: ProgressState }>;
}) {
  const cls = (state: ProgressState) => {
    if (state === 'done') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    if (state === 'current') return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    if (state === 'blocked') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <span
            key={stage.key}
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${cls(stage.state)}`}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  );
}

