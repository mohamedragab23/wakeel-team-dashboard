/**
 * SRS-014 Phase B — candidate emergency/family contacts (append-only + active flag).
 */
import { appendToSheet, ensureSheetExists, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { validateContactInput } from './phaseB';
import {
  CANDIDATE_CONTACT_HEADERS,
  SHEET_CANDIDATE_CONTACTS,
  type CandidateContact,
} from './types';

export const MAX_ACTIVE_CONTACTS = 3;
export const MIN_ACTIVE_CONTACTS_DEFAULT = 2;

let ensuredOnce = false;

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function parseActive(value: string): boolean {
  const v = value.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function newContactId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ct_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function rowToContact(row: unknown[], sheetRow: number): CandidateContact | null {
  const contactId = cell(row, 0);
  if (!contactId) return null;
  return {
    contactId,
    candidateId: cell(row, 1),
    name: cell(row, 2),
    relationship: cell(row, 3),
    relationshipOther: cell(row, 4),
    phone: cell(row, 5),
    active: parseActive(cell(row, 6) || 'true'),
    createdAt: cell(row, 7),
    createdBy: cell(row, 8),
    sheetRow,
  };
}

function contactToRow(c: CandidateContact): string[] {
  return [
    c.contactId,
    c.candidateId,
    c.name,
    c.relationship,
    c.relationshipOther,
    c.phone,
    c.active ? 'true' : 'false',
    c.createdAt,
    c.createdBy,
  ];
}

export async function ensureContactsSheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(SHEET_CANDIDATE_CONTACTS, [...CANDIDATE_CONTACT_HEADERS]);
  ensuredOnce = true;
}

async function loadAllContacts(useCache = false): Promise<CandidateContact[]> {
  await ensureContactsSheet();
  const data = await getSheetData(SHEET_CANDIDATE_CONTACTS, useCache);
  const start =
    data.length > 0 && cell(data[0], 0).toLowerCase() === 'contactid' ? 1 : 0;
  const out: CandidateContact[] = [];
  for (let i = start; i < data.length; i++) {
    const c = rowToContact(data[i], i + 1);
    if (c) out.push(c);
  }
  return out;
}

/** Active contacts for one candidate. */
export async function listByCandidate(candidateId: string): Promise<CandidateContact[]> {
  const all = await loadAllContacts(false);
  return all.filter((c) => c.candidateId === candidateId && c.active);
}

export async function addContact(
  candidateId: string,
  input: { name: string; relationship: string; relationshipOther?: string; phone: string },
  actor: { code: string; name: string }
): Promise<CandidateContact> {
  await ensureContactsSheet();
  const validationError = validateContactInput(input);
  if (validationError) throw new Error(validationError);

  const existing = await listByCandidate(candidateId);
  if (existing.length >= MAX_ACTIVE_CONTACTS) {
    throw new Error(`لا يمكن إضافة أكثر من ${MAX_ACTIVE_CONTACTS} جهات اتصال`);
  }

  const contact: CandidateContact = {
    contactId: newContactId(),
    candidateId,
    name: input.name.trim(),
    relationship: input.relationship.trim(),
    relationshipOther:
      input.relationship.trim() === 'أخرى' ? String(input.relationshipOther ?? '').trim() : '',
    phone: input.phone.trim(),
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.code,
  };
  await appendToSheet(SHEET_CANDIDATE_CONTACTS, [contactToRow(contact)], false);
  return contact;
}

export async function updateContact(
  candidateId: string,
  contactId: string,
  patch: { name?: string; relationship?: string; relationshipOther?: string; phone?: string }
): Promise<CandidateContact | null> {
  const all = await loadAllContacts(false);
  const existing = all.find(
    (c) => c.candidateId === candidateId && c.contactId === contactId && c.active
  );
  if (!existing?.sheetRow) return null;

  const next = {
    name: patch.name != null ? String(patch.name) : existing.name,
    relationship: patch.relationship != null ? String(patch.relationship) : existing.relationship,
    relationshipOther:
      patch.relationshipOther != null
        ? String(patch.relationshipOther)
        : existing.relationshipOther,
    phone: patch.phone != null ? String(patch.phone) : existing.phone,
  };
  const validationError = validateContactInput(next);
  if (validationError) throw new Error(validationError);

  const updated: CandidateContact = {
    ...existing,
    name: next.name.trim(),
    relationship: next.relationship.trim(),
    relationshipOther:
      next.relationship.trim() === 'أخرى' ? next.relationshipOther.trim() : '',
    phone: next.phone.trim(),
  };
  await updateSheetRow(SHEET_CANDIDATE_CONTACTS, existing.sheetRow, contactToRow(updated));
  return updated;
}

/** Soft-delete: marks contact inactive (append-only sheet, row updated in place). */
export async function deleteContact(
  candidateId: string,
  contactId: string
): Promise<boolean> {
  const all = await loadAllContacts(false);
  const existing = all.find(
    (c) => c.candidateId === candidateId && c.contactId === contactId && c.active
  );
  if (!existing?.sheetRow) return false;
  const updated: CandidateContact = { ...existing, active: false };
  await updateSheetRow(SHEET_CANDIDATE_CONTACTS, existing.sheetRow, contactToRow(updated));
  return true;
}

/** Requires ≥2 active contacts unless admin exception is approved on the candidate. */
export async function assertMinContacts(
  candidateId: string,
  exceptionApproved: boolean
): Promise<void> {
  if (exceptionApproved) return;
  const contacts = await listByCandidate(candidateId);
  if (contacts.length < MIN_ACTIVE_CONTACTS_DEFAULT) {
    throw new Error('يجب إضافة جهتي اتصال على الأقل قبل التفعيل (أو اعتماد استثناء من الأدمن)');
  }
}
