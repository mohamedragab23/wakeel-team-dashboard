import { NextRequest, NextResponse } from 'next/server';
import { requireStrategicOpsAdmin } from '@/lib/strategicOps/apiAuth';
import {
  buildEnterpriseCertificateHtml,
  evaluateDeployGates,
  runEnterpriseCertification,
} from '@/lib/strategicOps/enterpriseCert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const auth = requireStrategicOpsAdmin(request, 'enterprise-cert');
    if (!auth.ok) return auth.response;

    const format = request.nextUrl.searchParams.get('format');
    const gatesOnly = request.nextUrl.searchParams.get('gates') === '1';

    if (gatesOnly) {
      const g = evaluateDeployGates();
      return NextResponse.json({
        success: true,
        data: {
          allowDeploy: g.allowDeploy,
          failedGates: g.failedGates,
          verdict: g.report.certificate.verdict,
          productionReady: g.report.certificate.productionReady,
          tier: g.report.certificate.tier,
          enterpriseScore: g.report.certificate.enterpriseScore,
        },
      });
    }

    const report = runEnterpriseCertification();

    if (format === 'html' || format === 'pdf') {
      const html = buildEnterpriseCertificateHtml(report.certificate);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition':
            format === 'pdf'
              ? 'inline; filename="enterprise-production-certificate.html"'
              : 'inline',
        },
      });
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error: unknown) {
    console.error('[Enterprise Cert]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
