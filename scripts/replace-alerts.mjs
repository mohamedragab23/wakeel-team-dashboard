import fs from 'fs';

const files = [
  'app/admin/supervisors/page.tsx',
  'app/admin/supervisor-performance/page.tsx',
  'app/dashboard/page.tsx',
  'app/admin/performance/page.tsx',
  'app/admin/equipment-limits/page.tsx',
  'app/admin/debug/page.tsx',
  'app/admin/equipment-requests/page.tsx',
  'app/admin/equipment-pricing/page.tsx',
  'app/admin/salary-config/page.tsx',
  'app/admin/sync/page.tsx',
];

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('usePageNotify')) {
    if (s.includes("from '@tanstack/react-query'")) {
      s = s.replace(
        "from '@tanstack/react-query'",
        "from '@tanstack/react-query'\nimport { usePageNotify } from '@/lib/usePageNotify'"
      );
    } else if (s.includes("from 'react'")) {
      s = s.replace(
        "from 'react'",
        "from 'react'\nimport { usePageNotify } from '@/lib/usePageNotify'"
      );
    }
  }
  if (!s.includes('const notify = usePageNotify()')) {
    s = s.replace(/export default function \w+\(\) \{/, (m) => `${m}\n  const notify = usePageNotify();`);
  }
  s = s.replace(/alert\('✅([^']*)'\)/g, "notify.success('$1')");
  s = s.replace(/alert\(`✅([^`]*)`\)/g, 'notify.success(`$1`)');
  s = s.replace(/alert\('❌([^']*)'\)/g, "notify.error('$1')");
  s = s.replace(/alert\(`❌([^`]*)`\)/g, 'notify.error(`$1`)');
  fs.writeFileSync(f, s);
  console.log('updated', f);
}
