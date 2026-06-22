'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SUPERVISOR_LINKS = [
  { href: '/ticketing', label: 'طلباتي', exact: true },
  { href: '/ticketing/new', label: 'طلب جديد' },
];

const ADMIN_LINKS = [
  { href: '/ticketing/admin', label: 'قائمة الانتظار', exact: true },
  { href: '/ticketing/admin/metrics', label: 'المقاييس' },
];

export default function TicketingSubNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? ADMIN_LINKS : SUPERVISOR_LINKS;

  return (
    <nav className="flex flex-wrap gap-2 mb-6">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname?.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                : 'bg-white/5 text-[rgba(234,240,255,0.75)] hover:bg-white/10'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
