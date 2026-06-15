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

const patterns = [
  [/const token = request\.headers\.get\('authorization'\)\?\.replace\('Bearer ', ''\)\.trim\(\);/g, 'const token = extractBearerToken(request);'],
  [/const token = request\.headers\.get\('authorization'\)\?\.replace\('Bearer ', ''\);/g, 'const token = extractBearerToken(request);'],
  [/const token = request\.headers\.get\("authorization"\)\?\.replace\('Bearer ', ''\)\.trim\(\);/g, 'const token = extractBearerToken(request);'],
  [/const token = request\.headers\.get\("authorization"\)\?\.replace\('Bearer ', ''\);/g, 'const token = extractBearerToken(request);'],
];

let updated = 0;
for (const file of walk('app/api')) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes("headers.get('authorization')") && !src.includes('headers.get("authorization")')) continue;
  const orig = src;
  for (const [re, rep] of patterns) src = src.replace(re, rep);
  if (src === orig) continue;
  if (!src.includes('extractBearerToken')) {
    if (src.includes("from '@/lib/requestAuth'")) {
      src = src.replace(/import \{([^}]*)\} from '@\/lib\/requestAuth';/, (m, g1) => {
        if (g1.includes('extractBearerToken')) return m;
        const inner = g1.trim();
        return `import { ${inner}${inner ? ', ' : ''}extractBearerToken } from '@/lib/requestAuth';`;
      });
    } else {
      const importLine = "import { extractBearerToken } from '@/lib/requestAuth';\n";
      const idx = src.indexOf('import ');
      if (idx >= 0) {
        const end = src.indexOf('\n', idx);
        src = src.slice(0, end + 1) + importLine + src.slice(end + 1);
      } else {
        src = importLine + src;
      }
    }
  }
  fs.writeFileSync(file, src);
  updated++;
}
console.log('Updated', updated, 'files');
