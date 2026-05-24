'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/recruitment', label: 'لوحة التعيين' },
  { href: '/recruitment/candidates', label: 'جميع المتقدمين' },
  { href: '/recruitment/archive', label: 'إعادة التفعيل' },
  { href: '/recruitment/bulk-import', label: 'الرفع المجمع' },
];

export default function RecruitmentSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 mb-6 border-b border-[rgba(255,255,255,0.10)] pb-4">
      {LINKS.map((link) => {
        const active =
          link.href === '/recruitment'
            ? pathname === '/recruitment'
            : pathname?.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)] text-black'
                : 'text-[rgba(234,240,255,0.75)] hover:bg-[rgba(255,255,255,0.06)]'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
