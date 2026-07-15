import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllRiders, getAllSupervisors } from '@/lib/adminService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MissingDataRider = {
  code: string;
  name: string;
  issues: string[];
  supervisorCode?: string;
  supervisorName?: string;
  region?: string;
  joinDate?: string;
  status?: string;
};

export async function GET(request: NextRequest) {
  console.log('[GET /api/admin/missing-data-audit] Start');
  
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      console.log('[GET /api/admin/missing-data-audit] No token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      console.log('[GET /api/admin/missing-data-audit] Not admin:', decoded?.role);
      return NextResponse.json({ error: 'Forbidden - Admins only' }, { status: 403 });
    }

    console.log('[GET /api/admin/missing-data-audit] Loading riders and supervisors...');
    
    // Load all riders and supervisors
    const [riders, supervisors] = await Promise.all([
      getAllRiders(false),
      getAllSupervisors(false),
    ]);

    console.log('[GET /api/admin/missing-data-audit] Loaded:', {
      ridersCount: riders.length,
      supervisorsCount: supervisors.length,
    });

    const ridersWithIssues: MissingDataRider[] = [];

    // Check each rider for missing data
    for (const rider of riders) {
      const issues: string[] = [];

      // Check supervisor
      if (!rider.supervisorCode || String(rider.supervisorCode).trim() === '') {
        issues.push('لا يوجد مشرف مسجل');
      }

      // Check region
      if (!rider.region || String(rider.region).trim() === '') {
        issues.push('لا توجد منطقة محددة');
      }

      // Check join date
      if (!rider.joinDate || String(rider.joinDate).trim() === '') {
        issues.push('لا يوجد تاريخ انضمام');
      }

      // Check name
      if (!rider.name || String(rider.name).trim() === '') {
        issues.push('لا يوجد اسم');
      }

      // If there are issues, add to list
      if (issues.length > 0) {
        ridersWithIssues.push({
          code: rider.code || 'غير محدد',
          name: rider.name || 'غير محدد',
          supervisorCode: rider.supervisorCode,
          supervisorName: rider.supervisorName,
          region: rider.region,
          joinDate: rider.joinDate,
          status: rider.status,
          issues,
        });
      }
    }

    // Calculate summary
    const summary = {
      totalRiders: riders.length,
      ridersWithIssues: ridersWithIssues.length,
      completenessPercent: riders.length > 0 
        ? Math.round(((riders.length - ridersWithIssues.length) / riders.length) * 100)
        : 100,
      issueBreakdown: {
        missingSupervisor: ridersWithIssues.filter((r) => r.issues.includes('لا يوجد مشرف مسجل')).length,
        missingRegion: ridersWithIssues.filter((r) => r.issues.includes('لا توجد منطقة محددة')).length,
        missingJoinDate: ridersWithIssues.filter((r) => r.issues.includes('لا يوجد تاريخ انضمام')).length,
        missingName: ridersWithIssues.filter((r) => r.issues.includes('لا يوجد اسم')).length,
      },
    };

    console.log('[GET /api/admin/missing-data-audit] Summary:', summary);

    return NextResponse.json({
      summary,
      riders: ridersWithIssues,
    });
  } catch (error) {
    console.error('[GET /api/admin/missing-data-audit] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
