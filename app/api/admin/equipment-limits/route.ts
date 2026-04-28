/**
 * إعدادات حدود خصم المعدات للمشرفين
 * كميات المعدات المسموح خصمها لكل مشرف (صناديق دراجات، تيشرتات، قبعات، إلخ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllSupervisors } from '@/lib/adminService';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LIMITS_FILE = path.join(process.cwd(), 'data', 'equipment-limits.json');

export interface SupervisorLimits {
  motorcycleBox: number;
  bicycleBox: number;
  tshirt: number;
  jacket: number;
  helmet: number;
}

const defaultLimits: SupervisorLimits = {
  motorcycleBox: 0,
  bicycleBox: 0,
  tshirt: 0,
  jacket: 0,
  helmet: 0,
};

/** تأكد أن القيم أرقام صحيحة >= 0 (منع NaN أو قيم سالبة من الملف) */
function normalizeLimits(raw: Record<string, unknown> | null): SupervisorLimits {
  if (!raw || typeof raw !== 'object') return { ...defaultLimits };
  return {
    motorcycleBox: Math.max(0, Math.floor(Number((raw as any).motorcycleBox)) || 0),
    bicycleBox: Math.max(0, Math.floor(Number((raw as any).bicycleBox)) || 0),
    tshirt: Math.max(0, Math.floor(Number((raw as any).tshirt)) || 0),
    jacket: Math.max(0, Math.floor(Number((raw as any).jacket)) || 0),
    helmet: Math.max(0, Math.floor(Number((raw as any).helmet)) || 0),
  };
}

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readLimits(): Record<string, SupervisorLimits> {
  try {
    if (fs.existsSync(LIMITS_FILE)) {
      const data = fs.readFileSync(LIMITS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return typeof parsed.limits === 'object' ? parsed.limits : {};
    }
  } catch (e) {
    console.error('[Equipment Limits] Read error:', e);
  }
  return {};
}

function writeLimits(limits: Record<string, SupervisorLimits>): boolean {
  try {
    ensureDataDir();
    fs.writeFileSync(LIMITS_FILE, JSON.stringify({ limits }, null, 2));
    return true;
  } catch (e) {
    console.error('[Equipment Limits] Write error:', e);
    return false;
  }
}

// GET - قائمة المشرفين مع حدود كل مشرف
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const supervisors = await getAllSupervisors(false);
    const stored = readLimits();

    const list = supervisors.map((sup) => ({
      code: sup.code,
      name: sup.name,
      region: sup.region,
      limits: normalizeLimits(stored[sup.code] as any),
    }));

    return NextResponse.json({ success: true, data: { supervisors: list } });
  } catch (error: any) {
    console.error('[Equipment Limits GET]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}

// POST - حفظ حدود خصم المعدات
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const body = await request.json();
    const limits = body.limits as Record<string, Partial<SupervisorLimits>> | undefined;
    if (!limits || typeof limits !== 'object') {
      return NextResponse.json({ success: false, error: 'المطلوب: limits ككائن' }, { status: 400 });
    }

    const existing = readLimits();
    const merged: Record<string, SupervisorLimits> = { ...existing };

    for (const [code, val] of Object.entries(limits)) {
      if (!code || typeof val !== 'object') continue;
      const existingNorm = normalizeLimits(existing[code] as any);
      merged[code] = {
        motorcycleBox: Math.max(0, Math.floor(Number(val.motorcycleBox)) || 0),
        bicycleBox: Math.max(0, Math.floor(Number(val.bicycleBox)) || 0),
        tshirt: Math.max(0, Math.floor(Number(val.tshirt)) || 0),
        jacket: Math.max(0, Math.floor(Number(val.jacket)) || 0),
        helmet: Math.max(0, Math.floor(Number(val.helmet)) || 0),
      };
      // إذا لم يرسل العميل حقولاً، احتفظ بالقيم المخزنة
      if (val.motorcycleBox === undefined && val.bicycleBox === undefined && val.tshirt === undefined && val.jacket === undefined && val.helmet === undefined) {
        merged[code] = existingNorm;
      }
    }

    const saved = writeLimits(merged);
    if (!saved) {
      return NextResponse.json({ success: false, error: 'فشل حفظ الإعدادات' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'تم حفظ حدود خصم المعدات بنجاح' });
  } catch (error: any) {
    console.error('[Equipment Limits POST]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
