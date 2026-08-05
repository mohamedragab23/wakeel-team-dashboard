/**
 * Rooster employee detail enrichment (documents + fields).
 *
 * Confirmed live (2026-08-05):
 *   GET /api/rooster/v2/employees/{id}?with_fields=true&city_id={cityId}
 *   returns `fields[]` where type==="file" hold the S3 fileKey in `value`.
 *
 *   GET /api/rooster/v3/employees/{id}/files/{encodeURIComponent(fileKey)}
 *   returns `{ presigned_url, file_name, employee_id }` for viewing.
 *
 * Separated from the v3 list/search path so a documents failure never
 * breaks the existing Rider Search result.
 */
import { getRoosterAppOrigin } from '@/lib/roosterLive/tokenProvider';
import { logStructured } from '@/lib/requestTrace';

export type RiderDocument = {
  /** Field name as stored in Rooster, e.g. `id_card_front`. */
  fieldName: string;
  /** Human label, e.g. `id card front`. */
  label: string;
  /** Opaque file key used to fetch a presigned URL. */
  fileKey: string;
  createdAt?: string;
  /** Manager email / source when available. */
  source?: string;
  underReview?: boolean;
  /** Short-lived Rooster S3 URL — may expire; UI should open promptly. */
  viewUrl?: string;
};

function humanizeFieldName(name: string): string {
  return name.replace(/_/g, ' ');
}

export async function fetchEmployeeDocuments(params: {
  workerId: string | number;
  cityId: number;
  headers: Record<string, string>;
  /** Cap how many presigned URLs we mint (keeps search latency bounded). */
  maxPresign?: number;
}): Promise<RiderDocument[]> {
  const origin = getRoosterAppOrigin();
  const workerId = String(params.workerId);
  const maxPresign = params.maxPresign ?? 12;

  try {
    const qs = new URLSearchParams({
      with_fields: 'true',
      city_id: String(params.cityId),
    }).toString();
    const res = await fetch(`${origin}/api/rooster/v2/employees/${workerId}?${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...params.headers },
      cache: 'no-store',
    });
    if (!res.ok) {
      logStructured('warn', 'rooster_employee_fields_failed', { workerId, status: res.status });
      return [];
    }
    const json: any = await res.json();
    const fields: any[] = Array.isArray(json?.fields) ? json.fields : [];
    const fileFields = fields.filter((f) => f?.type === 'file' && f?.value);

    const docs: RiderDocument[] = [];
    for (let i = 0; i < fileFields.length; i++) {
      const f = fileFields[i];
      const fileKey = String(f.value);
      const doc: RiderDocument = {
        fieldName: String(f.name || ''),
        label: humanizeFieldName(String(f.name || '')),
        fileKey,
        createdAt: f.created_at ? String(f.created_at) : undefined,
        source: f.created_by_email ? String(f.created_by_email) : undefined,
        underReview: Boolean(f.under_review),
      };

      if (i < maxPresign) {
        try {
          const fileRes = await fetch(
            `${origin}/api/rooster/v3/employees/${workerId}/files/${encodeURIComponent(fileKey)}`,
            {
              method: 'GET',
              headers: { Accept: 'application/json', ...params.headers },
              cache: 'no-store',
            }
          );
          if (fileRes.ok) {
            const meta: any = await fileRes.json();
            if (meta?.presigned_url) doc.viewUrl = String(meta.presigned_url);
          }
        } catch {
          // viewUrl stays undefined — UI still lists the document
        }
      }
      docs.push(doc);
    }
    return docs;
  } catch (err: any) {
    logStructured('warn', 'rooster_employee_documents_threw', {
      workerId,
      message: err?.message || String(err),
    });
    return [];
  }
}
