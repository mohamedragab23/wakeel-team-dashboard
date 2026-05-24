/**
 * بيانات وهمية لتجربة نظام التعيين
 * التشغيل: npx tsx scripts/seed-recruitment-data.ts
 */
import 'dotenv/config';
import { ensureAllRecruitmentSheets, createCandidate, updateCandidate } from '../lib/recruitment/recruitmentService';

const SEED_USER = 'seed_script';

async function main() {
  console.log('تهيئة الشيتات...');
  await ensureAllRecruitmentSheets();

  const samples = [
    { fullName: 'أحمد محمد', phone: '01011111101', jobAd: 'سائق توصيل - القاهرة' },
    { fullName: 'سارة علي', phone: '01011111102', jobAd: 'سائق توصيل - الجيزة' },
    { fullName: 'محمود حسن', phone: '01011111103', jobAd: 'مندوب - الإسكندرية' },
    { fullName: 'فاطمة إبراهيم', phone: '01011111104', jobAd: 'سائق توصيل - القاهرة' },
    { fullName: 'يوسف كريم', phone: '01011111105', jobAd: 'سائق توصيل - المنصورة' },
  ];

  console.log('إنشاء مرشحين نشطين...');
  for (const s of samples) {
    await createCandidate(s, SEED_USER, 'سكريبت تجريبي', { skipNotification: true });
  }

  const archived = await createCandidate(
    { fullName: 'مرشح مرفوض', phone: '01099999901', jobAd: 'تجريبي' },
    SEED_USER,
    'سكريبت',
    { skipNotification: true }
  );
  await updateCandidate(
    archived.id,
    { activationStatus: 'مرفوض', pipelineStatus: 'archived', previousEndDate: '2025-01-15' },
    { code: SEED_USER, name: 'سكريبت' },
    { logActivity: false }
  );

  await createCandidate(
    { fullName: 'مرشح قديم', phone: '01099999902', jobAd: 'نظام سابق', isLegacy: true },
    SEED_USER,
    'سكريبت',
    { skipNotification: true, isLegacy: true }
  );

  console.log('تم إنشاء', samples.length + 2, 'مرشح تقريباً (+ مرفوض في الأرشيف)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
