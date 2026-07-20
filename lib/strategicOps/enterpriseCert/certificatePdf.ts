/**
 * SRS-009 — PDF / printable Enterprise Certificate (server-safe HTML).
 */

import type { EnterpriseCertificate } from './types';

export function buildEnterpriseCertificateHtml(cert: EnterpriseCertificate): string {
  const rows = cert.levels
    .map(
      (l) =>
        `<tr>
          <td>L${l.rank}</td>
          <td>${l.titleEn}</td>
          <td>${l.passed ? 'PASS' : 'FAIL'}</td>
          <td>${l.score}%</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8"/>
  <title>Enterprise Production Certificate</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 40px auto; color: #111; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    .meta { color: #444; font-size: 14px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 8px 16px; border: 2px solid #111; font-weight: bold; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f4f4f4; }
    pre { white-space: pre-wrap; background: #fafafa; padding: 16px; border: 1px solid #ddd; font-size: 12px; }
    .verdict { font-size: 22px; font-weight: bold; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <h1>Enterprise Production Certificate</h1>
  <p class="meta">Strategic Operations Dashboard</p>
  <div class="badge">${cert.tier.replace(/_/g, ' ').toUpperCase()}</div>
  <p class="verdict">Verdict: ${cert.verdict} · Production Ready: ${cert.productionReady ? 'YES' : 'NO'}</p>
  <p>Version: ${cert.buildVersion} · Commit: ${cert.gitCommit}</p>
  <p>Enterprise Score: ${cert.enterpriseScore}%</p>
  <p>Operational Cases: ${cert.opsCasesPassed} / ${cert.opsCasesTotal}</p>
  <p>KPI Checks: ${cert.kpiChecksPassed} / ${cert.kpiChecksTotal}</p>
  <p>Issued: ${new Date(cert.lastVerifiedAt).toUTCString()}</p>
  <table>
    <thead><tr><th>Level</th><th>Name</th><th>Status</th><th>Score</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Certificate Text</h2>
  <pre>${cert.certificateText.replace(/</g, '&lt;')}</pre>
  <p style="margin-top:24px;font-size:12px;color:#666">${cert.noteAr}</p>
</body>
</html>`;
}
