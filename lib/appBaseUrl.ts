/** Public origin shared by links in notifications and stored attachments. */
export function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || process.env.NEXT_PUBLIC_BASE_URL?.trim()
    || process.env.URL?.trim()
    || process.env.RENDER_EXTERNAL_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Application URL must use HTTP or HTTPS');
    }
    return url.origin;
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`).origin;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL is required in production');
  }
  return 'http://localhost:3000';
}
