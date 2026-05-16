/**
 * Local smoke test: Tableau PAT sign-in + crosstab download (no Google Sheets write).
 * Run: npx tsx scripts/test-tableau-local.ts [YYYY-MM-DD]
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const dateArg = process.argv[2]?.trim();
  const targetDate =
    dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)
      ? dateArg
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          return d.toISOString().slice(0, 10);
        })();

  console.log('=== Tableau local test ===');
  console.log('Target date:', targetDate);
  console.log('PAT name:', process.env.TABLEAU_PAT_NAME ? 'set' : 'MISSING');
  console.log('PAT secret:', process.env.TABLEAU_PAT_SECRET ? 'set' : 'MISSING');

  const { fetchRiderPerformanceCrosstab } = await import('../lib/tableauClient');
  const { parseTableauPerformanceExport, assessTableauPerformanceQuality } = await import(
    '../lib/tableauPerformanceTransform'
  );

  console.log('\n1) Downloading crosstab from Tableau…');
  const { buffer, format } = await fetchRiderPerformanceCrosstab(targetDate, { format: 'excel' });
  console.log(`   OK — ${format}, ${buffer.byteLength} bytes`);

  console.log('\n2) Parsing export…');
  const { rows, warnings } = parseTableauPerformanceExport(buffer, format);
  warnings.forEach((w) => console.log('   warn:', w));
  console.log(`   wakeel riders parsed: ${rows.length}`);

  const sample = rows.filter((r) => r.hours > 0 || r.orders > 0).slice(0, 3);
  if (sample.length) {
    console.log('   sample with data:', JSON.stringify(sample, null, 2));
  }

  const quality = assessTableauPerformanceQuality(rows);
  console.log('\n3) Quality check:', quality.message);
  console.log('   suspicious empty:', quality.isSuspiciousEmpty);
  console.log('   zero ratio:', quality.zeroRatio);

  console.log('\n=== Done — Tableau connection works locally ===');
}

main().catch((e) => {
  console.error('\nFAILED:', e?.message || e);
  process.exit(1);
});
