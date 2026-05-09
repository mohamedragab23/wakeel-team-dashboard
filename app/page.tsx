'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginPage from '@/components/LoginPage';
import { getDefaultAdminHome } from '@/lib/adminFeatureAccess';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          router.push(getDefaultAdminHome(user.permissions));
        } else {
          router.push('/dashboard');
        }
      } catch (e) {
        router.push('/dashboard');
      }
    }
  }, [router]);

  return <LoginPage />;
}

