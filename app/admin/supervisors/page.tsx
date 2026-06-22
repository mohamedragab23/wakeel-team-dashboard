'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePageNotify } from '@/lib/usePageNotify';
import { authFetch, clearClientSession } from '@/lib/authFetch';
import {
  ZONE_OPTIONS,
  isAllowedZone,
  parseAdminAllowedZonesList,
  serializeAdminAllowedZones,
  type ZoneOption } from '@/lib/zones';
import type { SupervisorOrgRole } from '@/lib/orgHierarchy';

interface Supervisor {
  code: string;
  name: string;
  region: string;
  email: string;
  password: string;
  salaryType?: 'fixed' | 'commission_type1' | 'commission_type2';
  salaryAmount?: number;
  commissionFormula?: string;
  target?: number;
  orgRole?: SupervisorOrgRole;
  parentCode?: string;
}

const ORG_ROLE_OPTIONS: { value: SupervisorOrgRole; label: string }[] = [
  { value: 'supervisor', label: 'مشرف تشغيلي' },
  { value: 'zone_manager', label: 'مدير زون' },
  { value: 'regional_manager', label: 'مدير منطقة' },
];

function orgRoleLabel(role?: SupervisorOrgRole): string {
  return ORG_ROLE_OPTIONS.find((o) => o.value === (role ?? 'supervisor'))?.label ?? 'مشرف تشغيلي';
}

export default function AdminSupervisorsPage() {
  const notify = usePageNotify();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupervisor, setEditingSupervisor] = useState<Supervisor | null>(null);
  /** زونات معتمدة (قائمة الشفتات)، تُحفظ في عمود المنطقة كقيم مفصولة بـ | */
  const [selectedZones, setSelectedZones] = useState<ZoneOption[]>([]);
  const [formData, setFormData] = useState<Partial<Supervisor>>({
    code: '',
    name: '',
    region: '',
    email: '',
    password: '',
    salaryType: 'commission_type1',
    target: 0,
    orgRole: 'supervisor',
    parentCode: '' });

  const queryClient = useQueryClient();

  const { data: supervisorsPayload, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'supervisors'],
    queryFn: async () => {
      const res = await authFetch(`/api/admin/supervisors?refresh=true&_t=${Date.now()}`, {
        cache: 'no-store' });
      if (res.status === 401) {
        clearClientSession();
        throw new Error('انتهت الجلسة أو لا تملك صلاحية الأدمن. يرجى تسجيل الدخول مرة أخرى.');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'فشل تحميل المشرفين');
      }
      return {
        list: (data.data || []) as Supervisor[],
        managers: (data.managerOptions || data.data || []) as Supervisor[] };
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000, // Don't cache
    refetchOnMount: true, // Always refetch on mount
    refetchOnWindowFocus: false });

  const supervisors = supervisorsPayload?.list ?? [];
  const hierarchyManagers = supervisorsPayload?.managers ?? supervisors;

  const addMutation = useMutation({
    mutationFn: async (supervisor: Supervisor) => {
      const res = await authFetch('/api/admin/supervisors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify(supervisor) });
      if (res.status === 401) {
        clearClientSession();
        throw new Error('غير مصرح. يرجى تسجيل الدخول كأدمن.');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'فشل إضافة المشرف');
      }
      return data;
    },
    onSuccess: async (data) => {
      console.log('[AdminSupervisorsPage] Add mutation success, data:', data);
      // Invalidate and refetch to get fresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      // Wait a moment for the server to process
      await new Promise(resolve => setTimeout(resolve, 500));
      // Force refetch to get the new supervisor
      const freshData = await refetch();
      console.log('[AdminSupervisorsPage] Refetched supervisors:', freshData.data?.list?.length || 0);
      setShowAddModal(false);
      setSelectedZones([]);
      setFormData({
        code: '',
        name: '',
        region: '',
        email: '',
        password: '',
        salaryType: 'commission_type1',
        target: 0,
        orgRole: 'supervisor',
        parentCode: '' });
      notify.success(' تم إضافة المشرف بنجاح');
    },
    onError: (error: any) => {
      notify.error(` خطأ: ${error.message || 'فشل إضافة المشرف'}`);
    } });

  const updateMutation = useMutation({
    mutationFn: async ({ code, updates }: { code: string; updates: Partial<Supervisor> }) => {
      const res = await authFetch('/api/admin/supervisors', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...updates }) });
      if (res.status === 401) {
        clearClientSession();
        throw new Error('غير مصرح. يرجى تسجيل الدخول كأدمن.');
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل تحديث المشرف');
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      await refetch();
      setEditingSupervisor(null);
      setSelectedZones([]);
      setFormData({
        code: '',
        name: '',
        region: '',
        email: '',
        password: '',
        salaryType: 'commission_type1',
        target: 0,
        orgRole: 'supervisor',
        parentCode: '' });
      notify.success(' تم تحديث المشرف بنجاح');
    },
    onError: (error: any) => {
      notify.error(` خطأ: ${error.message || 'فشل تحديث المشرف'}`);
    } });

  const deleteMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await authFetch(`/api/admin/supervisors?code=${code}`, {
        method: 'DELETE',
         });
      if (res.status === 401) {
        clearClientSession();
        throw new Error('غير مصرح. يرجى تسجيل الدخول كأدمن.');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'فشل حذف المشرف');
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'supervisors'] });
      await refetch(); // Force refetch
      notify.success(' تم حذف المشرف بنجاح');
    },
    onError: (error: any) => {
      notify.error(` خطأ: ${error.message || 'فشل حذف المشرف'}`);
    } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const serialized = serializeAdminAllowedZones(selectedZones);
    let regionToSave = serialized;
    if (!regionToSave && editingSupervisor) {
      const old = String(editingSupervisor.region || '').trim();
      if (old && parseAdminAllowedZonesList(old).length === 0) {
        regionToSave = old;
      }
    }
    const payload = { ...formData, region: regionToSave };
    if (editingSupervisor) {
      updateMutation.mutate({ code: editingSupervisor.code, updates: payload });
    } else {
      addMutation.mutate(payload as Supervisor);
    }
  };

  const handleEdit = (supervisor: Supervisor) => {
    setEditingSupervisor(supervisor);
    setFormData({
      ...supervisor,
      orgRole: supervisor.orgRole ?? 'supervisor',
      parentCode: supervisor.parentCode ?? '' });
    setSelectedZones(parseAdminAllowedZonesList(supervisor.region));
    setShowAddModal(true);
  };

  const parentManagerOptions = hierarchyManagers.filter((s: Supervisor) => {
    const role = s.orgRole ?? 'supervisor';
    const mine = formData.orgRole ?? 'supervisor';
    if (mine === 'supervisor') return role === 'zone_manager' || role === 'regional_manager';
    if (mine === 'zone_manager') return role === 'regional_manager';
    return false;
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">إدارة المشرفين</h1>
            <p className="text-[rgba(234,240,255,0.70)]">
              إضافة وتعديل الهرمية (مشرف / مدير زون / مدير منطقة) — يُحفظ تلقائياً في الشيت
            </p>
          </div>
          <button
            onClick={() => {
              setEditingSupervisor(null);
              setSelectedZones([]);
              setFormData({
                code: '',
                name: '',
                region: '',
                email: '',
                password: '',
                salaryType: 'commission_type1',
                target: 0,
                orgRole: 'supervisor',
                parentCode: '' });
              setShowAddModal(true);
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            + إضافة مشرف
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-[#1e1e2f]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الكود</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الاسم</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الزونات</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المنصب</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">المدير المباشر</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">البريد</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">نوع الراتب</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الهدف</th>
                  <th className="text-right py-4 px-6 text-sm font-semibold text-gray-700">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {supervisors.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500">
                      لا توجد مشرفين
                    </td>
                  </tr>
                ) : (
                  supervisors.map((supervisor: Supervisor, index: number) => (
                    <tr key={`supervisor-${supervisor.code}-${index}`} className="hover:bg-gray-50">
                      <td className="py-4 px-6 text-sm text-gray-800">{supervisor.code}</td>
                      <td className="py-4 px-6 text-sm text-gray-800 font-medium whitespace-normal break-words min-w-[240px]">
                        {supervisor.name}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600">
                        {(() => {
                          const z = parseAdminAllowedZonesList(supervisor.region);
                          if (z.length > 0) return z.join('، ');
                          return supervisor.region?.trim() || '—';
                        })()}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600">{orgRoleLabel(supervisor.orgRole)}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">{supervisor.parentCode?.trim() || '—'}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">{supervisor.email}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">
                        <div className="space-y-1">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            supervisor.salaryType === 'fixed' ? 'bg-blue-100 text-blue-800' :
                            supervisor.salaryType === 'commission_type1' ? 'bg-green-100 text-green-800' :
                            supervisor.salaryType === 'commission_type2' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {supervisor.salaryType === 'fixed' && 'راتب ثابت'}
                            {supervisor.salaryType === 'commission_type1' && 'عمولة نوع 1'}
                            {supervisor.salaryType === 'commission_type2' && 'عمولة نوع 2'}
                            {!supervisor.salaryType && 'غير محدد'}
                          </span>
                          {supervisor.salaryType === 'fixed' && supervisor.salaryAmount && (
                            <div className="text-xs text-gray-500">
                              {supervisor.salaryAmount.toFixed(2)} ج.م
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-600">
                        {Number.isFinite(Number(supervisor.target)) && Number(supervisor.target) > 0 ? (
                          <span className="font-medium text-blue-600">
                            {Number(supervisor.target).toLocaleString()} ساعة
                          </span>
                        ) : Number(supervisor.target) === 0 ? (
                          <span className="text-gray-500">0</span>
                        ) : (
                          <span className="text-gray-400">غير محدد</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(supervisor)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('هل أنت متأكد من حذف هذا المشرف؟')) {
                                deleteMutation.mutate(supervisor.code);
                              }
                            }}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto text-[#1e1e2f]">
              <div className="p-6 border-b">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingSupervisor ? 'تعديل مشرف' : 'إضافة مشرف جديد'}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="supervisor-code" className="block text-sm font-medium text-gray-700 mb-2">الكود *</label>
                    <input
                      id="supervisor-code"
                      name="supervisor-code"
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                      disabled={!!editingSupervisor}
                    />
                  </div>
                  <div>
                    <label htmlFor="supervisor-name" className="block text-sm font-medium text-gray-700 mb-2">الاسم *</label>
                    <input
                      id="supervisor-name"
                      name="supervisor-name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="supervisor-org-role" className="block text-sm font-medium text-gray-700 mb-2">
                      المنصب في الهرمية
                    </label>
                    <select
                      id="supervisor-org-role"
                      value={formData.orgRole ?? 'supervisor'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          orgRole: e.target.value as SupervisorOrgRole,
                          parentCode:
                            e.target.value === 'regional_manager' ? '' : formData.parentCode })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {ORG_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="supervisor-parent" className="block text-sm font-medium text-gray-700 mb-2">
                      المدير المباشر (كود)
                    </label>
                    <select
                      id="supervisor-parent"
                      value={formData.parentCode ?? ''}
                      onChange={(e) => setFormData({ ...formData, parentCode: e.target.value })}
                      disabled={formData.orgRole === 'regional_manager'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                    >
                      <option value="">— بدون —</option>
                      {parentManagerOptions.map((s: Supervisor) => (
                        <option key={s.code} value={s.code}>
                          {s.code} — {s.name} ({orgRoleLabel(s.orgRole)})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      المشرف يرتبط بمدير الزون؛ مدير الزون بمدير المنطقة.
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <span className="block text-sm font-medium text-gray-700 mb-2" id="supervisor-zones-label">
                      الزونات (نفس زونات الشفتات)
                    </span>
                    <p className="text-xs text-gray-500 mb-2">
                      اختر زوناً واحداً أو أكثر. يُحفظ تلقائياً في الشيت.
                    </p>
                    <select
                      id="supervisor-zones"
                      name="supervisor-zones"
                      multiple
                      size={Math.min(ZONE_OPTIONS.length, 8)}
                      value={selectedZones}
                      onChange={(e) => {
                        const picked = Array.from(e.target.selectedOptions, (o) => o.value).filter(isAllowedZone);
                        setSelectedZones(picked);
                      }}
                      aria-labelledby="supervisor-zones-label"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white min-h-[140px]"
                    >
                      {ZONE_OPTIONS.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      مع Windows: Ctrl + نقر لاختيار عدة زونات. مع Mac: ⌘ + نقر. ترك القائمة بلا اختيار يعني لا زونات مسجَّلة.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="supervisor-email" className="block text-sm font-medium text-gray-700 mb-2">البريد الإلكتروني *</label>
                    <input
                      id="supervisor-email"
                      name="supervisor-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="supervisor-password" className="block text-sm font-medium text-gray-700 mb-2">كلمة المرور *</label>
                    <input
                      id="supervisor-password"
                      name="supervisor-password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="supervisor-salary-type" className="block text-sm font-medium text-gray-700 mb-2">نوع الراتب</label>
                    <select
                      id="supervisor-salary-type"
                      name="supervisor-salary-type"
                      value={formData.salaryType || 'commission_type1'}
                      onChange={(e) =>
                        setFormData({ ...formData, salaryType: e.target.value as 'fixed' | 'commission_type1' | 'commission_type2' })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="fixed">ثابت</option>
                      <option value="commission_type1">عمولة نوع 1 (متوسط الساعات اليومي)</option>
                      <option value="commission_type2">عمولة نوع 2 (نسبة من الإيرادات)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="supervisor-target" className="block text-sm font-medium text-gray-700 mb-2">الهدف الشهري (عدد الساعات)</label>
                    <input
                      id="supervisor-target"
                      name="supervisor-target"
                      type="number"
                      step="0.01"
                      value={formData.target === undefined || formData.target === null ? '' : formData.target}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') setFormData({ ...formData, target: undefined });
                        else {
                          const n = parseFloat(v);
                          setFormData({ ...formData, target: Number.isFinite(n) ? n : undefined });
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      placeholder="مثال: 300 (ساعة)"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      الهدف بالساعات لحساب المكافأة عند تحقيقه
                    </p>
                  </div>
                  {formData.salaryType === 'fixed' && (
                    <div>
                      <label htmlFor="supervisor-salary-amount" className="block text-sm font-medium text-gray-700 mb-2">مبلغ الراتب (ج.م)</label>
                      <input
                        id="supervisor-salary-amount"
                        name="supervisor-salary-amount"
                        type="number"
                        step="0.01"
                        value={formData.salaryAmount || ''}
                        onChange={(e) => setFormData({ ...formData, salaryAmount: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        placeholder="مثال: 5000"
                      />
                    </div>
                  )}
                  {formData.salaryType === 'commission_type1' && (
                    <div className="md:col-span-2 bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-800 mb-2">عمولة نوع 1 - حسب متوسط الساعات اليومي</h4>
                      <p className="text-sm text-green-700">
                        يتم حساب متوسط ساعات العمل اليومي للشهر، ثم تحديد معدل العمولة:
                      </p>
                      <ul className="text-xs text-green-600 mt-2 space-y-1">
                        <li>• 0-100 ساعة: 1 ج.م/طلب</li>
                        <li>• 101-200 ساعة: 1.20 ج.م/طلب</li>
                        <li>• 201-300 ساعة: 1.30 ج.م/طلب</li>
                        <li>• 301-400 ساعة: 1.40 ج.م/طلب</li>
                        <li>• 401+ ساعة: 1.50 ج.م/طلب</li>
                      </ul>
                    </div>
                  )}
                  {formData.salaryType === 'commission_type2' && (
                    <div className="md:col-span-2 bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-medium text-purple-800 mb-2">عمولة نوع 2 - نسبة من الإيرادات</h4>
                      <p className="text-sm text-purple-700">
                        القيمة الأساسية = (إجمالي قبض المشرف من تبويب قبض_المشرفين) × 11%
                        <br />
                        عمولة المشرف = (القيمة الأساسية) × 60%
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    {editingSupervisor ? 'حفظ التعديلات' : 'إضافة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingSupervisor(null);
                      setSelectedZones([]);
                      setFormData({ code: '', name: '', region: '', email: '', password: '', salaryType: 'commission_type1', target: 0 });
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

