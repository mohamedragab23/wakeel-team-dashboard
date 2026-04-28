'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Supervisor {
  code: string;
  name: string;
  region: string;
}

interface SalaryConfig {
  supervisorId: string;
  salaryMethod: 'fixed' | 'commission_type1' | 'commission_type2';
  fixedSalary?: number;
  // For commission_type1
  type1Ranges?: {
    minHours: number;
    maxHours: number;
    ratePerOrder: number;
  }[];
  // For commission_type2
  type2BasePercentage?: number; // Default 11%
  type2SupervisorPercentage?: number; // Default 60%
}

export default function SalaryConfigPage() {
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [salaryMethod, setSalaryMethod] = useState<'fixed' | 'commission_type1' | 'commission_type2'>('fixed');
  const [fixedSalary, setFixedSalary] = useState<number>(0);
  
  // For commission_type1
  const [type1Ranges, setType1Ranges] = useState([
    { minHours: 0, maxHours: 100, ratePerOrder: 1.0 },
    { minHours: 101, maxHours: 200, ratePerOrder: 1.20 },
    { minHours: 201, maxHours: 300, ratePerOrder: 1.30 },
    { minHours: 301, maxHours: 400, ratePerOrder: 1.40 },
    { minHours: 401, maxHours: 999999, ratePerOrder: 1.50 },
  ]);
  
  // For commission_type2
  const [type2BasePercentage, setType2BasePercentage] = useState<number>(11);
  const [type2SupervisorPercentage, setType2SupervisorPercentage] = useState<number>(60);

  const queryClient = useQueryClient();

  // Fetch supervisors
  const { data: supervisors = [] } = useQuery({
    queryKey: ['admin', 'supervisors'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/supervisors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : [];
    },
  });

  // Fetch existing config when supervisor selected
  const { data: existingConfig } = useQuery({
    queryKey: ['salary-config', selectedSupervisor],
    queryFn: async () => {
      if (!selectedSupervisor) return null;
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/salary/config?supervisorId=${selectedSupervisor}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return data.success ? data.data : null;
    },
    enabled: !!selectedSupervisor,
  });

  // Load existing config when available
  useEffect(() => {
    if (existingConfig) {
      setSalaryMethod(existingConfig.salaryMethod || 'fixed');
      setFixedSalary(existingConfig.fixedSalary || 0);
      if (existingConfig.type1Ranges) {
        setType1Ranges(existingConfig.type1Ranges);
      }
      if (existingConfig.type2BasePercentage !== undefined) {
        setType2BasePercentage(existingConfig.type2BasePercentage);
      }
      if (existingConfig.type2SupervisorPercentage !== undefined) {
        setType2SupervisorPercentage(existingConfig.type2SupervisorPercentage);
      }
    }
  }, [existingConfig]);

  // Save config mutation
  const saveMutation = useMutation({
    mutationFn: async (config: SalaryConfig) => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/salary/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-config'] });
      alert('✅ تم حفظ الإعدادات بنجاح');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupervisor) {
      alert('يرجى اختيار مشرف');
      return;
    }

    const config: SalaryConfig = {
      supervisorId: selectedSupervisor,
      salaryMethod,
    };

    if (salaryMethod === 'fixed') {
      if (!fixedSalary || fixedSalary <= 0) {
        alert('يرجى إدخال مبلغ الراتب الثابت');
        return;
      }
      config.fixedSalary = fixedSalary;
    } else if (salaryMethod === 'commission_type1') {
      // Validate ranges
      for (const range of type1Ranges) {
        if (range.minHours < 0 || range.maxHours <= range.minHours || range.ratePerOrder <= 0) {
          alert('يرجى التحقق من صحة نطاقات الساعات ومعدلات العمولة');
          return;
        }
      }
      config.type1Ranges = type1Ranges;
    } else if (salaryMethod === 'commission_type2') {
      if (type2BasePercentage <= 0 || type2BasePercentage > 100) {
        alert('النسبة الأساسية يجب أن تكون بين 0 و 100');
        return;
      }
      if (type2SupervisorPercentage <= 0 || type2SupervisorPercentage > 100) {
        alert('نسبة المشرف يجب أن تكون بين 0 و 100');
        return;
      }
      config.type2BasePercentage = type2BasePercentage;
      config.type2SupervisorPercentage = type2SupervisorPercentage;
    }

    saveMutation.mutate(config);
  };

  const updateType1Range = (index: number, field: 'minHours' | 'maxHours' | 'ratePerOrder', value: number) => {
    const updated = [...type1Ranges];
    updated[index] = { ...updated[index], [field]: value };
    setType1Ranges(updated);
  };

  const addType1Range = () => {
    setType1Ranges([
      ...type1Ranges,
      { minHours: 0, maxHours: 100, ratePerOrder: 1.0 },
    ]);
  };

  const removeType1Range = (index: number) => {
    if (type1Ranges.length > 1) {
      setType1Ranges(type1Ranges.filter((_, i) => i !== index));
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">إعدادات الرواتب</h1>
          <p className="text-[rgba(234,240,255,0.70)]">تكوين طريقة حساب الراتب لكل مشرف</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 space-y-6">
          {/* Supervisor Selection */}
          <div>
            <label htmlFor="supervisor-select" className="block text-sm font-medium text-gray-700 mb-2">اختر المشرف *</label>
            <select
              id="supervisor-select"
              name="supervisor-select"
              value={selectedSupervisor}
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            >
              <option value="">اختر مشرف</option>
              {supervisors.map((s: Supervisor, index: number) => (
                <option key={`supervisor-${s.code}-${index}`} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Salary Method */}
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-2">نوع الراتب *</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label htmlFor="salary-method-fixed" className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  id="salary-method-fixed"
                  name="salary-method"
                  type="radio"
                  value="fixed"
                  checked={salaryMethod === 'fixed'}
                  onChange={(e) => setSalaryMethod(e.target.value as 'fixed')}
                  className="mr-2"
                />
                <div>
                  <span className="font-medium">راتب ثابت</span>
                  <p className="text-xs text-gray-500">مبلغ ثابت شهري</p>
                </div>
              </label>
              <label htmlFor="salary-method-type1" className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  id="salary-method-type1"
                  name="salary-method"
                  type="radio"
                  value="commission_type1"
                  checked={salaryMethod === 'commission_type1'}
                  onChange={(e) => setSalaryMethod(e.target.value as 'commission_type1')}
                  className="mr-2"
                />
                <div>
                  <span className="font-medium">عمولة (النوع الأول)</span>
                  <p className="text-xs text-gray-500">بناءً على الساعات والطلبات</p>
                </div>
              </label>
              <label htmlFor="salary-method-type2" className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  id="salary-method-type2"
                  name="salary-method"
                  type="radio"
                  value="commission_type2"
                  checked={salaryMethod === 'commission_type2'}
                  onChange={(e) => setSalaryMethod(e.target.value as 'commission_type2')}
                  className="mr-2"
                />
                <div>
                  <span className="font-medium">عمولة (النوع الثاني)</span>
                  <p className="text-xs text-gray-500">نسبة من فاتورة المناديب</p>
                </div>
              </label>
            </div>
          </div>

          {/* Fixed Salary */}
          {salaryMethod === 'fixed' && (
            <div>
              <label htmlFor="fixed-salary-amount" className="block text-sm font-medium text-gray-700 mb-2">مبلغ الراتب الثابت (ج.م) *</label>
              <input
                id="fixed-salary-amount"
                name="fixed-salary-amount"
                type="number"
                value={fixedSalary}
                onChange={(e) => setFixedSalary(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                min="0"
                step="0.01"
                required
              />
            </div>
          )}

          {/* Commission Type 1 Configuration */}
          {salaryMethod === 'commission_type1' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-semibold mb-2">نظام العمولة (النوع الأول)</p>
                <p className="text-sm text-blue-700">
                  يتم حساب العمولة بناءً على إجمالي ساعات مناديب المشرف اليومية:
                </p>
                <ul className="text-sm text-blue-700 list-disc list-inside mr-4 mt-2 space-y-1">
                  <li>0 - 100 ساعة: 1 ج.م/طلب</li>
                  <li>101 - 200 ساعة: 1.20 ج.م/طلب</li>
                  <li>201 - 300 ساعة: 1.30 ج.م/طلب</li>
                  <li>301 - 400 ساعة: 1.40 ج.م/طلب</li>
                  <li>401 ساعة فأكثر: 1.50 ج.م/طلب</li>
                </ul>
                <p className="text-sm text-blue-700 mt-2">
                  <strong>العمولة اليومية = (إجمالي الطلبات) × (قيمة العمولة للطلب)</strong>
                </p>
              </div>

              {/* Hours Ranges */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <div className="block text-sm font-medium text-gray-700">نطاقات الساعات ومعدلات العمولة</div>
                  <button
                    type="button"
                    onClick={addType1Range}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + إضافة نطاق
                  </button>
                </div>

                <div className="space-y-3">
                  {type1Ranges.map((range, index) => (
                    <div key={`range-${index}`} className="flex gap-3 items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <label htmlFor={`range-min-${index}`} className="text-xs text-gray-600 mb-1 block">من (ساعة)</label>
                        <input
                          id={`range-min-${index}`}
                          name={`range-min-${index}`}
                          type="number"
                          value={range.minHours}
                          onChange={(e) => updateType1Range(index, 'minHours', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                          min="0"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor={`range-max-${index}`} className="text-xs text-gray-600 mb-1 block">إلى (ساعة)</label>
                        <input
                          id={`range-max-${index}`}
                          name={`range-max-${index}`}
                          type="number"
                          value={range.maxHours === 999999 ? '' : range.maxHours}
                          onChange={(e) => updateType1Range(index, 'maxHours', e.target.value === '' ? 999999 : parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                          min="0"
                          placeholder="لا نهائي"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor={`range-rate-${index}`} className="text-xs text-gray-600 mb-1 block">معدل العمولة (ج.م/طلب)</label>
                        <input
                          id={`range-rate-${index}`}
                          name={`range-rate-${index}`}
                          type="number"
                          value={range.ratePerOrder}
                          onChange={(e) => updateType1Range(index, 'ratePerOrder', parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-1 border border-gray-300 rounded text-sm"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      {type1Ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeType1Range(index)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Commission Type 2 Configuration */}
          {salaryMethod === 'commission_type2' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 font-semibold mb-2">نظام العمولة (النوع الثاني)</p>
                <p className="text-sm text-green-700">
                  يتم حساب العمولة بناءً على نسبة من فاتورة المناديب:
                </p>
                <ul className="text-sm text-green-700 list-disc list-inside mr-4 mt-2 space-y-1">
                  <li>القيمة الأساسية = (إجمالي قبض المناديب) × 11%</li>
                  <li>عمولة المشرف = (القيمة الأساسية) × (النسبة المئوية للمشرف)</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="type2-base-percentage" className="block text-sm font-medium text-gray-700 mb-2">
                    النسبة الأساسية (%) *
                  </label>
                  <input
                    id="type2-base-percentage"
                    name="type2-base-percentage"
                    type="number"
                    value={type2BasePercentage}
                    onChange={(e) => setType2BasePercentage(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">القيمة الافتراضية: 11%</p>
                </div>
                <div>
                  <label htmlFor="type2-supervisor-percentage" className="block text-sm font-medium text-gray-700 mb-2">
                    نسبة المشرف (%) *
                  </label>
                  <input
                    id="type2-supervisor-percentage"
                    name="type2-supervisor-percentage"
                    type="number"
                    value={type2SupervisorPercentage}
                    onChange={(e) => setType2SupervisorPercentage(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    min="0"
                    max="100"
                    step="0.1"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">القيمة الافتراضية: 60%</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-[#1e1e2f]">
          <h3 className="font-semibold text-blue-800 mb-2">معلومات عن أنظمة الرواتب</h3>
          <div className="text-sm text-blue-700 space-y-2">
            <div>
              <p className="font-semibold">1. الراتب الثابت:</p>
              <p>مبلغ ثابت شهري لا يعتمد على الأداء</p>
            </div>
            <div>
              <p className="font-semibold">2. نظام العمولة (النوع الأول):</p>
              <p>بناءً على إجمالي ساعات مناديب المشرف والطلبات</p>
              <p className="mr-4">• العمولة = (إجمالي الطلبات) × (قيمة العمولة للطلب حسب نطاق الساعات)</p>
            </div>
            <div>
              <p className="font-semibold">3. نظام العمولة (النوع الثاني):</p>
              <p>نسبة من فاتورة المناديب</p>
              <p className="mr-4">• القيمة الأساسية = (إجمالي قبض المناديب) × النسبة الأساسية (11%)</p>
              <p className="mr-4">• عمولة المشرف = (القيمة الأساسية) × نسبة المشرف (60%)</p>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-300">
              <p className="font-semibold">الخصومات:</p>
              <p className="mr-4">يتم خصم: السلف، المعدات، الاستعلام الأمني، خصم الأداء</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

