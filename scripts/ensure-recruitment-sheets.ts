/**
 * تهيئة تبويبات Google Sheets لنظام التعيين
 * التشغيل: npx tsx scripts/ensure-recruitment-sheets.ts
 */
import 'dotenv/config';
import { ensureAllRecruitmentSheets } from '../lib/recruitment/recruitmentService';

async function main() {
  console.log('جاري تهيئة شيتات التعيين...');
  const ensured = await ensureAllRecruitmentSheets();
  console.log('تم بنجاح:', ensured.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
