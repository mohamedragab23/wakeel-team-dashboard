/**
 * Tableau Server REST API — PAT sign-in and crosstab export.
 * @see https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref.htm
 */

const API_VERSION = process.env.TABLEAU_API_VERSION?.trim() || '3.21';

export type TableauConfig = {
  serverUrl: string;
  siteContentUrl: string;
  patName: string;
  patSecret: string;
  viewId?: string;
  viewContentUrl?: string;
};

export function getTableauConfigFromEnv(): TableauConfig | null {
  const serverUrl = (process.env.TABLEAU_SERVER_URL || 'https://tableau.deliveryhero.net').replace(/\/$/, '');
  const siteContentUrl = process.env.TABLEAU_SITE_CONTENT_URL?.trim() || 'Talabat';
  const patName = process.env.TABLEAU_PAT_NAME?.trim();
  const patSecret = process.env.TABLEAU_PAT_SECRET?.trim();
  if (!patName || !patSecret) return null;
  return {
    serverUrl,
    siteContentUrl,
    patName,
    patSecret,
    viewId: process.env.TABLEAU_VIEW_ID?.trim(),
    viewContentUrl: process.env.TABLEAU_VIEW_CONTENT_URL?.trim() || 'RiderPerformance',
  };
}

type SignInResult = {
  token: string;
  siteId: string;
};

function apiBase(serverUrl: string): string {
  return `${serverUrl}/api/${API_VERSION}`;
}

export async function tableauSignIn(cfg: TableauConfig): Promise<SignInResult> {
  const res = await fetch(`${apiBase(cfg.serverUrl)}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      credentials: {
        personalAccessTokenName: cfg.patName,
        personalAccessTokenSecret: cfg.patSecret,
        site: { contentUrl: cfg.siteContentUrl },
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tableau sign-in failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  const token = json?.credentials?.token;
  const siteId = json?.credentials?.site?.id;
  if (!token || !siteId) throw new Error('Tableau sign-in: missing token or site id');
  return { token, siteId };
}

export async function tableauSignOut(cfg: TableauConfig, token: string): Promise<void> {
  try {
    await fetch(`${apiBase(cfg.serverUrl)}/auth/signout`, {
      method: 'POST',
      headers: { 'X-Tableau-Auth': token },
    });
  } catch {
    /* best-effort */
  }
}

async function tableauGetJson<T>(cfg: TableauConfig, token: string, path: string): Promise<T> {
  const res = await fetch(`${apiBase(cfg.serverUrl)}${path}`, {
    headers: { 'X-Tableau-Auth': token, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tableau GET ${path} (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

export async function resolveViewId(cfg: TableauConfig, token: string, siteId: string): Promise<string> {
  if (cfg.viewId) return cfg.viewId;

  const viewName = cfg.viewContentUrl || 'RiderPerformance';
  const filter = encodeURIComponent(`contentUrl:eq:${viewName}`);
  const data = await tableauGetJson<{ views?: { view?: Array<{ id: string; contentUrl?: string; name?: string }> } }>(
    cfg,
    token,
    `/sites/${siteId}/views?filter=${filter}`
  );
  const views = data?.views?.view || [];
  if (views.length === 1) return views[0].id;

  const byName = views.find(
    (v) =>
      (v.contentUrl || '').toLowerCase() === viewName.toLowerCase() ||
      (v.name || '').toLowerCase() === viewName.toLowerCase()
  );
  if (byName?.id) return byName.id;

  if (views.length > 1) {
    throw new Error(
      `Multiple Tableau views match "${viewName}". Set TABLEAU_VIEW_ID. Found: ${views.map((v) => v.contentUrl || v.name).join(', ')}`
    );
  }
  throw new Error(`Tableau view not found: ${viewName}. Set TABLEAU_VIEW_ID in environment.`);
}

export type CrosstabExportOptions = {
  /** YYYY-MM-DD — applied as vf_created_date when supported */
  createdDate?: string;
  contractName?: string;
  format?: 'excel' | 'csv';
};

/**
 * Download view crosstab (same as UI: Download → Crosstab → Excel/CSV).
 */
export async function downloadViewCrosstab(
  cfg: TableauConfig,
  token: string,
  siteId: string,
  viewId: string,
  opts: CrosstabExportOptions = {}
): Promise<ArrayBuffer> {
  const fmt = opts.format === 'csv' ? 'csv' : 'excel';
  const params = new URLSearchParams();
  if (opts.createdDate) {
    params.set('vf_created_date', opts.createdDate);
  }
  if (opts.contractName) {
    params.set('vf_contract_name', opts.contractName);
  }
  const qs = params.toString();
  const path = `/sites/${siteId}/views/${viewId}/crosstab/${fmt}${qs ? `?${qs}` : ''}`;

  const res = await fetch(`${apiBase(cfg.serverUrl)}${path}`, {
    headers: { 'X-Tableau-Auth': token, Accept: '*/*' },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Tableau crosstab ${fmt} failed (${res.status}): ${errText.slice(0, 400)}`);
  }
  return res.arrayBuffer();
}

export async function fetchRiderPerformanceCrosstab(
  targetDateIso: string,
  opts?: { format?: 'excel' | 'csv' }
): Promise<{ buffer: ArrayBuffer; format: 'excel' | 'csv' }> {
  const cfg = getTableauConfigFromEnv();
  if (!cfg) throw new Error('Tableau not configured (TABLEAU_PAT_NAME / TABLEAU_PAT_SECRET)');

  const { token, siteId } = await tableauSignIn(cfg);
  try {
    const viewId = await resolveViewId(cfg, token, siteId);
    const format = opts?.format || 'excel';
    const buffer = await downloadViewCrosstab(cfg, token, siteId, viewId, {
      createdDate: targetDateIso,
      contractName: 'wakeel',
      format,
    });
    return { buffer, format };
  } finally {
    await tableauSignOut(cfg, token);
  }
}
