/**
 * Orchestrate daily read-only backups (Sheets + Neon inventory + R2 inventory).
 * No writes to Sheets, Neon data, or R2 objects.
 */
import { spawn } from 'child_process';

type StepResult = { step: string; ok: boolean; code: number | null };

function runScript(script: string): Promise<StepResult> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['--yes', 'tsx', script], {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve({ step: script, ok: code === 0, code }));
    child.on('error', () => resolve({ step: script, ok: false, code: null }));
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[run-daily-backups] Started ${startedAt}`);

  const results: StepResult[] = [];
  results.push(await runScript('scripts/backup-sheets.ts'));
  results.push(await runScript('scripts/backup-neon.ts'));
  results.push(await runScript('scripts/backup-r2.ts'));

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    readOnly: true,
    results,
    allOk: results.every((r) => r.ok),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.allOk) process.exit(1);
}

main().catch((e) => {
  console.error('[run-daily-backups] failed:', e);
  process.exit(1);
});
