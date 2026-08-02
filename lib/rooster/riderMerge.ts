/**
 * SRS-013 Phase 2 — Rider Search: Rooster raw types + the "merge Dashboard +
 * Rooster into one object" logic frozen in SRS013_DESIGN_FREEZE.md (Phase 2,
 * "Single Rider Profile — merge rule").
 *
 * Frozen merge rule:
 * - Field present in BOTH sources with different values -> dashboard value
 *   wins, tagged "dashboard".
 * - Field present ONLY in Rooster -> included as-is, tagged "rooster"
 *   (rendered in the UI as "Live from Rooster").
 * - Field present ONLY in Sheets (dashboard) -> included as-is, tagged
 *   "dashboard".
 * - No field returned by Rooster is ever silently dropped -- anything not
 *   explicitly mapped below lands in `additionalRoosterFields`, still
 *   tagged "rooster".
 */
import type { Rider } from '@/lib/adminService';

/** One Rooster contract record (confirmed live 2026-07-27, SRS-013 Phase 2). */
export type RoosterContract = {
  id: number;
  employee_id: number;
  contract: { id: number; name: string; type: string; company_name: string; company_id: number } | null;
  start_at: string;
  end_at: string;
  start: string;
  end: string;
  status: string;
  job_title: string;
  city_id: number;
  city_name: string;
  time_zone: string;
  vehicle_type: string | null;
  currently_active: boolean;
};

/** One `/api/rooster/v3/employees` result row (confirmed live 2026-07-27). */
export type RoosterEmployeeRaw = {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  bank_data: unknown;
  birth_date: string | null;
  contracts: RoosterContract[];
  active_contract: RoosterContract | null;
  reporting_to: unknown;
  work_permit_expiry_date: string | null;
  batch_number: number | null;
  /**
   * Confirmed live (2026-07-27) to be the "Paper No" value shown in
   * Rooster's own Riders/Review UI (e.g. `"29511120200678    "`, trailing
   * spaces as returned by the API -- trimmed wherever we surface it). Not
   * documented anywhere in Rooster's own API -- discovered by cross-checking
   * a known employee's Paper No against every field in the raw response.
   */
  field_value: string | null;
  created_at: string;
  starting_point_ids: number[];
};

export type RiderSearchType = 'workerId' | 'paperNumber' | 'phone' | 'name' | 'email';

export type FieldSource = 'dashboard' | 'rooster';

/** Frozen shape (SRS013_DESIGN_FREEZE.md Phase 2 §3) + a few additive,
 *  dashboard-only convenience fields (supervisor, contract metadata) that
 *  don't contradict the frozen contract, just extend it. */
export type MergedRiderProfile = {
  workerId?: string;
  paperNumber?: string;
  name?: string;
  email?: string;
  phoneNumbers?: string[];
  city?: string;
  company?: string;
  jobTitle?: string;
  joiningDate?: string;
  currentStatus?: string;
  contracts?: RoosterContract[];
  /** Any Rooster top-level field not otherwise mapped above -- never dropped. */
  additionalRoosterFields?: Record<string, unknown>;
  /** Dashboard-only extras (Rooster has no equivalent concept for these). */
  supervisorCode?: string;
  supervisorName?: string;
  contractType?: string;
  contractEndDate?: string;
  /** Per-field provenance so the UI can render "Dashboard" vs "Live from Rooster" tags. */
  fieldSources: Record<string, FieldSource>;
};

function norm(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizePhoneDigits(v: unknown): string {
  return norm(v).replace(/\D/g, '');
}

/** Loose equality for two phone-like strings, tolerant of +20/0/00 country-code prefixes. */
function phonesLooselyMatch(a: unknown, b: unknown): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  const tailLen = 9; // Egyptian mobile numbers: 9 significant digits after the leading 0/country code
  return da.slice(-tailLen) === db.slice(-tailLen);
}

function pickActiveOrLatestContract(emp: RoosterEmployeeRaw): RoosterContract | null {
  if (emp.active_contract) return emp.active_contract;
  if (!emp.contracts?.length) return null;
  return [...emp.contracts].sort((a, b) => norm(b.start_at).localeCompare(norm(a.start_at)))[0] ?? null;
}

const MAPPED_ROOSTER_TOP_LEVEL_KEYS = new Set([
  'id',
  'name',
  'email',
  'phone_number',
  'contracts',
  'active_contract',
  'field_value',
]);

export function mergeRiderProfile(
  dashboardRider: Rider | null,
  roosterEmployee: RoosterEmployeeRaw | null
): MergedRiderProfile {
  const fieldSources: Record<string, FieldSource> = {};
  const profile: MergedRiderProfile = { fieldSources };
  const contract = roosterEmployee ? pickActiveOrLatestContract(roosterEmployee) : null;

  // workerId: dashboard's rider code IS the same value as Rooster's numeric id
  // (both derived from the same Rooster employee_id historically) -- dashboard wins if present.
  const dashboardWorkerId = norm(dashboardRider?.code);
  const roosterWorkerId = roosterEmployee ? String(roosterEmployee.id) : '';
  if (dashboardWorkerId) {
    profile.workerId = dashboardWorkerId;
    fieldSources.workerId = 'dashboard';
  } else if (roosterWorkerId) {
    profile.workerId = roosterWorkerId;
    fieldSources.workerId = 'rooster';
  }

  // paperNumber: Rooster-only -- no such column exists in our Sheets.
  const paperNumber = norm(roosterEmployee?.field_value);
  if (paperNumber) {
    profile.paperNumber = paperNumber;
    fieldSources.paperNumber = 'rooster';
  }

  // name: dashboard wins if present.
  const dashboardName = norm(dashboardRider?.name);
  const roosterName = norm(roosterEmployee?.name);
  if (dashboardName) {
    profile.name = dashboardName;
    fieldSources.name = 'dashboard';
  } else if (roosterName) {
    profile.name = roosterName;
    fieldSources.name = 'rooster';
  }

  // email: Rooster-only -- Sheets has no email column for riders.
  const roosterEmail = norm(roosterEmployee?.email);
  if (roosterEmail) {
    profile.email = roosterEmail;
    fieldSources.email = 'rooster';
  }

  // phoneNumbers: merge both, dedup by loose phone match, dashboard's raw format kept first.
  const phones: string[] = [];
  const dashboardPhone = norm(dashboardRider?.phone);
  const roosterPhone = norm(roosterEmployee?.phone_number);
  if (dashboardPhone) phones.push(dashboardPhone);
  if (roosterPhone && !phones.some((p) => phonesLooselyMatch(p, roosterPhone))) phones.push(roosterPhone);
  if (phones.length) {
    profile.phoneNumbers = phones;
    fieldSources.phoneNumbers = dashboardPhone ? 'dashboard' : 'rooster';
  }

  // city: dashboard's "region" column is the closest existing dashboard concept; falls back to
  // Rooster's active_contract.city_name.
  const dashboardCity = norm(dashboardRider?.region);
  const roosterCity = norm(contract?.city_name);
  if (dashboardCity) {
    profile.city = dashboardCity;
    fieldSources.city = 'dashboard';
  } else if (roosterCity) {
    profile.city = roosterCity;
    fieldSources.city = 'rooster';
  }

  // company: Rooster-only (contract.company_name) -- no equivalent dashboard column.
  const company = norm(contract?.contract?.company_name);
  if (company) {
    profile.company = company;
    fieldSources.company = 'rooster';
  }

  // jobTitle: Rooster-only.
  const jobTitle = norm(contract?.job_title);
  if (jobTitle) {
    profile.jobTitle = jobTitle;
    fieldSources.jobTitle = 'rooster';
  }

  // joiningDate: dashboard's joinDate wins if present, else Rooster's contract start.
  const dashboardJoinDate = norm(dashboardRider?.joinDate);
  const roosterJoinDate = norm(contract?.start_at);
  if (dashboardJoinDate) {
    profile.joiningDate = dashboardJoinDate;
    fieldSources.joiningDate = 'dashboard';
  } else if (roosterJoinDate) {
    profile.joiningDate = roosterJoinDate;
    fieldSources.joiningDate = 'rooster';
  }

  // currentStatus: dashboard's status wins if present, else derive from Rooster contract.
  const dashboardStatus = norm(dashboardRider?.status);
  if (dashboardStatus) {
    profile.currentStatus = dashboardStatus;
    fieldSources.currentStatus = 'dashboard';
  } else if (contract) {
    profile.currentStatus = contract.currently_active ? `${contract.status} (نشط الآن)` : contract.status;
    fieldSources.currentStatus = 'rooster';
  }

  // contracts: full Rooster passthrough, historical, unmerged (as frozen).
  if (roosterEmployee?.contracts?.length) {
    profile.contracts = roosterEmployee.contracts;
    fieldSources.contracts = 'rooster';
  }

  // Dashboard-only extras -- no Rooster equivalent, always tagged "dashboard".
  if (norm(dashboardRider?.supervisorCode)) {
    profile.supervisorCode = norm(dashboardRider?.supervisorCode);
    fieldSources.supervisorCode = 'dashboard';
  }
  if (norm(dashboardRider?.supervisorName)) {
    profile.supervisorName = norm(dashboardRider?.supervisorName);
    fieldSources.supervisorName = 'dashboard';
  }
  if (norm(dashboardRider?.contractType)) {
    profile.contractType = norm(dashboardRider?.contractType);
    fieldSources.contractType = 'dashboard';
  }
  if (norm(dashboardRider?.contractEndDate)) {
    profile.contractEndDate = norm(dashboardRider?.contractEndDate);
    fieldSources.contractEndDate = 'dashboard';
  }

  // Never silently drop any Rooster field -- anything not explicitly mapped above.
  if (roosterEmployee) {
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(roosterEmployee)) {
      if (MAPPED_ROOSTER_TOP_LEVEL_KEYS.has(k)) continue;
      if (v === null || v === undefined || v === '') continue;
      extra[k] = v;
    }
    if (Object.keys(extra).length) {
      profile.additionalRoosterFields = extra;
      fieldSources.additionalRoosterFields = 'rooster';
    }
  }

  return profile;
}
