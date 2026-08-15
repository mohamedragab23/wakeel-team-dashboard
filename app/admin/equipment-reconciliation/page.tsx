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
      return 'bg-emerald-100 text-emerald-800';
    case 'READY':
      return 'bg-sky-100 text-sky-800';
    case 'CONFLICT':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
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
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            تسوية افتتاحية للمعدات (مرة واحدة)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            FLOW A — تسوية افتتاحية للمناديب الحاليين. الحفظ مقصور على قائمة طيار
            صريحة (1–3) ولا يفعّل Financial Apply أو الخصم التلقائي.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200">
              FINANCIAL_APPLY ={' '}
              {listQ.data?.financialApplyEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="rounded px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200">
              AUTO_REQUEST = {listQ.data?.autoRequestEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="rounded px-2 py-1 bg-amber-50 text-amber-900 border border-amber-200">
              OPENING_WRITE ={' '}
              {listQ.data?.openingBalanceWriteEnabled ? 'ON' : 'OFF'}
            </span>
            <span className="rounded px-2 py-1 bg-slate-50 text-slate-700 border">
              pilot = {(listQ.data?.pilotAllowlist || []).join(', ') || '(فارغ)'}
            </span>
          </div>
        </div>

        {diag ? (
          <div className="rounded border border-slate-200 bg-white p-3 text-sm">
            <div className="font-semibold text-slate-800">
              تشخيص قراءة فقط — 4811093
            </div>
            <div className="mt-1 grid sm:grid-cols-2 gap-1 text-slate-700">
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
            <p className="text-xs text-slate-500 mt-2">
              لا يتم تعبئة المعدات أو المبالغ المدفوعة تلقائيًا لهذا المندوب.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            بحث
            <input
              className="block border rounded px-2 py-1 mt-1 min-w-[220px]"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="كود / اسم / منطقة / مشرف"
            />
          </label>
        </div>

        {listQ.isLoading ? (
          <p>جاري التحميل…</p>
        ) : listQ.data?.success === false ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
            {listQ.data.error || 'تعذر التحميل'}
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border rounded-lg bg-white overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-right">كود</th>
                    <th className="p-2 text-right">الاسم</th>
                    <th className="p-2 text-right">منطقة</th>
                    <th className="p-2 text-right">مشرف</th>
                    <th className="p-2 text-right">انضمام</th>
                    <th className="p-2 text-right">حالة</th>
                    <th className="p-2 text-right">تسوية</th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((r) => (
                    <tr
                      key={r.riderCode}
                      className={`border-t cursor-pointer hover:bg-slate-50 ${
                        selectedCode === r.riderCode ? 'bg-sky-50' : ''
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

            <div className="border rounded-lg bg-white p-4 space-y-3">
              {!selected ? (
                <p className="text-slate-500 text-sm">
                  اختر مندوبًا من القائمة لإدخال واقع المعدات الحالي يدويًا.
                </p>
              ) : (
                <>
                  <div>
                    <div className="font-semibold text-slate-800">
                      {selected.name} ({selected.riderCode})
                    </div>
                    <div className="text-xs text-slate-500">
                      {selected.migrationKey} · {selected.reconciliationStatus}
                    </div>
                    {migratedLocked ? (
                      <div className="mt-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded p-2">
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
                          className="block border rounded w-full px-2 py-1 mt-1"
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
                          className="block border rounded w-full px-2 py-1 mt-1"
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
                          className="block border rounded w-full px-2 py-1 mt-1"
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
                        className="block border rounded w-full px-2 py-1 mt-1"
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
                        className="block border rounded w-full px-2 py-1 mt-1"
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
                        className="block border rounded w-full px-2 py-1 mt-1"
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
                        className="block border rounded w-full px-2 py-1 mt-1"
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
                      className="rounded bg-slate-800 text-white px-4 py-2 text-sm disabled:opacity-50"
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
                    <div className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-100 rounded p-2">
                      {persistResult}
                    </div>
                  ) : null}

                  {previewError ? (
                    <div className="text-sm text-rose-800 bg-rose-50 border border-rose-100 rounded p-2">
                      {previewError}
                    </div>
                  ) : null}
                  {previewMeta ? (
                    <div className="text-sm text-slate-700 bg-slate-50 border rounded p-2">
                      {previewMeta}
                    </div>
                  ) : null}
                  {preview ? (
                    <div className="rounded border border-sky-100 bg-sky-50 p-3 text-sm space-y-1">
                      <div className="font-semibold">معاينة الحساب</div>
                      <div>Original Liability = {preview.originalLiabilityEgp} ج.م</div>
                      <div>Historical Paid = {preview.historicalPaidEgp} ج.م</div>
                      <div>Outstanding = {preview.outstandingEgp} ج.م</div>
                      <div>status = {preview.status}</div>
                      <div>migrationKey = {preview.migrationKey}</div>
                      {preview.outstandingEgp === 0 ? (
                        <div className="font-medium text-emerald-800">
                          CREATE_SETTLED_OPENING_RECORD — لن يدخل Expected/REQUEST
                        </div>
                      ) : (
                        <div>
                          entersExpectedRequest (بعد ترحيل لاحق فقط) ={' '}
                          {preview.entersExpectedRequest ? 'YES' : 'NO'}
                        </div>
                      )}
                      <div className="text-xs text-slate-500">
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
