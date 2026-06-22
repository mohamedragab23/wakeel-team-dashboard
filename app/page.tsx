'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginPage from '@/components/LoginPage';
import { getDefaultAdminHome } from '@/lib/adminFeatureAccess';
import { authFetch } from '@/lib/authFetch';
import { setStoredUser } from '@/lib/clientSession';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    void authFetch('/api/auth/verify')
      .then(async (res) => {
        if (!res.ok) return;
        const user = await res.json();
        setStoredUser(user);
        if (user.role === 'admin') {
          router.push(getDefaultAdminHome(user.permissions));
        } else if (user.role === 'recruitment_manager') {
          router.push('/recruitment');
        } else {
          router.push('/dashboard');
        }
      })
      .catch(() => {
        /* show login */
      });
  }, [router]);

  return <LoginPage />;
}
