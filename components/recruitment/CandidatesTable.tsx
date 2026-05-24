'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui-v2/Button';
import Card from '@/components/ui-v2/Card';
import Toast, { type ToastMessage } from '@/components/ui-v2/Toast';
import type { Candidate } from '@/lib/recruitment/types';
import {
  ACTIVATION_STATUS_VALUES,
  ASSIGNMENT_STATUS_VALUES,
  CONTACT_STATUS_VALUES,
  EQUIPMENT_STATUS_VALUES,
  LECTURE_ATTENDANCE_VALUES,
} from '@/lib/recruitment/types';
import CandidateEditModal from './CandidateEditModal';
import ContactLogModal from './ContactLogModal';
import ActivityLogModal from './ActivityLogModal';
import CandidateFollowupWizardModal from './CandidateFollowupWizardModal';

type Mode = 'active' | 'archive';

const selectClass =
  'rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-2 py-1.5 text-sm text-[#EAF0FF]';

export default function CandidatesTable({ mode }: { mode: Mode }) {
  const queryClient = useQueryClient();
  const pipelineStatus = mode === 'archive' ? 'archived' : 'active';

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [contactStatus, setContactStatus] = useState('');
  const [lectureAttendance, setLectureAttendance] = useState('');
  const [activationStatus, setActivationStatus] = useState('');
  const [equipmentStatus, setEquipmentStatus] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState('');
  const [finalAssignedSupervisorCode, setFinalAssignedSupervisorCode] = useState('');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');

  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [contactCandidate, setContactCandidate] = useState<Candidate | null>(null);
  const [activityCandidate, setActivityCandidate] = useState<Candidate | null>(null);
  const [wizardCandidate, setWizardCandidate] = useState<Candidate | null>(null);
  const [userRole, setUserRole] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [rowAssignDraft, setRowAssignDraft] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setUserRole(String(u.role ?? ''));
      setIsAdmin(u.role === 'admin');
    } catch {
      setUserRole('');
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const queryKey = [
    'recruitment',
    'candidates',
    pipelineStatus,
    debouncedQ,
    contactStatus,
    lectureAttendance,
    activationStatus,
    equipmentStatus,
    assignmentStatus,
    finalAssignedSupervisorCode,
    appliedDateFrom,
    appliedDateTo,
  ];

  const { data: candidates = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const url = new URL('/api/recruitment/candidates', window.location.origin);
      url.searchParams.set('pipelineStatus', pipelineStatus);
      if (debouncedQ) url.searchParams.set('q', debouncedQ);
      if (contactStatus) url.searchParams.set('contactStatus', contactStatus);
      if (lectureAttendance) url.searchParams.set('lectureAttendance', lectureAttendance);
      if (activationStatus) url.searchParams.set('activationStatus', activationStatus);
      if (equipmentStatus) url.searchParams.set('equipmentStatus', equipmentStatus);
      if (assignmentStatus) url.searchParams.set('assignmentStatus', assignmentStatus);
      if (finalAssignedSupervisorCode) {
        url.searchParams.set('finalAssignedSupervisorCode', finalAssignedSupervisorCode);
      }
      if (appliedDateFrom) url.searchParams.set('appliedDateFrom', appliedDateFrom);
      if (appliedDateTo) url.searchParams.set('appliedDateTo', appliedDateTo);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json.success ? (json.data as Candidate[]) : [];
    },
  });

  const activeFiltersCount = useMemo(() => {
    const filters = [
      debouncedQ,
      contactStatus,
      lectureAttendance,
      activationStatus,
      equipmentStatus,
      assignmentStatus,
      finalAssignedSupervisorCode,
      appliedDateFrom,
      appliedDateTo,
    ];
    return filters.filter((v) => !!v).length;
  }, [
    debouncedQ,
    contactStatus,
    lectureAttendance,
    activationStatus,
    equipmentStatus,
    assignmentStatus,
    finalAssignedSupervisorCode,
    appliedDateFrom,
    appliedDateTo,
  ]);

  const { data: operationalSupervisors = [] } = useQuery({
    queryKey: ['recruitment', 'operational-supervisors'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/recruitment/supervisors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return json.success ? (json.data as Array<{ code: string; name: string }>) : [];
    },
  });

  const supervisorNameByCode = useMemo(
    () => Object.fromEntries(operationalSupervisors.map((s) => [s.code, s.name])),
    [operationalSupervisors]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['recruitment'] });
    refetch();
  };

  const showToast = (type: ToastMessage['type'], text: string) => {
    setToast({ type, text });
  };

  const exportExcel = () => {
    const token = localStorage.getItem('token');
    const url = new URL('/api/recruitment/export', window.location.origin);
    url.searchParams.set('pipelineStatus', pipelineStatus);
    if (debouncedQ) url.searchParams.set('q', debouncedQ);
    fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `candidates-${pipelineStatus}.xlsx`;
        a.click();
      });
  };

  const reactivate = async (id: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/recruitment/candidates/${id}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      invalidate();
      showToast('success', 'تمت إعادة التفعيل بنجاح');
    } else {
      showToast('error', json.error || 'فشل');
    }
  };

  const logInterest = async (id: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/recruitment/candidates/${id}/interest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      invalidate();
      showToast('success', 'تم تسجيل الاهتمام بنجاح');
    } else {
      showToast('error', json.error || 'فشل');
    }
  };

  const quickUpdateCandidate = async (
    id: string,
    patch: Partial<Candidate>,
    failMessage: string
  ): Promise<boolean> => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/recruitment/candidates/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (json.success) {
      invalidate();
      showToast('success', 'تم حفظ التحديث بنجاح');
      return true;
    }
    showToast('error', json.error || failMessage);
    return false;
  };

  const quickAssignFinalSupervisor = async (candidate: Candidate) => {
    const chosen = (
      rowAssignDraft[candidate.id] ||
      candidate.finalAssignedSupervisorCode ||
      candidate.assignedSupervisorCode ||
      ''
    ).trim();
    if (!chosen) {
      showToast('warning', 'اختر مشرف تشغيل أولاً');
      return;
    }
    if (
      candidate.activationConfirmed !== 'مؤكد' &&
      candidate.activationStatus !== 'مفعل - تم القبول'
    ) {
      showToast('warning', 'الإسناد النهائي متاح بعد تأكيد التفعيل');
      return;
    }
    if (candidate.finalAssignedSupervisorCode === chosen) {
      showToast('warning', 'هذا المرشح مُسند بالفعل لنفس المشرف');
      return;
    }
    const supervisorLabel = supervisorNameByCode[chosen]
      ? `${supervisorNameByCode[chosen]} (${chosen})`
      : chosen;
    const ok = window.confirm(`تأكيد الإسناد الفوري للمرشح "${candidate.fullName}" إلى ${supervisorLabel}؟`);
    if (!ok) return;
    setAssigningId(candidate.id);
    const saved = await quickUpdateCandidate(
      candidate.id,
      {
        finalAssignedSupervisorCode: chosen,
        assignmentStatus: 'تم التعيين',
        assignedAt: new Date().toISOString().slice(0, 10),
        assignmentNote: 'إسناد فوري من الجدول بواسطة الأدمن',
      },
      'فشل الإسناد الفوري'
    );
    setAssigningId(null);
    if (saved) {
      setRowAssignDraft((prev) => ({ ...prev, [candidate.id]: chosen }));
      showToast('success', 'تم تنفيذ الإسناد الفوري بنجاح');
    }
  };

  const clearFilters = () => {
    setQ('');
    setDebouncedQ('');
    setContactStatus('');
    setLectureAttendance('');
    setActivationStatus('');
    setEquipmentStatus('');
    setAssignmentStatus('');
    setFinalAssignedSupervisorCode('');
    setAppliedDateFrom('');
    setAppliedDateTo('');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[rgba(234,240,255,0.75)]">
          <span className="opacity-80">دليل الألوان:</span>
          <LegendItem label="نجاح/مؤكد" className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" />
          <LegendItem label="رفض/فشل" className="bg-rose-500/20 text-rose-300 border border-rose-500/40" />
          <LegendItem label="انتظار/قيد المراجعة" className="bg-amber-500/20 text-amber-300 border border-amber-500/40" />
          <LegendItem label="متابعة/مستحق" className="bg-sky-500/20 text-sky-300 border border-sky-500/40" />
          <LegendItem label="غير محدد" className="bg-slate-500/20 text-slate-300 border border-slate-500/40" />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <FilterField label="بحث">
            <input
              className={selectClass + ' min-w-[180px]'}
              placeholder="اسم، هاتف، إعلان"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </FilterField>
          <FilterField label="حالة التواصل">
            <select className={selectClass} value={contactStatus} onChange={(e) => setContactStatus(e.target.value)}>
              <option value="">الكل</option>
              {CONTACT_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="المحاضرة">
            <select
              className={selectClass}
              value={lectureAttendance}
              onChange={(e) => setLectureAttendance(e.target.value)}
            >
              <option value="">الكل</option>
              {LECTURE_ATTENDANCE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="التفعيل">
            <select
              className={selectClass}
              value={activationStatus}
              onChange={(e) => setActivationStatus(e.target.value)}
            >
              <option value="">الكل</option>
              {ACTIVATION_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="المعدات">
            <select
              className={selectClass}
              value={equipmentStatus}
              onChange={(e) => setEquipmentStatus(e.target.value)}
            >
              <option value="">الكل</option>
              {EQUIPMENT_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="حالة الإسناد">
            <select
              className={selectClass}
              value={assignmentStatus}
              onChange={(e) => setAssignmentStatus(e.target.value)}
            >
              <option value="">الكل</option>
              {ASSIGNMENT_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="المشرف النهائي">
            <select
              className={selectClass + ' min-w-[180px]'}
              value={finalAssignedSupervisorCode}
              onChange={(e) => setFinalAssignedSupervisorCode(e.target.value)}
            >
              <option value="">الكل</option>
              {operationalSupervisors.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="من تاريخ">
            <input
              type="date"
              className={selectClass}
              value={appliedDateFrom}
              onChange={(e) => setAppliedDateFrom(e.target.value)}
            />
          </FilterField>
          <FilterField label="إلى تاريخ">
            <input
              type="date"
              className={selectClass}
              value={appliedDateTo}
              onChange={(e) => setAppliedDateTo(e.target.value)}
            />
          </FilterField>
          <Button variant="secondary" onClick={() => refetch()}>
            تطبيق
          </Button>
          <Button variant="secondary" onClick={clearFilters}>
            مسح الفلاتر
          </Button>
          <Button variant="primary" onClick={exportExcel}>
            تصدير Excel
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[rgba(234,240,255,0.65)]">
          <span>
            فلاتر نشطة: <strong className="text-[rgba(234,240,255,0.92)]">{activeFiltersCount}</strong>
          </span>
          <span>
            إجمالي النتائج الحالية: <strong className="text-[rgba(234,240,255,0.92)]">{candidates.length}</strong>
          </span>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {isLoading ? (
          <p className="p-6">جاري التحميل...</p>
        ) : candidates.length === 0 ? (
          <p className="p-6 text-[rgba(234,240,255,0.6)]">لا توجد سجلات</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.10)] text-[rgba(234,240,255,0.7)]">
                <th className="p-3 text-start">الاسم</th>
                <th className="p-3 text-start">الهاتف</th>
                <th className="p-3 text-start">الوسيلة</th>
                <th className="p-3 text-start">المحافظة</th>
                <th className="p-3 text-start">الزون</th>
                <th className="p-3 text-start">الإعلان</th>
                <th className="p-3 text-start">التقديم</th>
                <th className="p-3 text-start">قرار التعيين</th>
                <th className="p-3 text-start">التواصل</th>
                <th className="p-3 text-start">المحاضرة</th>
                <th className="p-3 text-start">التفعيل</th>
                <th className="p-3 text-start">المعدات</th>
                <th className="p-3 text-start">حالة الإسناد</th>
                <th className="p-3 text-start">المشرف النهائي</th>
                {mode === 'archive' && <th className="p-3 text-start">انتهاء سابق</th>}
                <th className="p-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)]">
                  <td className="p-3">{c.fullName}</td>
                  <td className="p-3 font-mono">{c.phone}</td>
                  <td className="p-3">{c.vehicleType}</td>
                  <td className="p-3">{c.governorate || '—'}</td>
                  <td className="p-3">{c.zone || '—'}</td>
                  <td className="p-3 max-w-[140px] truncate" title={c.jobAd}>
                    {c.jobAd}
                  </td>
                  <td className="p-3">{c.appliedDate}</td>
                  <td className="p-3">
                    <StatusBadge value={c.hiringDecision} kind="decision" hint={statusHint(c, 'decision')} />
                  </td>
                  <td className="p-3">
                    <StatusBadge value={c.contactStatus} kind="contact" hint={statusHint(c, 'contact')} />
                  </td>
                  <td className="p-3">
                    <StatusBadge value={c.lectureAttendance} kind="lecture" hint={statusHint(c, 'lecture')} />
                  </td>
                  <td className="p-3">
                    <StatusBadge value={c.activationStatus} kind="activation" hint={statusHint(c, 'activation')} />
                  </td>
                  <td className="p-3">
                    <StatusBadge value={c.equipmentStatus} kind="equipment" hint={statusHint(c, 'equipment')} />
                  </td>
                  <td className="p-3">
                    <StatusBadge value={c.assignmentStatus || 'غير محدد'} kind="decision" hint={assignmentHint(c)} />
                  </td>
                  <td className="p-3">
                    {(() => {
                      const code = c.finalAssignedSupervisorCode || c.assignedSupervisorCode || '';
                      if (!code) return <span className="font-mono">—</span>;
                      const name = supervisorNameByCode[code];
                      return (
                        <div className="leading-tight" title={name ? `${name} (${code})` : code}>
                          <div className="text-[rgba(234,240,255,0.92)]">{name || 'مشرف غير معروف'}</div>
                          <div className="font-mono text-xs text-[rgba(234,240,255,0.65)]">{code}</div>
                        </div>
                      );
                    })()}
                  </td>
                  {mode === 'archive' && <td className="p-3">{c.previousEndDate || '—'}</td>}
                  <td className="p-3">
                    {(() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const lectureDone = c.lectureConfirmed === 'مؤكد' || c.lectureAttendance === 'حضر';
                      const waitingForLectureDate =
                        c.hiringDecision === 'هيشتغل' &&
                        !!c.lecturePlannedDate &&
                        c.lecturePlannedDate > today &&
                        !lectureDone;
                      if (!waitingForLectureDate) return null;
                      return (
                        <div className="mb-2">
                          <span
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs border bg-amber-500/15 text-amber-300 border-amber-500/35"
                            title={`بانتظار تاريخ المحاضرة: ${c.lecturePlannedDate}`}
                          >
                            بانتظار موعد المحاضرة ({c.lecturePlannedDate})
                          </span>
                        </div>
                      );
                    })()}
                    <div className="flex flex-wrap gap-1">
                      {mode === 'active' && (
                        <>
                          {(() => {
                            const canOperate = userRole === 'admin' || userRole === 'recruitment_manager' || userRole === '';
                            const today = new Date().toISOString().slice(0, 10);
                            const lectureDone = c.lectureConfirmed === 'مؤكد' || c.lectureAttendance === 'حضر';
                            const waitingForLectureDate =
                              c.hiringDecision === 'هيشتغل' &&
                              !!c.lecturePlannedDate &&
                              c.lecturePlannedDate > today &&
                              !lectureDone;
                            return (
                              <>
                          <ActionBtn
                            onClick={() => setWizardCandidate(c)}
                            disabled={waitingForLectureDate}
                            title={
                              waitingForLectureDate
                                ? `المتابعة متاحة بدءًا من ${c.lecturePlannedDate}`
                                : 'فتح متابعة المرشح'
                            }
                          >
                            متابعة
                          </ActionBtn>
                          <ActionBtn onClick={() => setContactCandidate(c)} title="تسجيل نتيجة التواصل" disabled={!canOperate}>
                            تم التواصل
                          </ActionBtn>
                              </>
                            );
                          })()}
                          {isAdmin && <ActionBtn onClick={() => setEditCandidate(c)}>تعديل</ActionBtn>}
                        </>
                      )}
                      {mode === 'archive' && (
                        <>
                          <ActionBtn onClick={() => reactivate(c.id)}>إعادة تفعيل</ActionBtn>
                          <ActionBtn onClick={() => logInterest(c.id)}>تسجيل اهتمام</ActionBtn>
                        </>
                      )}
                      {isAdmin && mode === 'active' && (
                        <>
                          {(() => {
                            const rowSelected =
                              rowAssignDraft[c.id] ??
                              c.finalAssignedSupervisorCode ??
                              c.assignedSupervisorCode ??
                              '';
                            const assignBlockedByStage =
                              c.activationConfirmed !== 'مؤكد' && c.activationStatus !== 'مفعل - تم القبول';
                            const assignSameAsFinal = !!rowSelected && rowSelected === c.finalAssignedSupervisorCode;
                            const assignDisabled =
                              assigningId === c.id || !rowSelected || assignBlockedByStage || assignSameAsFinal;
                            const assignTitle = assignBlockedByStage
                              ? 'الإسناد النهائي متاح بعد تأكيد التفعيل'
                              : assignSameAsFinal
                                ? 'المرشح مسند بالفعل لنفس المشرف'
                                : !rowSelected
                                  ? 'اختر مشرف تشغيل أولاً'
                                  : 'تنفيذ إسناد فوري';
                            return (
                              <>
                          <select
                            className="px-2 py-1 text-xs rounded bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.14)]"
                            value={rowSelected}
                            onChange={(e) =>
                              setRowAssignDraft((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">اختر مشرف</option>
                            {operationalSupervisors.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.name} ({s.code})
                              </option>
                            ))}
                          </select>
                          <ActionBtn
                            onClick={() => quickAssignFinalSupervisor(c)}
                            disabled={assignDisabled}
                            title={assignTitle}
                          >
                            {assigningId === c.id ? 'جارٍ الإسناد...' : 'إسناد فوري'}
                          </ActionBtn>
                              </>
                            );
                          })()}
                        </>
                      )}
                      {isAdmin && (
                        <ActionBtn onClick={() => setActivityCandidate(c)}>سجل</ActionBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <CandidateEditModal
        candidate={editCandidate}
        open={!!editCandidate}
        onClose={() => setEditCandidate(null)}
        onSaved={invalidate}
      />
      <ContactLogModal
        candidate={contactCandidate}
        open={!!contactCandidate}
        onClose={() => setContactCandidate(null)}
        onSaved={invalidate}
      />
      <ActivityLogModal
        candidate={activityCandidate}
        open={!!activityCandidate}
        onClose={() => setActivityCandidate(null)}
      />
      <CandidateFollowupWizardModal
        candidate={wizardCandidate}
        open={!!wizardCandidate}
        onClose={() => setWizardCandidate(null)}
        onSaved={invalidate}
      />
      <Toast message={toast} />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[rgba(234,240,255,0.6)]">{label}</span>
      {children}
    </label>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        disabled
          ? 'bg-[rgba(255,255,255,0.04)] text-[rgba(234,240,255,0.35)] cursor-not-allowed'
          : 'bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)]'
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  value,
  kind,
  hint,
}: {
  value: string;
  kind: 'decision' | 'contact' | 'lecture' | 'activation' | 'equipment';
  hint?: string;
}) {
  const cls = badgeClass(value, kind);
  return (
    <span
      title={hint || value || ''}
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-help ${cls}`}
    >
      {value || '—'}
    </span>
  );
}

function badgeClass(value: string, kind: 'decision' | 'contact' | 'lecture' | 'activation' | 'equipment'): string {
  if (kind === 'decision') {
    if (value === 'هيشتغل') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    if (value === 'لن يشتغل') return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
  }
  if (kind === 'contact') {
    if (value === 'تم الرد') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    if (value === 'تم التواصل') return 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
    if (value === 'لم يتم الرد') return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
    return 'bg-slate-500/20 text-slate-300 border border-slate-500/40';
  }
  if (kind === 'lecture') {
    if (value === 'حضر') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    if (value === 'غائب') return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
    return 'bg-slate-500/20 text-slate-300 border border-slate-500/40';
  }
  if (kind === 'activation') {
    if (value === 'مفعل - تم القبول') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    if (value === 'مرفوض') return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
  }
  if (value === 'تم الاستلام') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
  if (value === 'مستحق للاستلام') return 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
  return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
}

function LegendItem({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex items-center px-2 py-1 rounded-full ${className}`}>{label}</span>;
}

function statusHint(
  c: Candidate,
  kind: 'decision' | 'contact' | 'lecture' | 'activation' | 'equipment'
): string {
  if (kind === 'decision') {
    if (c.hiringDecision === 'لن يشتغل') {
      return c.notHiredReason ? `سبب عدم التشغيل: ${c.notHiredReason}` : 'لم يتم تسجيل سبب عدم التشغيل';
    }
    if (c.hiringDecision === 'هيشتغل') {
      return c.lecturePlannedDate ? `موعد المحاضرة المخطط: ${c.lecturePlannedDate}` : 'لم يحدد موعد المحاضرة بعد';
    }
    return 'قيد المراجعة حتى الآن';
  }
  if (kind === 'contact') {
    return c.contactDate ? `آخر تواصل: ${c.contactDate}` : 'لا يوجد تاريخ تواصل مسجل';
  }
  if (kind === 'lecture') {
    const parts: string[] = [];
    parts.push(`تأكيد الحضور: ${c.lectureConfirmed || 'غير مؤكد'}`);
    if (c.lecturePlannedDate) parts.push(`الموعد المخطط: ${c.lecturePlannedDate}`);
    if (c.lectureDate) parts.push(`تاريخ الحضور: ${c.lectureDate}`);
    return parts.join(' | ');
  }
  if (kind === 'activation') {
    const parts: string[] = [];
    parts.push(`تأكيد التفعيل: ${c.activationConfirmed || 'غير مؤكد'}`);
    if (c.activationDate) parts.push(`تاريخ التفعيل: ${c.activationDate}`);
    return parts.join(' | ');
  }
  const parts: string[] = [];
  if (c.equipmentDate) parts.push(`تاريخ الاستلام: ${c.equipmentDate}`);
  if (c.equipmentNotReceivedReason) parts.push(`سبب عدم الاستلام: ${c.equipmentNotReceivedReason}`);
  if (c.equipmentExpectedDate) parts.push(`الاستلام المتوقع: ${c.equipmentExpectedDate}`);
  return parts.length ? parts.join(' | ') : 'لا توجد تفاصيل إضافية للمعدات';
}

function assignmentHint(c: Candidate): string {
  const parts: string[] = [];
  if (c.assignedSupervisorCode) parts.push(`اختيار أولي: ${c.assignedSupervisorCode}`);
  if (c.finalAssignedSupervisorCode) parts.push(`إسناد نهائي: ${c.finalAssignedSupervisorCode}`);
  if (c.assignedAt) parts.push(`تاريخ الإسناد: ${c.assignedAt}`);
  if (c.assignmentNote) parts.push(`ملاحظة: ${c.assignmentNote}`);
  return parts.length ? parts.join(' | ') : 'لم يتم إسناد مشرف حتى الآن';
}
