import fs from 'fs';

function patchAdmin() {
  const p = 'app/admin/riders/page.tsx';
  let s = fs.readFileSync(p, 'utf8');
  const cols = [
    'code',
    'name',
    'supervisor',
    'region',
    'date',
    'workDays',
    'hours',
    'break',
    'delay',
    'absence',
    'orders',
    'acceptance',
    'debt',
  ];
  for (const c of cols) {
    const needle = `isOpen={perfOpenMenu === '${c}'}`;
    if (s.includes(`valueOptions={perfValueOptions.${c}}`)) continue;
    s = s.replace(needle, `valueOptions={perfValueOptions.${c}}\n                        ${needle}`);
  }
  fs.writeFileSync(p, s);
  console.log('admin riders patched');
}

function patchSupervisor() {
  const p = 'app/riders/page.tsx';
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('collectRiderColumnValues')) {
    s = s.replace(
      "} from '@/lib/ridersTableFilter';",
      "} from '@/lib/ridersTableFilter';\nimport { collectRiderColumnValues } from '@/lib/ridersTableColumnValues';"
    );
  }
  if (!s.includes('riderValueOptions')) {
    s = s.replace(
      '  const columnFilteredRiders = useMemo(\n    () => applyRiderTableFilters(visibleRiders, filters, sort),\n    [visibleRiders, filters, sort]\n  );',
      `  const riderValueOptions = useMemo(() => {
    const cols = ['code', 'name', 'date', 'workDays', 'hours', 'break', 'delay', 'orders', 'acceptance', 'debt', 'absence'] as const;
    return Object.fromEntries(cols.map((c) => [c, collectRiderColumnValues(visibleRiders, c)])) as Record<(typeof cols)[number], string[]>;
  }, [visibleRiders]);

  const columnFilteredRiders = useMemo(
    () => applyRiderTableFilters(visibleRiders, filters, sort),
    [visibleRiders, filters, sort]
  );`
    );
  }
  const cols = ['code', 'name', 'date', 'workDays', 'hours', 'break', 'delay', 'orders', 'acceptance', 'debt', 'absence'];
  for (const c of cols) {
    const needle = `isOpen={openMenu === '${c}'}`;
    if (s.includes(`valueOptions={riderValueOptions.${c}}`)) continue;
    s = s.replace(needle, `valueOptions={riderValueOptions.${c}}\n                        ${needle}`);
  }
  s = s.replaceAll('flex items-end justify-end gap-1.5', 'flex items-center justify-end gap-1');
  s = s.replaceAll('<span className="pb-0.5">', '<span>');
  fs.writeFileSync(p, s);
  console.log('riders page patched');
}

patchAdmin();
patchSupervisor();
