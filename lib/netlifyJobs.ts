import { createHash, timingSafeEqual } from 'node:crypto';

export const jobNames = ['live-sync', 'performance-sync', 'daily-backup'] as const;
export type JobName = typeof jobNames[number];

export function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(request.headers.get('authorization') || ''), digest(`Bearer ${secret}`));
}

export function dueJobs(date: Date): JobName[] {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid schedule time');
  const jobs: JobName[] = ['live-sync'];
  if (date.getUTCMinutes() === 0) {
    if (date.getUTCHours() === 3) jobs.push('daily-backup');
    if (date.getUTCHours() === 10) jobs.push('performance-sync');
  }
  return jobs;
}
