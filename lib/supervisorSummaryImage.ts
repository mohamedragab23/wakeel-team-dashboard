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

  <text x="${pad}" y="46" fill="#EAF0FF" font-size="22" font-weight="800" font-family="Arial, sans-serif">${esc(title)}</text>
  <text x="${pad}" y="78" fill="rgba(234,240,255,0.75)" font-size="14" font-weight="500" font-family="Arial, sans-serif">${esc(
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
      loadSystemFonts: true,
      defaultFontFamily: 'Arial',
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

  // The user accepts English output. Use system fonts to guarantee Latin text renders reliably on Vercel.
  return renderFallbackLatinPng({ title, date, cityLabel, rows });
}

