import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllSupervisors, addSupervisor, updateSupervisor, deleteSupervisor } from '@/lib/adminService';

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

    // Force fresh data by clearing cache first if requested
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    
    if (forceRefresh) {
      const { cache, CACHE_KEYS } = await import('@/lib/cache');
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.sheetData('المشرفين'));
    }

    // Always use fresh data (no cache) to ensure we get the latest supervisors
    const supervisors = await getAllSupervisors(false); // Always fetch fresh data
    console.log(`[GET /api/admin/supervisors] Returning ${supervisors.length} supervisors`);
    console.log(`[GET /api/admin/supervisors] Supervisor codes:`, supervisors.map(s => s.code));

    return NextResponse.json({ success: true, data: supervisors });
  } catch (error: any) {
    console.error(`[GET /api/admin/supervisors] Error:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
    console.log(`[POST /api/admin/supervisors] Adding supervisor:`, body);
    const result = await addSupervisor(body);
    console.log(`[POST /api/admin/supervisors] Result:`, result);

    if (result.success) {
      // Clear cache to ensure fresh data on next GET
      const { cache, CACHE_KEYS } = await import('@/lib/cache');
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.sheetData('المشرفين'));
      
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
    const { code, ...updates } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }

    const result = await updateSupervisor(code, updates);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }

    const result = await deleteSupervisor(code);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

