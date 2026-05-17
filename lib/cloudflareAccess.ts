/**
 * Cloudflare Access service token headers for server-to-server calls
 * (e.g. Vercel → tableau.deliveryhero.net behind Access).
 * @see https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
 */

export function getCloudflareAccessHeaders(): Record<string, string> {
  const clientId =
    process.env.CLOUDFLARE_ACCESS_CLIENT_ID?.trim() || process.env.CF_ACCESS_CLIENT_ID?.trim();
  const clientSecret =
    process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET?.trim() || process.env.CF_ACCESS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return {};
  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  };
}

export function isCloudflareAccessConfigured(): boolean {
  return Object.keys(getCloudflareAccessHeaders()).length === 2;
}

export function cloudflareAccessHintIfHtml(htmlResponse: boolean): string {
  if (!htmlResponse) return '';
  if (isCloudflareAccessConfigured()) {
    return ' — تحقق من صلاحية Service Token أو سياسة Cloudflare Access لـ tableau.deliveryhero.net.';
  }
  return (
    ' — Tableau محمي بـ Cloudflare Access. من Vercel تحتاج CLOUDFLARE_ACCESS_CLIENT_ID و CLOUDFLARE_ACCESS_CLIENT_SECRET (Service Token من فريق IT/Security). بديل مؤقت: تصدير Excel من Tableau ورفعه يدوياً من نفس الصفحة.'
  );
}
