import { dueJobs } from '../../lib/netlifyJobs';

// UTC; Netlify invokes scheduled functions only on the published production deploy.
export const config = { schedule: '0 3 * * *' };

export default async () => {
  const secret = process.env.CRON_SECRET?.trim();
  const origin = process.env.URL;
  if (!secret || !origin) throw new Error('Missing scheduler configuration');
  const now = new Date();
  const results = await Promise.all(dueJobs(now).map(async job => {
    const response = await fetch(new URL('/.netlify/functions/sync-worker-background', origin), {
      method: 'POST',
      headers: { 'x-cron-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({ job }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status !== 202) throw new Error(`Dispatch failed: ${job} (${response.status})`);
    return job;
  }));
  console.info('sync_dispatch_accepted', { jobs: results });
  return new Response(null, { status: 204 });
};
