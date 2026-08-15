/** Diagnose Opening:877614 raw columns (read-only). */
import fs from 'node:fs';
import path from 'node:path';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const { getSheetData } = await import('@/lib/googleSheets');
  const {
    SHEET_EQUIPMENT_LIABILITY,
    EQUIPMENT_LIABILITY_HEADERS,
  } = await import('@/lib/equipmentLiability/constants');

  const narrow = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const wide = await getSheetData(
    SHEET_EQUIPMENT_LIABILITY,
    false,
    `${SHEET_EQUIPMENT_LIABILITY}!A:AZ`
  );

  console.log('NARROW_HEADER_LEN', (narrow[0] || []).length);
  console.log('WIDE_HEADER_LEN', (wide[0] || []).length);
  console.log('EXPECTED_HEADERS', EQUIPMENT_LIABILITY_HEADERS.length);
  console.log('WIDE_HEADERS_TAIL', (wide[0] || []).slice(24));

  const idx = wide.findIndex(
    (r, i) =>
      i > 0 &&
      (String(r[19] || '') === 'OPENING:877614' ||
        String(r[0] || '').startsWith('opening_877614'))
  );
  console.log('ROW_IDX', idx);
  if (idx > 0) {
    const r = wide[idx];
    console.log('ROW_LEN', r.length);
    for (let i = 24; i < Math.max(r.length, EQUIPMENT_LIABILITY_HEADERS.length); i++) {
      console.log(i, EQUIPMENT_LIABILITY_HEADERS[i] || '?', JSON.stringify(r[i]));
    }
    console.log('CORE', {
      id: r[0],
      rider: r[1],
      original: r[14],
      outstanding: r[15],
      amountDeducted: r[16],
      status: r[18],
      deliveryRowRef: r[19],
      settlementPaid: r[26],
      pricingSource: r[27],
      snapMoto: r[29],
      snapBike: r[30],
      snapShirt: r[31],
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
