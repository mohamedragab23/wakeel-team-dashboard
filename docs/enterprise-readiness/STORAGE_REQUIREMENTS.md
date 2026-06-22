# Storage Requirements Analysis

**Based on:** `lib/ticketing/storage/`, `lib/equipmentPhotoStorage.ts`, `app/api/admin/upload/route.ts`

---

## Current storage architecture

| Asset type | Where stored today | Max size (code) |
|------------|-------------------|-----------------|
| Ticket attachments | S3/R2 or local `.data/` | 20 MB/file (`lib/ticketing/storage/sanitize.ts`) |
| Equipment photos | Google Sheets cells (base64 chunks) | ~7M chars payload cap |
| Excel uploads | Transient memory → Sheets rows | ~4 MB request (`next.config.js`) |
| Performance/Tableau | Sheets `البيانات اليومية` | N/A |

---

## Ticket attachments — growth model

**Assumptions (your scale):**
- 10–20 supervisors
- ~50–150 tickets/month (conservative)
- ~2 attachments/ticket average
- ~2 MB average file (mix PDF + images)

| Period | Tickets | Attachments | Est. storage |
|--------|---------|-------------|--------------|
| 1 year | 600–1,800 | 1,200–3,600 | **2.4–7.2 GB** |
| 3 years | 1,800–5,400 | 3,600–10,800 | **7–22 GB** |
| 5 years | 3,000–9,000 | 6,000–18,000 | **12–36 GB** |

---

## Equipment photos — growth model

Stored in Sheets today (~40KB chunks per cell).  
If ~200 deliveries/month × 2 photos × 500KB:

| Period | Est. photos | Est. size (if moved to object storage) |
|--------|-------------|----------------------------------------|
| 1 year | ~4,800 | **~2.4 GB** |
| 3 years | ~14,400 | **~7 GB** |
| 5 years | ~24,000 | **~12 GB** |

*Currently counts against Google Sheets quota, not R2.*

---

## Do you need Cloudflare R2?

| Situation | R2 required? |
|-----------|--------------|
| Ticketing not live yet (no Neon) | **No** |
| Ticketing live in production | **Yes** (or S3) — Vercel cannot use local disk |
| Equipment photos stay in Sheets | **No** (but not recommended long-term) |
| Moving photos off Sheets (future) | **Yes** |

**Recommendation:** **R2** for ticketing attachments — S3-compatible, no egress fees, works with existing `lib/ticketing/storage/s3.ts` via `TICKETING_S3_ENDPOINT`.

---

## Do you need AWS S3?

| Option | When |
|--------|------|
| **R2** | Best value for your scale (recommended) |
| **AWS S3** | If already on AWS or need IAM integration |
| **Neither** | Ticketing not deployed; dev uses local storage only |

---

## Combined object storage (ticketing + future photos)

| Horizon | R2 estimate (ticketing only) | With photos migrated |
|---------|------------------------------|----------------------|
| 1 year | ~3–8 GB | ~5–11 GB |
| 3 years | ~7–22 GB | ~14–29 GB |
| 5 years | ~12–36 GB | ~24–48 GB |

**R2 cost at these sizes:** typically **$1–5/month** (storage + minimal ops).

---

## Google Sheets storage (unchanged)

Performance history remains in Sheets — primary source of truth.  
At ~3,000 riders × 365 days × 5 years ≈ **5.5M rows** theoretical max — **Sheets will break before R2 does**.  
Mitigation (future, additive): monthly archive tabs or export to cold storage — **not migration**.
