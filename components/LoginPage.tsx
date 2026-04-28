'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v2CssVars } from '@/theme/tokens';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'supervisor' | 'admin'>('supervisor');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, password, role }),
      });

      const data = await response.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data));
        // Redirect based on role
        if (data.role === 'admin') {
          router.push('/admin/dashboard');
        } else {
          router.push('/dashboard');
        }
      } else {
        setError(data.error || 'فشل تسجيل الدخول');
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      lang="ar"
      style={v2CssVars()}
      className="min-h-screen flex items-center justify-center px-3 sm:px-4 py-6 overflow-x-hidden bg-[#05070D] text-[#EAF0FF] bg-[radial-gradient(900px_500px_at_20%_-10%,rgba(168,85,247,0.24),transparent_60%),radial-gradient(800px_500px_at_90%_0%,rgba(0,245,255,0.18),transparent_60%),linear-gradient(180deg,#05070D,#070A14_60%,#05070D)]"
    >
      <div className="w-full max-w-md min-w-0">
        <div className="text-center mb-5 sm:mb-7">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-2 break-words">نظام إدارة المشرفين</h1>
          <p className="text-[rgba(234,240,255,0.70)] text-sm sm:text-base break-words">Wakeel Team</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card title="تسجيل الدخول" subtitle="استخدم نفس بيانات الدخول الحالية.">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[rgba(234,240,255,0.75)] mb-2">
                  نوع المستخدم
                </label>
                <div className="flex gap-4">
                  <label htmlFor="role-supervisor" className="flex items-center gap-2 text-sm text-[rgba(234,240,255,0.80)]">
                    <input
                      id="role-supervisor"
                      name="role"
                      type="radio"
                      value="supervisor"
                      checked={role === 'supervisor'}
                      onChange={(e) => setRole(e.target.value as 'supervisor' | 'admin')}
                      className="accent-[color:var(--v2-accent-cyan)]"
                    />
                    <span>مشرف</span>
                  </label>
                  <label htmlFor="role-admin" className="flex items-center gap-2 text-sm text-[rgba(234,240,255,0.80)]">
                    <input
                      id="role-admin"
                      name="role"
                      type="radio"
                      value="admin"
                      checked={role === 'admin'}
                      onChange={(e) => setRole(e.target.value as 'supervisor' | 'admin')}
                      className="accent-[color:var(--v2-accent-purple)]"
                    />
                    <span>مدير</span>
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="code" className="block text-sm font-medium text-[rgba(234,240,255,0.75)] mb-2">
                  الكود
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-11 px-4 rounded-[var(--v2-radius-lg)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[#EAF0FF] placeholder:text-[rgba(234,240,255,0.45)] outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.25)]"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[rgba(234,240,255,0.75)] mb-2">
                  كلمة المرور
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-[var(--v2-radius-lg)] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[#EAF0FF] placeholder:text-[rgba(234,240,255,0.45)] outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.25)]"
                  required
                />
              </div>

              {error && (
                <div className="border border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.10)] text-[#FB7185] px-4 py-3 rounded-[var(--v2-radius-lg)] text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                variant="primary"
                className="w-full py-3"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}

