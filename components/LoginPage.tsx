'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v2CssVars } from '@/theme/tokens';
import { getDefaultAdminHome } from '@/lib/adminFeatureAccess';
import { setStoredUser } from '@/lib/clientSession';

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'supervisor' | 'admin' | 'recruitment_manager'>('supervisor');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await fetch(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ code, password, role }),
      });

      const data = await response.json();

      if (data.success) {
        setStoredUser(data);
        if (data.role === 'admin') {
          router.push(getDefaultAdminHome(data.permissions));
        } else if (data.role === 'recruitment_manager') {
          router.push('/recruitment');
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
      className="login-page bg-[#05070D] text-[#EAF0FF] bg-[radial-gradient(900px_500px_at_20%_-10%,rgba(168,85,247,0.24),transparent_60%),radial-gradient(800px_500px_at_90%_0%,rgba(0,245,255,0.18),transparent_60%),linear-gradient(180deg,#05070D,#070A14_60%,#05070D)]"
    >
      <div className="login-panel">
        <div className="login-title-block">
          <h1>نظام إدارة المشرفين</h1>
          <p>Wakeel Team</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="login-card">
            <div className="login-card-header">
              <h3>تسجيل الدخول</h3>
              <p>استخدم نفس بيانات الدخول الحالية.</p>
            </div>

            <div className="login-card-body">
              <div className="login-field">
                <span className="login-field-heading">نوع المستخدم</span>
                <div className="login-radio-row" role="group" aria-label="نوع المستخدم">
                  <label htmlFor="role-supervisor">
                    <input
                      id="role-supervisor"
                      name="role"
                      type="radio"
                      value="supervisor"
                      checked={role === 'supervisor'}
                      onChange={(e) =>
                        setRole(e.target.value as 'supervisor' | 'admin' | 'recruitment_manager')
                      }
                    />
                    <span>مشرف</span>
                  </label>
                  <label htmlFor="role-admin">
                    <input
                      id="role-admin"
                      name="role"
                      type="radio"
                      value="admin"
                      checked={role === 'admin'}
                      onChange={(e) =>
                        setRole(e.target.value as 'supervisor' | 'admin' | 'recruitment_manager')
                      }
                    />
                    <span>مدير</span>
                  </label>
                  <label htmlFor="role-recruitment">
                    <input
                      id="role-recruitment"
                      name="role"
                      type="radio"
                      value="recruitment_manager"
                      checked={role === 'recruitment_manager'}
                      onChange={(e) =>
                        setRole(e.target.value as 'supervisor' | 'admin' | 'recruitment_manager')
                      }
                    />
                    <span>مسؤول التعيينات</span>
                  </label>
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="code">الكود</label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  autoComplete="username"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="password">كلمة المرور</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error ? <div className="login-error">{error}</div> : null}

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
