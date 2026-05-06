/**
 * تشغيل من جذر المشروع:
 *   npm run ensure-equipment-sheets
 * يحمّل .env.local / .env وينشئ تبويبات المعدات عبر Google Sheets API.
 */
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const { ensureAllEquipmentSheets } = await import('../lib/ensureEquipmentSheets');
  const result = await ensureAllEquipmentSheets();
  console.log('تم تهيئة التبويبات التالية:');
  for (const name of result.ensured) {
    console.log('  -', name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
