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
import {
  LIMITED_PRESET_REGIONAL_MANAGER,
  LIMITED_PRESET_ZONE_MANAGER,
} from '@/lib/adminOrgPresets';
import { buildDescendantSupervisorCodesMulti } from '@/lib/orgHierarchy';

type SupervisorPickerRow = {
  code: string;
  name: string;
  region?: string;
  orgRole?: string;
  parentCode?: string;
};

function orgRoleBadge(orgRole?: string): string {
  if (orgRole === 'zone_manager') return 'مدير زون';
  if (orgRole === 'regional_manager') return 'مدير منطقة';
  return 'مشرف تشغيلي';
}

/** من تحت الجذور مباشرة أو عبر parentCode (مشرفون تشغيليون فقط) */
function listOperationalSupervisorsUnderRoots(
  all: SupervisorPickerRow[],
  rootCodes: string[]
): SupervisorPickerRow[] {
  if (!rootCodes.length) return [];
  const tree = buildDescendantSupervisorCodesMulti(
    all.map((s) => ({
      code: s.code,
      name: s.name,
      region: s.region ?? '',
      email: '',
      password: '',
      parentCode: s.parentCode,
      orgRole: (s.orgRole as 'supervisor' | 'zone_manager' | 'regional_manager') || 'supervisor',
    })),
    rootCodes
  );
  const roots = new Set(rootCodes.map((c) => c.trim()));
  return all.filter((s) => {
    const c = String(s.code ?? '').trim();
    if (!tree.has(c) || roots.has(c)) return false;
    const role = s.orgRole ?? 'supervisor';
    return role === 'supervisor';
  });
}

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
  const [useAdminCodeAsLink, setUseAdminCodeAsLink] = useState(false);
  const [autoCreateSupervisorRows, setAutoCreateSupervisorRows] = useState(true);
  const [syncZoneManagersToRegional, setSyncZoneManagersToRegional] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ code: '', name: '', password: '' });
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
      const res = await fetch('/api/admin/supervisors?refresh=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!j.success) return [];
      return j.data as SupervisorPickerRow[];
    },
    enabled: !!canGrant,
  });

  const { data: hierarchyAudit } = useQuery({
    queryKey: ['admin-hierarchy-audit'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/hierarchy-audit', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل تدقيق الهرمية');
      return j.data as { issueCount: number; issues: Array<{ code: string; name: string; detail: string }> };
    },
    enabled: !!canGrant,
    staleTime: 60_000,
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

  function buildPermissionsString(): string {
    if (mode === 'full') return '';
    const keys = Array.from(picked);
    if (!keys.length) throw new Error('اختر ميزة واحدة على الأقل أو اختر وصول كامل');
    return `limited:${keys.join(',')}`;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const permissions = buildPermissionsString();
      const res = await fetch('/api/admin/admin-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          targetCode: selectedCode,
          permissions,
          dataZones: Array.from(pickedZones),
          adminPosition: adminPositionSheet.trim(),
          linkedSupervisorCode: Array.from(linkedSupervisorCodes).join('|'),
          useAdminCodeAsLink,
          autoCreateSupervisorRows,
          syncZoneManagersToRegional,
          regionalManagerSupervisorCode: adminPositionSheet.includes('منطقة')
            ? (showCreateForm ? newAdmin.code : selectedCode).trim()
            : '',
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل الحفظ');
      return j;
    },
    onSuccess: (j: {
      sync?: {
        created?: string[];
        updated?: string[];
        zoneManagersLinked?: string[];
      };
    }) => {
      const parts: string[] = [];
      if (j.sync?.created?.length) parts.push(`أُنشئ ${j.sync.created.length} صف`);
      if (j.sync?.updated?.length) parts.push(`حُدّث ${j.sync.updated.length} صف`);
      if (j.sync?.zoneManagersLinked?.length) {
        parts.push(`رُبط ${j.sync.zoneManagersLinked.length} مدير زون بمدير المنطقة`);
      }
      const extra = parts.length ? ` — ${parts.join('، ')}.` : '';
      setMsg({
        type: 'ok',
        text: `تم الحفظ.${extra} يجب على المستخدم تسجيل الخروج ثم الدخول مجدداً.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-permissions-list'] });
      queryClient.invalidateQueries({ queryKey: ['admin-supervisors-picker'] });
      queryClient.invalidateQueries({ queryKey: ['admin-hierarchy-audit'] });
    },
    onError: (e: any) => {
      setMsg({ type: 'err', text: e?.message || 'فشل الحفظ' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const permissions = buildPermissionsString();
      const res = await fetch('/api/admin/admin-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: newAdmin.code.trim(),
          name: newAdmin.name.trim(),
          password: newAdmin.password,
          permissions,
          dataZones: Array.from(pickedZones),
          adminPosition: adminPositionSheet.trim(),
          linkedSupervisorCode: Array.from(linkedSupervisorCodes).join('|'),
          useAdminCodeAsLink,
          autoCreateSupervisorRows,
          syncZoneManagersToRegional,
          regionalManagerSupervisorCode: adminPositionSheet.includes('منطقة') ? newAdmin.code.trim() : '',
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'فشل الإنشاء');
      return j;
    },
    onSuccess: (j: { sync?: { created?: string[]; zoneManagersLinked?: string[] } }) => {
      const parts: string[] = [];
      if (j.sync?.created?.length) parts.push(`أُنشئ ${j.sync.created.length} صف في المشرفين`);
      if (j.sync?.zoneManagersLinked?.length) {
        parts.push(`رُبط ${j.sync.zoneManagersLinked.length} مدير زون بمدير المنطقة`);
      }
      setMsg({
        type: 'ok',
        text: `تم إنشاء حساب الأدمن.${parts.length ? ` ${parts.join('، ')}.` : ''}`,
      });
      setShowCreateForm(false);
      setNewAdmin({ code: '', name: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-permissions-list'] });
      queryClient.invalidateQueries({ queryKey: ['admin-supervisors-picker'] });
      queryClient.invalidateQueries({ queryKey: ['admin-hierarchy-audit'] });
    },
    onError: (e: any) => setMsg({ type: 'err', text: e?.message || 'فشل الإنشاء' }),
  });

  const isRegionalPosition = adminPositionSheet.includes('منطقة');
  const isZonePosition = adminPositionSheet.includes('زون');

  /** جذور الشجرة فقط — ليست قائمة المشرفين التشغيليين */
  const linkPickerChoices = supervisorChoices.filter((s) => {
    if (isRegionalPosition) return s.orgRole === 'zone_manager';
    if (isZonePosition) return s.orgRole === 'zone_manager';
    return true;
  });

  const operationalUnderRoots = listOperationalSupervisorsUnderRoots(
    supervisorChoices,
    Array.from(linkedSupervisorCodes)
  );

  const operationalNotUnderRoots = supervisorChoices.filter((s) => {
    if ((s.orgRole ?? 'supervisor') !== 'supervisor') return false;
    return !operationalUnderRoots.some((x) => x.code === s.code);
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
          <h1 className="text-2xl font-bold">إدارة المستخدمين والهرمية</h1>
          <p className="text-sm text-[rgba(234,240,255,0.72)] mt-1">
            أنشئ أو عدّل حسابات الدخول كمدير، الصلاحيات، نطاق الزون، وربط الهرمية — كل ذلك من هنا ويُزامَن تلقائياً مع
            الشيت. لربط المشرفين التشغيليين بمديريهم استخدم صفحة{' '}
            <strong className="text-[rgba(234,240,255,0.9)]">إدارة المشرفين</strong> (المنصب + المدير المباشر).
            بعد أي تعديل يُفضَّل أن يُسجّل المستخدم <strong className="text-[rgba(234,240,255,0.9)]">خروجاً ثم دخولاً</strong>.
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

        {hierarchyAudit && hierarchyAudit.issueCount > 0 ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium mb-1">
              تدقيق الهرمية: {hierarchyAudit.issueCount} مشكلة في شيت المشرفين
            </p>
            <ul className="text-xs space-y-0.5 max-h-28 overflow-y-auto list-disc list-inside">
              {hierarchyAudit.issues.slice(0, 12).map((i) => (
                <li key={i.code}>
                  {i.code} — {i.detail}
                </li>
              ))}
            </ul>
            {hierarchyAudit.issueCount > 12 ? (
              <p className="text-xs mt-1 opacity-70">… و{hierarchyAudit.issueCount - 12} أخرى</p>
            ) : null}
            <a href="/admin/supervisors" className="inline-block mt-2 text-cyan-300 underline text-xs">
              إصلاح من إدارة المشرفين
            </a>
          </div>
        ) : hierarchyAudit ? (
          <p className="text-xs text-emerald-300/90">تدقيق الهرمية: لا توجد مشاكل ظاهرة في الربط حسب الشيت.</p>
        ) : null}

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
                  لا يوجد مستخدمون بعد — استخدم «مستخدم أدمن جديد» لإنشاء أول حساب (يُزامَن مع الشيت تلقائياً).
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setMsg(null);
                }}
                className={`text-sm px-4 py-2 rounded-lg border ${!showCreateForm ? 'bg-[color:var(--v2-accent-cyan)] text-black border-transparent' : 'border-[rgba(255,255,255,0.2)]'}`}
              >
                تعديل مستخدم موجود
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(true);
                  setSelectedCode('');
                  setMode('limited');
                  setPicked(
                    new Set(
                      LIMITED_PRESET_ZONE_MANAGER.replace('limited:', '')
                        .split(',')
                        .filter(Boolean) as AdminFeatureKey[]
                    )
                  );
                  setAdminPositionSheet('مدير زون');
                  setUseAdminCodeAsLink(true);
                  setAutoCreateSupervisorRows(true);
                  setMsg(null);
                }}
                className={`text-sm px-4 py-2 rounded-lg border ${showCreateForm ? 'bg-[color:var(--v2-accent-cyan)] text-black border-transparent' : 'border-[rgba(255,255,255,0.2)]'}`}
              >
                + مستخدم أدمن جديد
              </button>
            </div>

            {showCreateForm && (
              <div className="rounded-lg border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.25)] p-4 space-y-3 max-w-lg">
                <p className="text-sm font-medium">بيانات الدخول الجديدة</p>
                <input
                  className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm"
                  placeholder="كود الدخول"
                  value={newAdmin.code}
                  onChange={(e) => setNewAdmin({ ...newAdmin, code: e.target.value })}
                />
                <input
                  className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm"
                  placeholder="الاسم"
                  value={newAdmin.name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                />
                <input
                  type="password"
                  className="w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm"
                  placeholder="كلمة المرور"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                />
              </div>
            )}

            {!showCreateForm && (
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
            )}

            {(showCreateForm || selected) && (
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md border border-[rgba(255,255,255,0.2)]"
                      onClick={() =>
                        setPicked(
                          new Set(
                            LIMITED_PRESET_ZONE_MANAGER.replace('limited:', '')
                              .split(',')
                              .filter(Boolean) as AdminFeatureKey[]
                          )
                        )
                      }
                    >
                      قالب: مدير زون
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md border border-[rgba(255,255,255,0.2)]"
                      onClick={() =>
                        setPicked(
                          new Set(
                            LIMITED_PRESET_REGIONAL_MANAGER.replace('limited:', '')
                              .split(',')
                              .filter(Boolean) as AdminFeatureKey[]
                          )
                        )
                      }
                    >
                      قالب: مدير منطقة
                    </button>
                  </div>
                )}

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
                    <p className="text-sm font-medium">الهرمية (تُزامَن مع الشيت تلقائياً)</p>
                    <div className="text-xs text-[rgba(234,240,255,0.72)] leading-relaxed space-y-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
                      <p>
                        <strong className="text-cyan-100">مهم:</strong> القائمة أدناه لـ{' '}
                        <strong>جذر الشجرة</strong> (صف مدير زون)، وليست لاختيار المشرفين التشغيليين.
                      </p>
                      {isRegionalPosition ? (
                        <ol className="list-decimal list-inside space-y-1 ps-1">
                          <li>اختر كل أكواد <strong>مديري الزون</strong> التابعين لمدير المنطقة.</li>
                          <li>
                            في{' '}
                            <a href="/admin/supervisors" className="text-cyan-300 underline">
                              إدارة المشرفين
                            </a>
                            : لكل مشرف تشغيلي — المدير المباشر = كود مدير الزون.
                          </li>
                        </ol>
                      ) : isZonePosition ? (
                        <ol className="list-decimal list-inside space-y-1 ps-1">
                          <li>جذر واحد فقط: كود مدير الزون (يفضّل «استخدم كود الدخول كجذر»).</li>
                          <li>
                            المشرفون التشغيليون يُربطون من{' '}
                            <a href="/admin/supervisors" className="text-cyan-300 underline">
                              إدارة المشرفين
                            </a>{' '}
                            — المنصب = مشرف تشغيلي، المدير المباشر = كود مدير الزون.
                          </li>
                        </ol>
                      ) : (
                        <p>اختر المنصب أولاً.</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm mb-1">منصب المستخدم</label>
                      <select
                        className="w-full max-w-md rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm"
                        value={adminPositionSheet}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAdminPositionSheet(v);
                          if (mode === 'limited' && v.includes('منطقة')) {
                            setPicked(
                              new Set(
                                LIMITED_PRESET_REGIONAL_MANAGER.replace('limited:', '')
                                  .split(',')
                                  .filter(Boolean) as AdminFeatureKey[]
                              )
                            );
                          } else if (mode === 'limited' && v.includes('زون')) {
                            setPicked(
                              new Set(
                                LIMITED_PRESET_ZONE_MANAGER.replace('limited:', '')
                                  .split(',')
                                  .filter(Boolean) as AdminFeatureKey[]
                              )
                            );
                            setUseAdminCodeAsLink(true);
                            const c = (showCreateForm ? newAdmin.code : selectedCode).trim();
                            if (c) setLinkedSupervisorCodes(new Set([c]));
                          }
                        }}
                      >
                        <option value="">— اختر (افتراضي: مدير زون في النظام) —</option>
                        <option value="مدير زون">مدير زون</option>
                        <option value="مدير منطقة">مدير منطقة</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useAdminCodeAsLink}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setUseAdminCodeAsLink(on);
                          if (on && isZonePosition) {
                            const c = (showCreateForm ? newAdmin.code : selectedCode).trim();
                            if (c) setLinkedSupervisorCodes(new Set([c]));
                          }
                        }}
                      />
                      استخدم كود الدخول كجذر في المشرفين (يُنشأ الصف تلقائياً إن لم يوجد)
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCreateSupervisorRows}
                        onChange={(e) => setAutoCreateSupervisorRows(e.target.checked)}
                      />
                      إنشاء/تحديث صفوف المشرفين المربوطة تلقائياً عند الحفظ
                    </label>
                    {isRegionalPosition ? (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncZoneManagersToRegional}
                          onChange={(e) => setSyncZoneManagersToRegional(e.target.checked)}
                        />
                        ربط مديري الزون المحددين بمدير المنطقة في الشيت (parentCode)
                      </label>
                    ) : null}
                    <div>
                      <label className="block text-sm mb-1">
                        {isRegionalPosition
                          ? 'جذور الشجرة: أكواد مديري الزون (متعدد)'
                          : isZonePosition
                            ? 'جذر الشجرة: صف مدير الزون (كود واحد)'
                            : 'جذور الشجرة في «المشرفين»'}
                      </label>
                      {isZonePosition && linkedSupervisorCodes.size > 1 ? (
                        <p className="text-xs text-amber-200/90 mb-2">
                          مدير الزون يجب أن يكون له جذر واحد فقط. امسح الزائد واترك كود مدير الزون.
                        </p>
                      ) : null}
                      {linkPickerChoices.length === 0 ? (
                        <p className="text-xs text-amber-200/90 mb-2 rounded border border-amber-400/30 p-2">
                          لا يوجد صف «مدير زون» في شيت المشرفين. أنشئه من{' '}
                          <a href="/admin/supervisors" className="underline text-amber-100">
                            إدارة المشرفين
                          </a>{' '}
                          (المنصب = مدير زون) أو فعّل إنشاء الصف تلقائياً عند الحفظ.
                        </p>
                      ) : null}
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
                            const c = (showCreateForm ? newAdmin.code : selectedCode).trim();
                            if (c) setLinkedSupervisorCodes((prev) => new Set(prev).add(c));
                          }}
                        >
                          إضافة كود الدخول ({(showCreateForm ? newAdmin.code : selectedCode) || '—'})
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.2)] p-2 space-y-1">
                        {linkPickerChoices.map((s) => (
                          <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={linkedSupervisorCodes.has(s.code)}
                              onChange={() => {
                                setLinkedSupervisorCodes((prev) => {
                                  if (isZonePosition) {
                                    return new Set([s.code]);
                                  }
                                  const n = new Set(prev);
                                  if (n.has(s.code)) n.delete(s.code);
                                  else n.add(s.code);
                                  return n;
                                });
                              }}
                            />
                            <span>
                              {s.code} — {s.name || ''}{' '}
                              <span className="text-[rgba(234,240,255,0.45)]">
                                [{orgRoleBadge(s.orgRole)}]
                              </span>
                              {s.region ? ` (${s.region})` : ''}
                            </span>
                          </label>
                        ))}
                      </div>

                      {linkedSupervisorCodes.size > 0 && (
                        <div className="mt-3 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.15)] p-3 space-y-2">
                          <p className="text-xs font-medium text-emerald-200/90">
                            مشرفون تشغيليون تحت الجذر الحالي ({operationalUnderRoots.length})
                          </p>
                          {operationalUnderRoots.length === 0 ? (
                            <p className="text-xs text-[rgba(234,240,255,0.55)]">
                              لا يوجد بعد — افتح إدارة المشرفين وعيّن «المدير المباشر» لكل مشرف = كود الجذر أعلاه.
                            </p>
                          ) : (
                            <ul className="text-xs text-[rgba(234,240,255,0.7)] max-h-32 overflow-y-auto space-y-0.5">
                              {operationalUnderRoots.map((s) => (
                                <li key={s.code}>
                                  {s.code} — {s.name}
                                  {s.parentCode ? ` (مدير: ${s.parentCode})` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {operationalNotUnderRoots.length > 0 && (
                            <details className="text-xs text-[rgba(234,240,255,0.5)]">
                              <summary className="cursor-pointer">
                                مشرفون غير مربوطين بهذا الجذر ({operationalNotUnderRoots.length}) — يحتاجون
                                تعديل في إدارة المشرفين
                              </summary>
                              <ul className="mt-1 max-h-24 overflow-y-auto space-y-0.5 ps-2">
                                {operationalNotUnderRoots.slice(0, 30).map((s) => (
                                  <li key={s.code}>
                                    {s.code} — {s.name}
                                    {s.parentCode ? ` (مدير حالي: ${s.parentCode})` : ' (بدون مدير مباشر)'}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}

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
                  disabled={
                    showCreateForm
                      ? !newAdmin.code.trim() || !newAdmin.name.trim() || !newAdmin.password || createMutation.isPending
                      : !selectedCode || saveMutation.isPending
                  }
                  onClick={() => {
                    setMsg(null);
                    if (showCreateForm) createMutation.mutate();
                    else saveMutation.mutate();
                  }}
                  className="px-5 py-2 rounded-lg bg-[color:var(--v2-accent-cyan)] text-black font-semibold disabled:opacity-50"
                >
                  {showCreateForm
                    ? createMutation.isPending
                      ? 'جاري الإنشاء…'
                      : 'إنشاء وحفظ'
                    : saveMutation.isPending
                      ? 'جاري الحفظ…'
                      : 'حفظ ومزامنة'}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
