'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { v2CssVars } from '@/theme/tokens';
import {
  adminCanAccessRecruitment,
  filterAdminMenuForPermissions,
  isGrantingAdmin,
} from '@/lib/adminFeatureAccess';
import { hasRecruitmentAccess } from '@/lib/recruitment/recruitmentAuth';
import RecruitmentNotificationBell from '@/components/recruitment/RecruitmentNotificationBell';

const RECRUITMENT_MENU = [
  { href: '/recruitment', label: 'لوحة التعيين', icon: '📊' },
  { href: '/recruitment/candidates', label: 'جميع المتقدمين', icon: '👥' },
  { href: '/recruitment/outreach', label: 'داتا العروض', icon: '📞' },
  { href: '/recruitment/archive', label: 'المرشحون القدماء', icon: '📁' },
  { href: '/recruitment/bulk-import', label: 'إضافة جماعية', icon: '📥' },
];

interface User {
  name?: string;
  role?: string;
  permissions?: string;
  dataZone?: string;
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

        // Guard admin routes: admins only
        if (pathname?.startsWith('/admin') && parsedUser?.role !== 'admin') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/');
          return;
        }
        // مسؤول التعيينات: لا يصل لصفحات الأدمن
        if (parsedUser?.role === 'recruitment_manager' && pathname?.startsWith('/admin')) {
          router.push('/recruitment');
          return;
        }
        // قسم التعيين: أدمن (بصلاحية) أو مسؤول تعيينات فقط
        if (
          pathname?.startsWith('/recruitment') &&
          !hasRecruitmentAccess(parsedUser as { role?: string; permissions?: string })
        ) {
          router.push(parsedUser?.role === 'admin' ? '/admin/dashboard' : '/dashboard');
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
    if (user?.role === 'recruitment_manager') {
      return RECRUITMENT_MENU;
    }
    if (user?.role === 'admin') {
      const perms = String(user?.permissions ?? '');
      const base = filterAdminMenuForPermissions(perms)
        .filter((d) => d.feature !== 'recruitment')
        .map((d) => ({
          href: d.href,
          label: d.label,
          icon: d.icon,
        }));
      if (adminCanAccessRecruitment(perms)) {
        base.push(...RECRUITMENT_MENU);
      }
      if (isGrantingAdmin(user)) {
        base.push({ href: '/admin/admin-permissions', label: 'المستخدمون والهرمية', icon: '🔐' });
      }
      return base;
    } else {
      // Supervisor menu - Reports tab removed as per requirements
      return [
        { href: '/dashboard', label: 'لوحة التحكم', icon: '📊' },
        { href: '/riders', label: 'المناديب', icon: '👥' },
        { href: '/equipment-delivery', label: 'تسليم معدات', icon: '📤' },
        { href: '/equipment-return', label: 'استرجاع معدات', icon: '📥' },
        { href: '/deductions-upload', label: 'الاستقطاعات (Excel)', icon: '📑' },
        { href: '/termination-requests', label: 'الإقالات', icon: '🚫' },
        { href: '/reactivation-requests', label: 'إعادة التفعيل', icon: '🔄' },
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
              {(user?.role === 'recruitment_manager' ||
                (user?.role === 'admin' && adminCanAccessRecruitment(user?.permissions))) && (
                <RecruitmentNotificationBell />
              )}
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {menuItems.map((item) => {
                const isActive =
                  item.href === '/recruitment'
                    ? pathname === '/recruitment'
                    : pathname === item.href ||
                      (pathname?.startsWith(`${item.href}/`) ?? false);
                return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)] text-black shadow-[var(--v2-shadow-glow)]'
                      : 'text-[rgba(234,240,255,0.80)] hover:bg-[rgba(255,255,255,0.06)]'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
              })}
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
