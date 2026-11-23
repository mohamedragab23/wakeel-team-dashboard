import { authorized, jobNames, type JobName } from '../../lib/netlifyJobs';
import { redisDel, redisSet, redisSetNxDetailed } from '../../lib/upstashRest';
import { runRoosterLiveSync } from '../../lib/roosterLive/syncService';
import { runDailyPerformanceSync } from '../../lib/performanceSyncService';
import { runDailyBackups } from '../../lib/backup/dailyBackupService';
import { ROOSTER_AUTO_SYNC_PAUSED } from '../../lib/roosterLive/autoSyncPause';

export default async (request: Request) => {
  if (request.method !== 'POST' || !authorized(request)) return;
  const body = await request.json() as { job?: JobName };
  const job = body.job;
  if (!job || !jobNames.includes(job)) return;
  if ((job === 'live-sync' || job === 'performance-sync') && ROOSTER_AUTO_SYNC_PAUSED) return;
  const lock = `netlify:jobs:lock:${job}`;
  // Longer than the platform's 15 minute limit; fails closed if Redis is unavailable.
  const acquired = await redisSetNxDetailed(lock, 'running', 960);
  if (acquired === 'busy') return;
  if (acquired !== 'acquired') throw new Error('Job lock unavailable');
  const startedAt = new Date().toISOString();
  try {
    if (job === 'live-sync') {
      const result = await runRoosterLiveSync();
      if (!result.success) throw new Error('Live sync failed');
    } else if (job === 'performance-sync') {
      const result = await runDailyPerformanceSync();
      if ([result.yesterday, ...result.backlog].some(item => item.status === 'failed')) {
        throw new Error('Performance sync failed');
      }
    } else {
      const result = await runDailyBackups({ uploadToR2: true });
      if (!result.allOk) throw new Error('Backup incomplete');
    }
    await redisSet(`netlify:jobs:last:${job}`, JSON.stringify({ status: 'ok', startedAt, finishedAt: new Date().toISOString() }), 604800);
    console.info('scheduled_job_completed', { job });
  } catch {
    await redisSet(`netlify:jobs:last:${job}`, JSON.stringify({ status: 'failed', startedAt, finishedAt: new Date().toISOString() }), 604800);
    // Do not emit provider responses or credentials, and never send notifications.
    throw new Error(`Scheduled job failed: ${job}`);
  } finally {
    await redisDel(lock);
  }
};
