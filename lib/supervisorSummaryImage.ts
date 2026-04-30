import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { SupervisorShiftSummary } from '@/lib/supervisorNotifier';
import fs from 'node:fs';
import path from 'node:path';

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

function renderFallbackLatinPng(params: {
  title: string;
  date: string;
  cityLabel: string;
  rows: SupervisorShiftSummary[];
}): Uint8Array {
  const { title, date, cityLabel, rows } = params;
  const fontDir = path.join(process.cwd(), 'lib', 'fonts');
  const fontRegularPath = path.join(fontDir, 'NotoNaskhArabic-Regular.ttf');
  const fontBoldPath = path.join(fontDir, 'NotoNaskhArabic-Bold.ttf');
  const width = 1400;
  const pad = 28;
  const headerH = 58;
  const rowH = 48;

  const cols: Array<{ key: string; label: string; w: number; align: 'start' | 'end' }> = [
    { key: 'supervisor', label: 'Supervisor', w: 360, align: 'start' },
    { key: 'date', label: 'Date', w: 150, align: 'end' },
    { key: 'total', label: 'Total', w: 110, align: 'end' },
    { key: 'booked', label: 'Booked', w: 110, align: 'end' },
    { key: 'notBooked', label: 'Not booked', w: 130, align: 'end' },
    { key: 'pct', label: 'Booked %', w: 140, align: 'end' },
    { key: 'hours', label: 'Booked hours', w: 200, align: 'end' },
  ];

  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const height = 200 + headerH + rows.length * rowH;

  const headerCells = (() => {
    let x = pad;
    return cols
      .map((c) => {
        const cx = x;
        x += c.w;
        const tx = c.align === 'start' ? cx + 16 : cx + c.w - 16;
        const anchor = c.align === 'start' ? 'start' : 'end';
        return `<text x="${tx}" y="${200 - 40}" fill="#EAF0FF" font-size="16" font-weight="700" text-anchor="${anchor}">${esc(
          c.label
        )}</text>
<line x1="${cx}" y1="200" x2="${cx}" y2="${200 + headerH + rows.length * rowH}" stroke="rgba(255,255,255,0.06)" />`;
      })
      .join('\n');
  })();

  const rowCells = rows
    .map((r, i) => {
      const y = 200 + headerH + i * rowH;
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
          const tx = c.align === 'start' ? cx + 16 : cx + c.w - 16;
          const anchor = c.align === 'start' ? 'start' : 'end';
          const color = c.key === 'pct' ? '#66E3FF' : '#D7E2FF';
          return `<text x="${tx}" y="${y + 32}" fill="${color}" font-size="15" font-weight="500" text-anchor="${anchor}">${values[c.key] ?? ''}</text>`;
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

  <text x="${pad}" y="46" fill="#EAF0FF" font-size="22" font-weight="800">${esc(title)}</text>
  <text x="${pad}" y="78" fill="rgba(234,240,255,0.75)" font-size="14" font-weight="500">${esc(
    `City: ${cityLabel} — Date: ${date}`
  )}</text>

  <rect x="${pad}" y="200" width="${tableW}" height="${headerH + rows.length * rowH}" rx="14" ry="14" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.10)" />
  <rect x="${pad}" y="200" width="${tableW}" height="${headerH}" rx="14" ry="14" fill="rgba(20,24,35,0.85)" />
  ${headerCells}
  <line x1="${pad}" y1="${200 + headerH}" x2="${pad + tableW}" y2="${200 + headerH}" stroke="rgba(255,255,255,0.10)" />
  ${rowCells}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'transparent',
    font: {
      loadSystemFonts: false,
      fontFiles: [fontRegularPath, fontBoldPath],
      defaultFontFamily: 'NotoNaskhArabic',
    },
  });
  return resvg.render().asPng();
}

export async function renderSupervisorSummaryPng(params: {
  title: string;
  date: string;
  cityLabel: string;
  rows: SupervisorShiftSummary[];
}): Promise<Uint8Array> {
  const { title, date, cityLabel, rows } = params;

  // Embed Arabic fonts (best effort). If Arabic shaping isn't supported in the renderer runtime,
  // we fall back to a Latin table to avoid sending an empty image.
  const fontDir = path.join(process.cwd(), 'lib', 'fonts');
  const fontRegularPath = path.join(fontDir, 'NotoNaskhArabic-Regular.ttf');
  const fontBoldPath = path.join(fontDir, 'NotoNaskhArabic-Bold.ttf');
  const regularTtf = fs.readFileSync(path.join(fontDir, 'NotoNaskhArabic-Regular.ttf'));
  const boldTtf = fs.readFileSync(path.join(fontDir, 'NotoNaskhArabic-Bold.ttf'));

  const width = 1400;
  const pad = 28;
  const headerH = 58;
  const rowH = 48;

  const columns: Array<{ key: keyof SupervisorShiftSummary | 'date' | 'pct'; label: string; w: number }> = [
    { key: 'supervisor', label: 'المشرف', w: 360 },
    { key: 'date', label: 'التاريخ', w: 150 },
    { key: 'total', label: 'الإجمالي', w: 110 },
    { key: 'booked', label: 'الحاجزين', w: 110 },
    { key: 'notBooked', label: 'غير الحاجزين', w: 130 },
    { key: 'pct', label: 'نسبة الحاجزين', w: 140 },
    { key: 'totalBookedHours', label: 'إجمالي ساعات الحاجزين', w: 200 },
  ];

  const tableW = columns.reduce((s, c) => s + c.w, 0);

  // Build a React-like tree for satori (no JSX required).
  const el: any = {
    type: 'div',
    props: {
      style: {
        width,
        height: 200 + headerH + rows.length * rowH,
        padding: pad,
        background: 'linear-gradient(135deg, #0B0F19 0%, #0F1628 55%, #0A1020 100%)',
        color: '#EAF0FF',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        direction: 'rtl',
        fontFamily: 'NotoNaskhArabic',
      },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 28, fontWeight: 700, lineHeight: 1.2 },
            children: title,
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize: 16, opacity: 0.8 },
            children: `المحافظة/المدينة: ${cityLabel}`,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              width: tableW,
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.28)',
            },
            children: [
              // Header
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    height: headerH,
                    background: 'rgba(20,24,35,0.85)',
                    borderBottom: '1px solid rgba(255,255,255,0.12)',
                  },
                  children: columns.map((c) => ({
                    type: 'div',
                    props: {
                      style: {
                        width: c.w,
                        padding: '0 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: c.key === 'supervisor' ? 'flex-start' : 'flex-end',
                        fontSize: 16,
                        fontWeight: 700,
                      },
                      children: c.label,
                    },
                  })),
                },
              },
              // Rows
              ...rows.map((r, idx) => ({
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    height: rowH,
                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  },
                  children: columns.map((c) => {
                    let v: any = '';
                    if (c.key === 'date') v = date;
                    else if (c.key === 'pct') v = fmtPct(r.pct);
                    else if (c.key === 'totalBookedHours') v = fmtNum(Number(r.totalBookedHours || 0));
                    else v = (r as any)[c.key] ?? '';

                    const color = c.key === 'pct' ? '#66E3FF' : 'rgba(215,226,255,0.95)';
                    return {
                      type: 'div',
                      props: {
                        style: {
                          width: c.w,
                          padding: '0 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: c.key === 'supervisor' ? 'flex-start' : 'flex-end',
                          fontSize: 15,
                          fontWeight: 500,
                          color,
                        },
                        children: String(v),
                      },
                    };
                  }),
                },
              })),
            ],
          },
        },
      ],
    },
  };

  try {
    const svg = await satori(el, {
      width,
      height: 200 + headerH + rows.length * rowH,
      fonts: [
        { name: 'NotoNaskhArabic', data: regularTtf, weight: 400, style: 'normal' },
        { name: 'NotoNaskhArabic', data: boldTtf, weight: 700, style: 'normal' },
      ],
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      background: 'transparent',
      font: {
        loadSystemFonts: false,
        fontFiles: [fontRegularPath, fontBoldPath],
        defaultFontFamily: 'NotoNaskhArabic',
      },
    });

    return resvg.render().asPng();
  } catch (e) {
    console.warn('[supervisorSummaryImage] Arabic render failed, using Latin fallback:', (e as any)?.message || e);
    return renderFallbackLatinPng({ title, date, cityLabel, rows });
  }
}

