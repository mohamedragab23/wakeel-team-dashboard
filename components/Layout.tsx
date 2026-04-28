'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { v2CssVars } from '@/theme/tokens';

interface User {
  name?: string;
  role?: string;
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token) {
      router.push('/');
      return;
    }

    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr) as User;
        setUser(parsedUser);

        // Guard admin routes: if user isn't admin, force re-login.
        if (pathname?.startsWith('/admin') && parsedUser?.role !== 'admin') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/');
          return;
        }
      } catch (e) {
        console.error('Error parsing user data');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/');
      }
    } else {
      // If we have a token but no user payload, avoid ambiguous access.
      if (pathname?.startsWith('/admin')) {
        localStorage.removeItem('token');
        router.push('/');
      }
    }
  }, [router, pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  const getMenuItems = () => {
    if (user?.role === 'admin') {
      return [
        { href: '/admin/dashboard', label: 'لوحة التحكم', icon: '📊' },
        { href: '/admin/supervisors', label: 'إدارة المشرفين', icon: '👔' },
        { href: '/admin/riders', label: 'إدارة المناديب', icon: '👥' },
        { href: '/admin/termination-requests', label: 'طلبات الإقالة', icon: '🚫' },
        { href: '/admin/assignment-requests', label: 'طلبات التعيين', icon: '➕' },
        { href: '/admin/performance', label: 'رفع بيانات الأداء', icon: '📈' },
        { href: '/admin/supervisor-performance', label: 'أداء المشرفين', icon: '📊' },
        { href: '/admin/salary-config', label: 'إعدادات الرواتب', icon: '⚙️' },
        { href: '/admin/equipment-pricing', label: 'أسعار المعدات', icon: '🛠️' },
        { href: '/admin/equipment-limits', label: 'حدود خصم المعدات', icon: '📦' },
        { href: '/admin/salaries', label: 'حساب الرواتب', icon: '💰' },
        { href: '/admin/debug', label: 'تهيئة النظام والتحقق', icon: '🧹' },
        { href: '/shifts', label: 'الشفتات', icon: '🕒' },
      ];
    } else {
      // Supervisor menu - Reports tab removed as per requirements
      return [
        { href: '/dashboard', label: 'لوحة التحكم', icon: '📊' },
        { href: '/riders', label: 'المناديب', icon: '👥' },
        { href: '/termination-requests', label: 'الإقالات', icon: '🚫' },
        { href: '/performance', label: 'الأداء', icon: '📈' },
        { href: '/salary', label: 'الراتب', icon: '💰' },
        { href: '/shifts', label: 'الشفتات', icon: '🕒' },
      ];
    }
  };

  const menuItems = getMenuItems();

  return (
    <div
      style={v2CssVars()}
      className="app-theme min-h-screen overflow-x-hidden bg-[#05070D] text-[#EAF0FF] bg-[radial-gradient(900px_500px_at_20%_-10%,rgba(168,85,247,0.22),transparent_60%),radial-gradient(800px_500px_at_90%_0%,rgba(0,245,255,0.18),transparent_60%),linear-gradient(180deg,#05070D,#070A14_60%,#05070D)]"
    >
      {/* Mobile Header */}
      <div className="lg:hidden bg-[rgba(255,255,255,0.06)] backdrop-blur-md border-b border-[rgba(255,255,255,0.10)]">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.06)]"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-[#EAF0FF]">نظام الإدارة</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
            'bg-[rgba(255,255,255,0.06)] backdrop-blur-md border-e border-[rgba(255,255,255,0.10)] shadow-[var(--v2-shadow-soft)]'
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="p-6 border-b border-[rgba(255,255,255,0.10)]">
              <h2 className="text-2xl font-bold text-[#EAF0FF]">Wakeel Team</h2>
              <p className="text-sm text-[rgba(234,240,255,0.70)] mt-1">{user?.name || 'المستخدم'}</p>
            </div>

            <nav className="flex-1 p-4 space-y-2">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true} // Prefetch pages on hover for faster navigation
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    pathname === item.href
                      ? 'bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)] text-black shadow-[var(--v2-shadow-glow)]'
                      : 'text-[rgba(234,240,255,0.80)] hover:bg-[rgba(255,255,255,0.06)]'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-[rgba(255,255,255,0.10)]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[#FB7185] hover:bg-[rgba(251,113,133,0.10)] transition-colors"
              >
                <span>🚪</span>
                <span className="font-medium">تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0 w-full max-w-full lg:ml-0">
          <div className="p-4 lg:p-8 min-w-0 max-w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
