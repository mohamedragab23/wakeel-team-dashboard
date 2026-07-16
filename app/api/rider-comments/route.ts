import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { addRiderComment, getSupervisorComments, getRiderComments, getAllComments } from '@/lib/riderComments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const riderCode = searchParams.get('riderCode');
    const supervisorCode = searchParams.get('supervisorCode');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // If admin requesting specific rider
    if (riderCode) {
      const comments = await getRiderComments(riderCode, startDate || undefined, endDate || undefined);
      return NextResponse.json({ comments });
    }

    // If supervisor, get their comments
    if (decoded.role === 'supervisor') {
      const comments = await getSupervisorComments(
        decoded.code || '',
        startDate || undefined,
        endDate || undefined
      );
      return NextResponse.json({ comments });
    }

    // If admin requesting supervisor's comments
    if (decoded.role === 'admin' && supervisorCode) {
      const comments = await getSupervisorComments(
        supervisorCode,
        startDate || undefined,
        endDate || undefined
      );
      return NextResponse.json({ comments });
    }

    // If admin without filters, get ALL comments
    if (decoded.role === 'admin') {
      const comments = await getAllComments(startDate || undefined, endDate || undefined);
      return NextResponse.json({ comments });
    }

    return NextResponse.json({ comments: [] });
  } catch (error) {
    console.error('[GET /api/rider-comments] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      console.error('[POST /api/rider-comments] No token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      console.error('[POST /api/rider-comments] Invalid token');
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    console.log('[POST /api/rider-comments] User:', decoded.code, decoded.role);

    // Only supervisors and admins can add comments
    if (decoded.role !== 'supervisor' && decoded.role !== 'admin') {
      console.error('[POST /api/rider-comments] Forbidden role:', decoded.role);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      riderCode,
      riderName,
      date,
      category,
      expectedReturnDate,
      estimatedReturnDays,
      notes,
    } = body;

    console.log('[POST /api/rider-comments] Data:', { riderCode, riderName, date, category });

    // Validation
    if (!riderCode || !riderName || !date || !category) {
      console.error('[POST /api/rider-comments] Missing fields:', { riderCode, riderName, date, category });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await addRiderComment({
      riderCode,
      riderName,
      supervisorCode: decoded.code || '',
      supervisorName: decoded.name || '',
      date,
      category,
      expectedReturnDate,
      estimatedReturnDays,
      notes: notes || '',
    });

    if (!result.success) {
      console.error('[POST /api/rider-comments] Failed:', result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to add comment' },
        { status: 500 }
      );
    }

    console.log('[POST /api/rider-comments] Success!');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/rider-comments] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
