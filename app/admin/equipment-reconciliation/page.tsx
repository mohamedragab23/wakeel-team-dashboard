'use client';

/**
 * FLOW A — One-time Opening Balance / Equipment Reconciliation (Admin).
 * Preview always. Persist only when write flag + pilot allowlist + confirm.
 */
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type ListRider = {
  riderCode: string;
  name: string;
  zone: string;
  supervisorCode: string;
  supervisorName: string;
  joinDate: string;
  status: string;
  active: boolean;
  reconciliationStatus: 'NOT_MIGRATED' | 'READY' | 'MIGRATED' | 'CONFLICT';
  migrationKey: string;
  openingIssueId: string | null;
  openingOutstandingMilli: number | null;
  identityReady: boolean;
  reconciliationDataComplete: boolean;
  candidateRequired: boolean;
  onPilotAllowlist?: boolean;
};

type PreviewOk = {
  ok: true;
  migrationKey: string;
  status: string;
  zeroBalancePolicy: string;
  originalLiabilityEgp: number;
  historicalPaidEgp: number;
  outstandingEgp: number;
  entersExpectedRequest: boolean;
  financialSideEffects: { productionWrite: false };
};

const emptyForm = {
  motorcycleBagHeld: false,
  bicycleBagHeld: false,
  tshirtQuantity: 0,
  jacketQuantity: 0,
  helmetQuantity: 0,
  securityStatus: '' as '' | 'PAID' | 'NOT_PAID',
  historicalPaidEgp: 0,
  evidenceReference: '',
  notes: '',
  operatorConfirmation: false,
};

function statusBadgeClass(s: ListRider['reconciliationStatus']) {
  switch (s) {
    case 'MIGRATED':
      return 'bg-emerald-500/25 text-emerald-100';
    case 'READY':
      return 'bg-sky-500/25 text-sky-100';
    case 'CONFLICT':
      return 'bg-rose-500/25 text-rose-100';
    default:
      return 'bg-white/10 text-[#EAF0FF]';
  }
}

export default function EquipmentReconciliationPage() {
  const [q, setQ] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<string | null>(null);
  const [persistAllowed, setPersistAllowed] = useState(false);
  const [persistResult, setPersistResult] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'equipment-reconciliation', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const res = await authFetch(
        `/api/admin/equipment-reconciliation?${params.toString()}`
      );
      return res.json() as Promise<{
        success: boolean;
        error?: string;
        riders?: ListRider[];
        diagnostic4811093?: {
          identityReady: boolean;
          reconciliationDataComplete: boolean;
          candidateRequired: false;
          migrationKey: string;
          alreadyMigrated: boolean;
          openingLiability?: string;
        };
        financialApplyEnabled?: boolean;
        autoRequestEnabled?: boolean;
        openingBalanceWriteEnabled?: boolean;
        productionWritesEnabled?: boolean;
        pilotAllowlist?: string[];
        note?: string;
      }>;
    },
  });

  const riders = listQ.data?.riders || [];
  const selected = useMemo(
    () => riders.find((r) => r.riderCode === selectedCode) || null,
    [riders, selectedCode]
  );

  const selectRider = (r: ListRider) => {
    setSelectedCode(r.riderCode);
    // Never invent / prefill equipment or paid amounts (including 4811093).
    setForm(emptyForm);
    setPreview(null);
    setPreviewError(null);
    setPreviewMeta(null);
    setPersistAllowed(false);
    setPersistResult(null);
  };

  const buildBody = (action: 'preview' | 'persist', confirmPersist?: boolean) => {
    if (!selected) throw new Error('اختر مندوبًا');
    return {
      action,
      confirmPersist: confirmPersist === true,
      CONFIRM_OPENING_PRODUCTION_WRITE:
        action === 'persist' && confirmPersist === true ? 'YES' : undefined,
      riderCode: selected.riderCode,
      motorcycleBagHeld: form.motorcycleBagHeld,
      bicycleBagHeld: form.bicycleBagHeld,
      tshirtQuantity: form.tshirtQuantity,
      jacketQuantity: form.jacketQuantity,
      helmetQuantity: form.helmetQuantity,
      securityStatus: form.securityStatus,
      historicalPaidEgp: form.historicalPaidEgp,
      evidenceReference: form.evidenceReference,
      notes: form.notes,
      operatorConfirmation: form.operatorConfirmation,
      riderNameSnapshot: selected.name,
      zoneSnapshot: selected.zone,
      supervisorCodeSnapshot: selected.supervisorCode,
      supervisorNameSnapshot: selected.supervisorName,
    };
  };

  const previewMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/admin/equipment-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('preview')),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPreview(null);
      setPreviewError(null);
      setPreviewMeta(null);
      setPersistAllowed(false);
      setPersistResult(null);
      if (!data.success) {
        setPreviewError(data.error || data.code || 'فشل المعاينة');
        if (data.preview?.ok) setPreview(data.preview as PreviewOk);
        return;
      }
      if (data.alreadyMigrated) {
        setPreviewMeta(
          data.message ||
            'المندوب مُرحَّل بالفعل — لا يُسمح بإنشاء Opening جديد'
        );
        if (data.preview?.ok) setPreview(data.preview as PreviewOk);
        return;
      }
      if (data.preview?.ok) {
        setPreview(data.preview as PreviewOk);
        setPersistAllowed(Boolean(data.persistAllowed));
        setPreviewMeta(
          data.persistAllowed
            ? 'معاينة ناجحة — المندوب على قائمة الطيار ويمكن التأكيد للحفظ'
            : 'معاينة فقط — الحفظ يتطلب تفعيل الكتابة + قائمة الطيار'
        );
      }
    },
    onError: (e: Error) => setPreviewError(e.message),
  });

  const persistMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/admin/equipment-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('persist', true)),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.success) {
        setPreviewError(data.error || data.code || 'فشل الحفظ');
        return;
      }
      setPersistResult(
        `تم الحفظ: ${data.issue?.equipmentIssueId || ''} · created=${data.created} · duplicate=${data.duplicateAttempt} · outstanding=${data.issue?.outstandingMilli ?? ''} · verify=${data.verification?.ok ? 'OK' : 'FAIL'}`
      );
      setPersistAllowed(false);
      listQ.refetch();
    },
    onError: (e: Error) => setPreviewError(e.message),
  });

  const diag = listQ.data?.diagnostic4811093;
  const migratedLocked =
    selected?.reconciliationStatus === 'MIGRATED' ||
    selected?.reconciliationStatus === 'CONFLICT';
  const blockedDiagnostic = selectedCode === '4811093';
  const canShowPersist =
    Boolean(preview) &&
    persistAllowed &&
    !migratedLocked &&
    !blockedDiagnostic &&
    Boolean(listQ.data?.openingBalanceWriteEnabled);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 text-[#EAF0FF]" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">
            تسوية افتتاحية للمعدات (مرة واحدة)
          </h1>
          <p className="text-sm text-[rgba(234,240,255,0.75)] mt-1">
            FLOW A — تسوية افتتاحية للمناديب الحاليين قبل تشغيل الاستقطاع الأوتوماتيك (مين سدد /
            المتبقي كام). الحفظ مقصور على قائمة طيار صريحة للمسار التجريبي، أو عبر قبول اقتراحات
            المشرفين في «اقتراحات سداد المعدات». لا يفعّل Financial Apply.
          </p>
          <ul className="mt-2 text-xs text-[rgba(234,240,255,0.7)] list-disc pr-5 space-y-0.5">
            <li>Snapshot: الأسعار تُثبَّت على العهدة عند الإنشاء.</li>
            <li>Idempotency: مفتاح OPENING لكود المندوب يمنع تكرار Opening لنفس المندوب.</li>
            <li>بعد اكتمال Opening → جهّز طلبات الدورة من «دورات القبض».</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded px-2 py-1 bg-amber-950/80 text-amber-100 border border-amber-500/40">
              FINANCIAL_APPLY ={' '}
              {listQ.data?.financialApplyEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="rounded px-2 py-1 bg-amber-950/80 text-amber-100 border border-amber-500/40">
              AUTO_REQUEST = {listQ.data?.autoRequestEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="rounded px-2 py-1 bg-amber-950/80 text-amber-100 border border-amber-500/40">
              OPENING_WRITE ={' '}
              {listQ.data?.openingBalanceWriteEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="rounded px-2 py-1 bg-[#1C2440] text-[#EAF0FF] border border-white/20">
              pilot = {(listQ.data?.pilotAllowlist || []).join(', ') || '(فارغ)'}
            </span>
          </div>
        </div>

        {diag ? (
          <div className="rounded-xl border border-white/15 bg-[#12182B] p-3 text-sm text-[#EAF0FF]">
            <div className="font-semibold text-[#EAF0FF]">
              تشخيص قراءة فقط — 4811093
            </div>
            <div className="mt-1 grid sm:grid-cols-2 gap-1 text-[rgba(234,240,255,0.85)]">
              <div>
                IDENTITY_READY = {diag.identityReady ? 'YES' : 'NO'}
              </div>
              <div>
                RECONCILIATION_DATA_COMPLETE ={' '}
                {diag.reconciliationDataComplete ? 'YES' : 'NO'}
              </div>
              <div>migrationKey = {diag.migrationKey}</div>
              <div>alreadyMigrated = {diag.alreadyMigrated ? 'YES' : 'NO'}</div>
              <div>
                OPENING_LIABILITY = {diag.openingLiability || 'NONE'}
              </div>
            </div>
            <p className="text-xs text-[rgba(234,240,255,0.55)] mt-2">
              لا يتم تعبئة المعدات أو المبالغ المدفوعة تلقائيًا لهذا المندوب.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            بحث
            <input
              className="block rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1 min-w-[220px] placeholder:text-white/40"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="كود / اسم / منطقة / مشرف"
            />
          </label>
        </div>

        {listQ.isLoading ? (
          <p>جاري التحميل…</p>
        ) : listQ.data?.success === false ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/80 p-4 text-amber-100">
            {listQ.data.error || 'تعذر التحميل'}
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/15 bg-[#12182B] overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#1C2440] text-[#EAF0FF] sticky top-0">
                  <tr>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">كود</th>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">الاسم</th>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">منطقة</th>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">مشرف</th>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">انضمام</th>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">حالة</th>
                    <th className="p-2 text-right font-semibold text-[#EAF0FF]">تسوية</th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((r) => (
                    <tr
                      key={r.riderCode}
                      className={`border-t border-white/10 cursor-pointer hover:bg-white/5 ${
                        selectedCode === r.riderCode ? 'bg-cyan-500/20' : ''
                      }`}
                      onClick={() => selectRider(r)}
                    >
                      <td className="p-2 font-mono">{r.riderCode}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.zone}</td>
                      <td className="p-2">
                        {r.supervisorName || r.supervisorCode}
                      </td>
                      <td className="p-2">{r.joinDate || '—'}</td>
                      <td className="p-2">{r.active ? 'نشط' : r.status || '—'}</td>
                      <td className="p-2">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs ${statusBadgeClass(
                            r.reconciliationStatus
                          )}`}
                        >
                          {r.reconciliationStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-white/15 bg-[#12182B] p-4 space-y-3 text-[#EAF0FF]">
              {!selected ? (
                <p className="text-[rgba(234,240,255,0.6)] text-sm">
                  اختر مندوبًا من القائمة لإدخال واقع المعدات الحالي يدويًا.
                </p>
              ) : (
                <>
                  <div>
                    <div className="font-semibold text-[#EAF0FF]">
                      {selected.name} ({selected.riderCode})
                    </div>
                    <div className="text-xs text-[rgba(234,240,255,0.55)]">
                      {selected.migrationKey} · {selected.reconciliationStatus}
                    </div>
                    {migratedLocked ? (
                      <div className="mt-2 text-sm text-rose-100 bg-rose-950/80 border border-rose-400/40 rounded p-2">
                        {selected.reconciliationStatus === 'MIGRATED'
                          ? 'مُرحَّل بالفعل — لا يُسمح بإنشاء Opening جديد.'
                          : 'CONFLICT — توجد عهدة مفتوحة أخرى. لا تُنشأ Opening هنا.'}
                      </div>
                    ) : null}
                  </div>

                  <fieldset
                    disabled={migratedLocked}
                    className="space-y-3 disabled:opacity-60"
                  >
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.motorcycleBagHeld}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              motorcycleBagHeld: e.target.checked,
                              bicycleBagHeld: e.target.checked
                                ? false
                                : f.bicycleBagHeld,
                            }))
                          }
                        />
                        شنطة موتوسيكل
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.bicycleBagHeld}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              bicycleBagHeld: e.target.checked,
                              motorcycleBagHeld: e.target.checked
                                ? false
                                : f.motorcycleBagHeld,
                            }))
                          }
                        />
                        شنطة عجلة
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <label>
                        تيشرت
                        <input
                          type="number"
                          min={0}
                          className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                          value={form.tshirtQuantity}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              tshirtQuantity: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        جاكيت
                        <input
                          type="number"
                          min={0}
                          className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                          value={form.jacketQuantity}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              jacketQuantity: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        خوذة
                        <input
                          type="number"
                          min={0}
                          className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                          value={form.helmetQuantity}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              helmetQuantity: Number(e.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className="block text-sm">
                      حالة الاستعلام الأمني (إلزامي)
                      <select
                        className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                        value={form.securityStatus}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            securityStatus: e.target.value as
                              | ''
                              | 'PAID'
                              | 'NOT_PAID',
                          }))
                        }
                      >
                        <option value="">— UNKNOWN (غير مقبول) —</option>
                        <option value="PAID">PAID</option>
                        <option value="NOT_PAID">NOT_PAID</option>
                      </select>
                    </label>

                    <label className="block text-sm">
                      المبلغ المدفوع تاريخيًا (ج.م) — يدوي فقط
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                        value={form.historicalPaidEgp}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            historicalPaidEgp: Number(e.target.value),
                          }))
                        }
                      />
                    </label>

                    <label className="block text-sm">
                      مرجع / دليل (اختياري)
                      <input
                        className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                        value={form.evidenceReference}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            evidenceReference: e.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="block text-sm">
                      ملاحظة (اختياري)
                      <textarea
                        className="block w-full rounded-md border border-white/25 bg-[#0B1020] text-[#EAF0FF] px-2 py-1.5 mt-1"
                        rows={2}
                        value={form.notes}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, notes: e.target.value }))
                        }
                      />
                    </label>

                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={form.operatorConfirmation}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            operatorConfirmation: e.target.checked,
                          }))
                        }
                      />
                      أؤكّد أن البيانات أعلاه تعكس واقع المعدات والمدفوع الحالي
                      لهذا المندوب (إدخال بشري صريح).
                    </label>

                    <button
                      type="button"
                      className="rounded-md bg-cyan-600 text-white px-4 py-2 text-sm hover:bg-cyan-500 disabled:opacity-50"
                      disabled={previewMut.isPending || migratedLocked}
                      onClick={() => previewMut.mutate()}
                    >
                      {previewMut.isPending
                        ? 'جاري المعاينة…'
                        : 'معاينة Original / Paid / Outstanding'}
                    </button>

                    {canShowPersist ? (
                      <button
                        type="button"
                        className="rounded bg-emerald-800 text-white px-4 py-2 text-sm disabled:opacity-50 ms-2"
                        disabled={persistMut.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'CONFIRM_OPENING_PRODUCTION_WRITE = YES\n\nتأكيد حفظ Opening Liability لهذا المندوب الواحد على Production؟\n(ليس Financial Apply / ليس Auto REQUEST)'
                            )
                          ) {
                            return;
                          }
                          persistMut.mutate();
                        }}
                      >
                        {persistMut.isPending
                          ? 'جاري الحفظ…'
                          : 'تأكيد وحفظ Opening (طيار)'}
                      </button>
                    ) : null}
                  </fieldset>

                  {persistResult ? (
                    <div className="text-sm text-emerald-100 bg-emerald-950/80 border border-emerald-400/40 rounded-lg p-2">
                      {persistResult}
                    </div>
                  ) : null}

                  {previewError ? (
                    <div className="text-sm text-rose-100 bg-rose-950/80 border border-rose-400/40 rounded-lg p-2">
                      {previewError}
                    </div>
                  ) : null}
                  {previewMeta ? (
                    <div className="text-sm text-[rgba(234,240,255,0.85)] bg-[#1C2440] border border-white/15 rounded-lg p-2 text-[#EAF0FF]">
                      {previewMeta}
                    </div>
                  ) : null}
                  {preview ? (
                    <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/50 p-3 text-sm space-y-1 text-[#EAF0FF]">
                      <div className="font-semibold">معاينة الحساب</div>
                      <div>Original Liability = {preview.originalLiabilityEgp} ج.م</div>
                      <div>Historical Paid = {preview.historicalPaidEgp} ج.م</div>
                      <div>Outstanding = {preview.outstandingEgp} ج.م</div>
                      <div>status = {preview.status}</div>
                      <div>migrationKey = {preview.migrationKey}</div>
                      {preview.outstandingEgp === 0 ? (
                        <div className="font-medium text-emerald-200">
                          CREATE_SETTLED_OPENING_RECORD — لن يدخل Expected/REQUEST
                        </div>
                      ) : (
                        <div>
                          entersExpectedRequest (بعد ترحيل لاحق فقط) ={' '}
                          {preview.entersExpectedRequest ? 'YES' : 'NO'}
                        </div>
                      )}
                      <div className="text-xs text-[rgba(234,240,255,0.55)]">
                        productionWrite = false · لا حفظ في هذه المرحلة
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
