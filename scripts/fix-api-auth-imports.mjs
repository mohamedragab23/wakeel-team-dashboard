import fs from 'fs';
import path from 'path';

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith('.ts')) files.push(p);
  }
  return files;
}

let fixed = 0;
for (const file of walk('app/api')) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('extractBearerToken(request)')) continue;
  if (src.includes("from '@/lib/requestAuth'")) continue;

  const importLine = "import { extractBearerToken } from '@/lib/requestAuth';\n";
  const idx = src.indexOf('import ');
  if (idx >= 0) {
    const end = src.indexOf('\n', idx);
    src = src.slice(0, end + 1) + importLine + src.slice(end + 1);
  } else {
    src = importLine + src;
  }
  fs.writeFileSync(file, src);
  fixed++;
}
console.log('Fixed imports in', fixed, 'files');
