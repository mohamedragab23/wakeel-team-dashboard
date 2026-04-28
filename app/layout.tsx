import type { Metadata } from 'next';
import './globals.css';
import ErrorBoundaryWrapper from '@/components/ErrorBoundaryWrapper';
import QueryProvider from '@/lib/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'نظام إدارة المشرفين - Wakeel Team',
  description: 'نظام إدارة شامل للمشرفين والمناديب',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <ErrorBoundaryWrapper>
          <QueryProvider>{children}</QueryProvider>
        </ErrorBoundaryWrapper>
      </body>
    </html>
  );
}

