/**
 * Admin Riders API - Read from Google Sheets (Server-side)
 * IndexedDB is for client-side caching only
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllRiders, addRider, updateRider, deleteRider } from '@/lib/adminService';

export const dynamic = 'force-dynamic';

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

    // Get all riders from Google Sheets (server-side compatible)
    // Check if refresh is requested (bypass cache)
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const riders = await getAllRiders(refresh);

    return NextResponse.json({
      success: true,
      data: riders,
    });
  } catch (error: any) {
    console.error('Get riders error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

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
    const { code, name, region, supervisorCode, phone } = body;

    if (!code || !name || !supervisorCode) {
      return NextResponse.json({ success: false, error: 'الكود والاسم وكود المشرف مطلوبة' }, { status: 400 });
    }

    // Check for duplicate rider code
    const existingRiders = await getAllRiders();
    if (existingRiders.some((r: any) => r.code === code)) {
      return NextResponse.json({ success: false, error: 'كود المندوب موجود بالفعل' }, { status: 400 });
    }

    // Add rider to Google Sheets
    await addRider({
      code,
      name,
      region: region || '',
      supervisorCode,
      phone: phone || '',
    });

    return NextResponse.json({
      success: true,
      message: 'تم إضافة المندوب بنجاح',
    });
  } catch (error: any) {
    console.error('Add rider error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
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
    const { code, supervisorCode, name, region, phone, status } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'كود المندوب مطلوب' }, { status: 400 });
    }

    const result = await updateRider(code, {
      supervisorCode,
      name,
      region,
      phone,
      status,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث المندوب بنجاح',
    });
  } catch (error: any) {
    console.error('Update rider error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ success: false, error: 'كود المندوب مطلوب' }, { status: 400 });
    }

    const result = await deleteRider(code);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إزالة تعيين المندوب بنجاح',
    });
  } catch (error: any) {
    console.error('Delete rider error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
