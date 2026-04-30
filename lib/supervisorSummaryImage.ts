import { Resvg } from '@resvg/resvg-js';
import type { SupervisorShiftSummary } from '@/lib/supervisorNotifier';

function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtPct(n: number) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function fmtNum(n: number) {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

export function renderSupervisorSummaryPng(params: {
  title: string;
  date: string;
  cityLabel: string;
  rows: SupervisorShiftSummary[];
}): Uint8Array {
  const { title, date, cityLabel, rows } = params;

  const width = 1400;
  const pad = 28;
  const headerH = 64;
  const rowH = 52;
  const tableTop = 110;
  const tableW = width - pad * 2;
  const height = tableTop + headerH + rows.length * rowH + 40;

  const col = {
    supervisor: 360,
    date: 150,
    total: 110,
    booked: 110,
    notBooked: 130,
    pct: 140,
    hours: 200,
  };

  const cols = [
    { key: 'supervisor', label: 'المشرف', w: col.supervisor, align: 'start' as const },
    { key: 'date', label: 'التاريخ', w: col.date, align: 'middle' as const },
    { key: 'total', label: 'الإجمالي', w: col.total, align: 'end' as const },
    { key: 'booked', label: 'الحاجزين', w: col.booked, align: 'end' as const },
    { key: 'notBooked', label: 'غير الحاجزين', w: col.notBooked, align: 'end' as const },
    { key: 'pct', label: 'نسبة الحاجزين', w: col.pct, align: 'end' as const },
    { key: 'hours', label: 'إجمالي ساعات الحاجزين', w: col.hours, align: 'end' as const },
  ];

  const headerCells = (() => {
    let x = pad;
    return cols
      .map((c) => {
        const cx = x;
        x += c.w;
        const tx = c.align === 'start' ? cx + 16 : c.align === 'middle' ? cx + c.w / 2 : cx + c.w - 16;
        const anchor = c.align === 'start' ? 'start' : c.align === 'middle' ? 'middle' : 'end';
        return `<text x="${tx}" y="${tableTop + 40}" fill="#EAF0FF" font-size="16" font-weight="700" text-anchor="${anchor}" direction="rtl">${esc(
          c.label
        )}</text>
<line x1="${cx}" y1="${tableTop}" x2="${cx}" y2="${tableTop + headerH + rows.length * rowH}" stroke="rgba(255,255,255,0.06)" />`;
      })
      .join('\n');
  })();

  const rowCells = rows
    .map((r, i) => {
      const y = tableTop + headerH + i * rowH;
      const bg = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0)';
      let x = pad;

      const values: Record<string, string> = {
        supervisor: esc(r.supervisor),
        date: esc(date),
        total: esc(String(r.total ?? 0)),
        booked: esc(String(r.booked ?? 0)),
        notBooked: esc(String(r.notBooked ?? 0)),
        pct: esc(fmtPct(r.pct)),
        hours: esc(fmtNum(Number(r.totalBookedHours || 0))),
      };

      const tds = cols
        .map((c) => {
          const cx = x;
          x += c.w;
          const tx = c.align === 'start' ? cx + 16 : c.align === 'middle' ? cx + c.w / 2 : cx + c.w - 16;
          const anchor = c.align === 'start' ? 'start' : c.align === 'middle' ? 'middle' : 'end';
          const color = c.key === 'pct' ? '#66E3FF' : '#D7E2FF';
          return `<text x="${tx}" y="${y + 34}" fill="${color}" font-size="15" font-weight="500" text-anchor="${anchor}" direction="rtl">${
            values[c.key] ?? ''
          }</text>`;
        })
        .join('\n');

      return `<rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}" />
${tds}
<line x1="${pad}" y1="${y + rowH}" x2="${pad + tableW}" y2="${y + rowH}" stroke="rgba(255,255,255,0.06)" />`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0B0F19"/>
      <stop offset="55%" stop-color="#0F1628"/>
      <stop offset="100%" stop-color="#0A1020"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />

  <text x="${pad}" y="46" fill="#EAF0FF" font-size="24" font-weight="800" font-family="Arial, sans-serif" direction="rtl">${esc(
    title
  )}</text>
  <text x="${pad}" y="78" fill="rgba(234,240,255,0.75)" font-size="14" font-weight="500" font-family="Arial, sans-serif" direction="rtl">${esc(
    `المحافظة/المدينة: ${cityLabel}`
  )}</text>

  <rect x="${pad}" y="${tableTop}" width="${tableW}" height="${headerH + rows.length * rowH}" rx="14" ry="14" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.10)" />
  <rect x="${pad}" y="${tableTop}" width="${tableW}" height="${headerH}" rx="14" ry="14" fill="rgba(20,24,35,0.85)" />

  ${headerCells}
  <line x1="${pad}" y1="${tableTop + headerH}" x2="${pad + tableW}" y2="${tableTop + headerH}" stroke="rgba(255,255,255,0.10)" />

  ${rowCells}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'transparent',
  });

  const rendered = resvg.render();
  return rendered.asPng();
}

