'use client';

import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ADMIN_FEATURE_LABELS_AR,
  ALL_ADMIN_FEATURE_KEYS,
  isGrantingAdmin,
  type AdminFeatureKey,
} from '@/lib/adminFeatureAccess';
import { ZONE_OPTIONS, parseAdminAllowedZonesList } from '@/lib/zones';

export default function AdminPermissionsPage() {
  const queryClient = useQueryClient();
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [mode, setMode] = useState<'full' | 'limited'>('limited');
  const [picked, setPicked] = useState<Set<AdminFeatureKey>>(new Set());
  const [pickedZones, setPickedZones] = useState<Set<string>>(new Set());
  /** منصب الأدمن المحدود في الشيت: مدير منطقة / مدير زون */
  const [adminPositionSheet, setAdminPositionSheet] = useState<string>('');
  /** جذور الشجرة: أكواد من «المشرفين» (عمود A) — أكثر من جذر يُفصل بينها بـ | في الشيت */
  const [linkedSupervisorCodes, setLinkedSupervisorCodes] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [canGrant, setCanGrant] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      setCanGrant(isGrantingAdmin(u));
    } catch {
      setCanGrant(false);
    }
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-permissions-list'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/admin-permissions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل التحميل');
      return j.data as {
        sheetName: string;
        admins: Array<{
          rowIndex1Based: number;
          code: string;
          name: string;
          permissions: string;
          dataZone: string;
          adminPositionRaw?: string;
          linkedSupervisorCode?: string;
        }>;
        featureKeys: AdminFeatureKey[];
        totalRowsInSheet?: number;
        parsedCount?: number;
        columnMap?: {
          codeCol: number;
          nameCol: number;
          passCol: number;
          permCol: number;
          zoneCol: number;
          positionCol?: number;
          linkedSupervisorCol?: number;
        };
      };
    },
    enabled: !!canGrant,
  });

  const { data: supervisorChoices = [] } = useQuery({
    queryKey: ['admin-supervisors-picker'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/supervisors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!j.success) return [];
      return j.data as Array<{ code: string; name: string; region?: string; orgRole?: string }>;
    },
    enabled: !!canGrant,
  });

  const selected = data?.admins?.find((a) => a.code === selectedCode);

  function parseLinkedRootsFromSheet(s: string): string[] {
    return String(s || '')
      .replace(/\uFEFF/g, '')
      .trim()
      .split(/[|،,\n\r]+/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const loadSelectedIntoForm = (code: string) => {
    const a = data?.admins?.find((x) => x.code === code);
    setSelectedCode(code);
    if (!a) return;
    const p = (a.permissions || '').trim();
    if (!p || p.toLowerCase() === 'all' || p.includes('*')) {
      setMode('full');
      setPicked(new Set());
    } else if (p.toLowerCase().startsWith('limited:')) {
      setMode('limited');
      const rest = p.slice('limited:'.length).trim();
      const keys = rest
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as AdminFeatureKey[];
      setPicked(new Set(keys.filter((k) => ALL_ADMIN_FEATURE_KEYS.includes(k))));
    } else {
      setMode('full');
      setPicked(new Set());
    }
    setPickedZones(new Set(parseAdminAllowedZonesList(a.dataZone || '')));
    const pos = (a.adminPositionRaw || '').trim();
    if (pos.includes('منطقة')) setAdminPositionSheet('مدير منطقة');
    else if (pos.includes('زون')) setAdminPositionSheet('مدير زون');
    else setAdminPositionSheet('');
    setLinkedSupervisorCodes(new Set(parseLinkedRootsFromSheet(a.linkedSupervisorCode || '')));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      let permissions = '';
      if (mode === 'full') permissions = '';
      else {
        const keys = Array.from(picked);
        if (!keys.length) throw new Error('اختر ميزة واحدة على الأقل أو اختر وصول كامل');
        permissions = `limited:${keys.join(',')}`;
      }
      const res = await fetch('/api/admin/admin-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          targetCode: selectedCode,
          permissions,
          dataZones: Array.from(pickedZones),
          adminPosition: adminPositionSheet.trim(),
          linkedSupervisorCode: Array.from(linkedSupervisorCodes).join('|'),
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل الحفظ');
      return j;
    },
    onSuccess: () => {
      setMsg({
        type: 'ok',
        text: 'تم الحفظ. يجب على المستخدم المستهدف تسجيل الخروج ثم الدخول مجدداً.',
      });
      queryClient.invalidateQueries({ queryKey: ['admin-permissions-list'] });
    },
    onError: (e: any) => {
      setMsg({ type: 'err', text: e?.message || 'فشل الحفظ' });
    },
  });

  if (!canGrant) {
    return (
      <Layout>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-100 p-4">
          لا تملك صلاحية هذه الصفحة. متاحة فقط لحساب المدير الرئيسي (صلاحيات فارغة أو all في ورقة الأدمن).
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl min-w-0 text-[#EAF0FF]">
        <div>
          <h1 className="text-2xl font-bold">إدارة صلاحيات الأدمن</h1>
          <p className="text-sm text-[rgba(234,240,255,0.72)] mt-1">
            اختر مستخدمًا من ورقة <strong className="text-[rgba(234,240,255,0.9)]">Admins</strong> (دخول كمدير) ثم حدد الميزات.
            الصلاحيات هنا لا تنطبق على حسابات <strong className="text-[rgba(234,240,255,0.9)]">المشرفين</strong> في ورقة المشرفين — لمشرف مختلف القائمة والصلاحيات.
            بعد الحفظ يجب أن يُسجّل المستخدم المستهدف <strong className="text-[rgba(234,240,255,0.9)]">الخروج ثم الدخول</strong> ليُحمَّل التوكن الجديد.
            عمود «نطاق الزونات» (إن وُجد في Admins) يقيّد البيانات مع زونات المشرفين. مع ربط صف المشرفين والمنصب
            يُطبَّق تقاطع الشجرة + الزون. أضف في Admins عموداً بعنوان مثل «نطاق الزونات» أو «ربط شيت المشرفين» إن
            لم يكن ظاهراً في القائمة بعد الحفظ.
          </p>
        </div>

        {msg && (
          <div
            className={
              msg.type === 'ok'
                ? 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-emerald-100 text-sm'
                : 'rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-red-100 text-sm'
            }
          >
            {msg.text}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-red-100 text-sm">
            {(error as Error).message}
          </div>
        )}

        {isLoading ? (
          <p className="text-[rgba(234,240,255,0.7)]">جاري التحميل…</p>
        ) : data ? (
          <div className="space-y-4 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-4 sm:p-6">
            <div className="text-xs text-[rgba(234,240,255,0.55)] space-y-1">
              <p>ورقة الشيت: {data.sheetName}</p>
              {typeof data.parsedCount === 'number' && typeof data.totalRowsInSheet === 'number' ? (
                <p>
                  صفوف بيانات مكتشفة: {data.parsedCount} (إجمالي صفوف مُرجعة من الشيت: {data.totalRowsInSheet})
                </p>
              ) : null}
              {data.admins.length <= 1 ? (
                <p className="text-amber-200/90 border border-amber-400/30 rounded-lg px-3 py-2 mt-2">
                  يظهر هنا فقط من لهم <strong>صف في ورقة Admins</strong> مع <strong>كود غير فارغ</strong> في عمود الكود
                  (بعد صف العناوين إن وُجد). المشرفون في تبويب «المشرفين» لا يُعرضون هنا — أضف مستخدم الأدمن كصف
                  جديد في Admins (كود، اسم، كلمة مرور، …) ليظهر في القائمة ويستطيع الدخول كمدير.
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-sm mb-1">الأدمن المستهدف</label>
              <select
                className="w-full max-w-md rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm"
                value={selectedCode}
                onChange={(e) => loadSelectedIntoForm(e.target.value)}
              >
                <option value="">— اختر —</option>
                {data.admins.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name || a.code} ({a.code})
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="perm-mode"
                      checked={mode === 'full'}
                      onChange={() => setMode('full')}
                    />
                    وصول كامل (مثل المدير الرئيسي)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="perm-mode"
                      checked={mode === 'limited'}
                      onChange={() => setMode('limited')}
                    />
                    صلاحيات محددة فقط
                  </label>
                </div>

                {mode === 'limited' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ALL_ADMIN_FEATURE_KEYS.map((key) => (
                      <label key={key} className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={picked.has(key)}
                          onChange={() => {
                            setPicked((prev) => {
                              const n = new Set(prev);
                              if (n.has(key)) n.delete(key);
                              else n.add(key);
                              return n;
                            });
                          }}
                        />
                        <span>
                          {ADMIN_FEATURE_LABELS_AR[key]} <span className="text-[rgba(234,240,255,0.45)]">({key})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.2)] p-3 sm:p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      نطاق الزون (اختياري — أكثر من زون مسموح)
                    </label>
                    <p className="text-xs text-[rgba(234,240,255,0.55)] leading-relaxed">
                      بدون أي اختيار = كل الزونات. مع اختيار واحد أو أكثر يُقيَّد أداء المشرفين والشفتات وما يشابهها.
                      استخدم <strong className="text-[rgba(234,240,255,0.85)]">Ctrl+نقر</strong> (ويندوز) أو{' '}
                      <strong className="text-[rgba(234,240,255,0.85)]">Cmd+نقر</strong> (ماك) لتعليم عدة صفوف في القائمة
                      أدناه، أو زرّي «تحديد الكل / مسح».
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)]"
                      onClick={() => setPickedZones(new Set(ZONE_OPTIONS))}
                    >
                      تحديد كل الزونات
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)]"
                      onClick={() => setPickedZones(new Set())}
                    >
                      مسح الزونات (بدون تقييد)
                    </button>
                  </div>

                  <select
                    multiple
                    size={Math.min(8, ZONE_OPTIONS.length)}
                    className="w-full max-w-xl rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.35)] px-2 py-1 text-sm min-h-[11rem]"
                    value={Array.from(pickedZones)}
                    onChange={(e) => {
                      const next = Array.from(e.target.selectedOptions, (o) => o.value);
                      setPickedZones(new Set(next));
                    }}
                  >
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>

                  <div className="grid gap-2 sm:grid-cols-2 max-w-3xl pt-1">
                    {ZONE_OPTIONS.map((z) => (
                      <label key={`cb-${z}`} className="flex items-start gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pickedZones.has(z)}
                          onChange={() => {
                            setPickedZones((prev) => {
                              const n = new Set(prev);
                              if (n.has(z)) n.delete(z);
                              else n.add(z);
                              return n;
                            });
                          }}
                        />
                        <span>{z}</span>
                      </label>
                    ))}
                  </div>

                  {pickedZones.size > 0 ? (
                    <p className="text-xs text-[rgba(234,240,255,0.65)] border-t border-[rgba(255,255,255,0.08)] pt-2">
                      <span className="text-[rgba(234,240,255,0.5)]">سيُحفظ في الشيت:</span>{' '}
                      {Array.from(pickedZones).join(' | ')}
                    </p>
                  ) : (
                    <p className="text-xs text-[rgba(234,240,255,0.45)] border-t border-[rgba(255,255,255,0.08)] pt-2">
                      لا يوجد تقييد زون — سيُحفظ الحقل فارغاً في الشيت (إن وُجد عمود نطاق).
                    </p>
                  )}
                </div>

                {mode === 'limited' && (
                  <div className="rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.2)] p-3 sm:p-4 space-y-3">
                    <p className="text-sm font-medium">الهرمية وربط صف «المشرفين»</p>
                    <p className="text-xs text-[rgba(234,240,255,0.55)] leading-relaxed">
                      علّم <strong className="text-[rgba(234,240,255,0.85)]">صفك/صفوفك</strong> في «المشرفين» (عمود
                      A) — يمكن أكثر من كود (مثلاً مدير منطقة يعلّم WA-014 ومديري زون WA-007 و WA-013 معاً). كل من
                      تحتهم في الشيت يجب أن يملأ عمود{' '}
                      <strong className="text-[rgba(234,240,255,0.85)]">كود المدير المباشر</strong> بكود مديره.
                      النطاق الجغرافي أعلاه يُقاطع مع اتحاد أشجار هذه الجذور.
                    </p>
                    <div>
                      <label className="block text-sm mb-1">منصب الأدمن (يُحفظ في عمود المنصب في Admins)</label>
                      <select
                        className="w-full max-w-md rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm"
                        value={adminPositionSheet}
                        onChange={(e) => setAdminPositionSheet(e.target.value)}
                      >
                        <option value="">— اختر (افتراضي: مدير زون في النظام) —</option>
                        <option value="مدير زون">مدير زون</option>
                        <option value="مدير منطقة">مدير منطقة</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm mb-1">ربط بأكواد في شيت المشرفين (عمود A) — متعدد</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-[rgba(255,255,255,0.2)]"
                          onClick={() => setLinkedSupervisorCodes(new Set())}
                        >
                          مسح الربط
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-[rgba(255,255,255,0.2)]"
                          onClick={() => {
                            const c = selectedCode.trim();
                            if (c) setLinkedSupervisorCodes((prev) => new Set(prev).add(c));
                          }}
                        >
                          إضافة كود الأدمن الحالي ({selectedCode || '—'})
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.2)] p-2 space-y-1">
                        {supervisorChoices.map((s) => (
                          <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={linkedSupervisorCodes.has(s.code)}
                              onChange={() => {
                                setLinkedSupervisorCodes((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(s.code)) n.delete(s.code);
                                  else n.add(s.code);
                                  return n;
                                });
                              }}
                            />
                            <span>
                              {s.code} — {s.name || ''}
                              {s.region ? ` (${s.region})` : ''}
                            </span>
                          </label>
                        ))}
                      </div>
                      {linkedSupervisorCodes.size > 0 ? (
                        <p className="text-xs text-[rgba(234,240,255,0.55)] mt-2">
                          سيُحفظ: {Array.from(linkedSupervisorCodes).join(' | ')}
                        </p>
                      ) : (
                        <p className="text-xs text-[rgba(234,240,255,0.45)] mt-2">
                          بدون ربط — يُعتمد على نطاق الزونات فقط (إن وُجد).
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!selectedCode || saveMutation.isPending}
                  onClick={() => {
                    setMsg(null);
                    saveMutation.mutate();
                  }}
                  className="px-5 py-2 rounded-lg bg-[color:var(--v2-accent-cyan)] text-black font-semibold disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'جاري الحفظ…' : 'حفظ على الشيت'}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
