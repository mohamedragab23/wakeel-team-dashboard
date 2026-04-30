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

export async function renderSupervisorSummaryPng(params: {
  title: string;
  date: string;
  cityLabel: string;
  rows: SupervisorShiftSummary[];
}): Promise<Uint8Array> {
  const { title, date, cityLabel, rows } = params;

  // Embed Arabic fonts to ensure text renders on Vercel (no system fonts).
  const fontDir = path.join(process.cwd(), 'lib', 'fonts');
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
  });

  const rendered = resvg.render();
  return rendered.asPng();
}

