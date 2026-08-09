'use client';

import { authFetch } from '@/lib/authFetch';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui-v2/Button';
import {
  CONTACT_RELATIONSHIP_VALUES,
  type CandidateContact,
  type ContactRelationship,
} from '@/lib/recruitment/types';

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

type Props = {
  candidateId: string;
  enabled: boolean;
};

export default function CandidateContactsPanel({ candidateId, enabled }: Props) {
  const [contacts, setContacts] = useState<CandidateContact[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    relationship: 'أب' as ContactRelationship,
    relationshipOther: '',
    phone: '',
  });

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/recruitment/candidates/${candidateId}/contacts`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      setContacts(json.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  }, [candidateId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) {
    return (
      <p className="text-xs text-[rgba(234,240,255,0.55)] md:col-span-2">
        جهات اتصال العائلة متاحة عند تفعيل Recruitment V2.
      </p>
    );
  }

  const add = async () => {
    setError('');
    try {
      const res = await authFetch(`/api/recruitment/candidates/${candidateId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الإضافة');
      setForm({ name: '', relationship: 'أب', relationshipOther: '', phone: '' });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    }
  };

  const remove = async (contactId: string) => {
    setError('');
    try {
      const res = await authFetch(
        `/api/recruitment/candidates/${candidateId}/contacts/${contactId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الحذف');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    }
  };

  return (
    <div className="md:col-span-2 border border-[rgba(255,255,255,0.1)] rounded-lg p-3 space-y-3">
      <h3 className="font-semibold text-sm">جهات اتصال العائلة / الطوارئ (حتى 3 — مطلوب 2)</h3>
      {loading ? <p className="text-xs text-[rgba(234,240,255,0.55)]">جاري التحميل…</p> : null}
      <ul className="space-y-1 text-sm">
        {contacts.map((c) => (
          <li
            key={c.contactId}
            className="flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.06)] py-1"
          >
            <span>
              {c.name} — {c.relationship}
              {c.relationship === 'أخرى' && c.relationshipOther ? ` (${c.relationshipOther})` : ''} —{' '}
              {c.phone}
            </span>
            <button type="button" className="text-[#FB7185] text-xs underline" onClick={() => void remove(c.contactId)}>
              حذف
            </button>
          </li>
        ))}
        {!contacts.length && !loading ? (
          <li className="text-xs text-[rgba(234,240,255,0.55)]">لا توجد جهات اتصال بعد</li>
        ) : null}
      </ul>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input
          className={inputClass}
          placeholder="الاسم"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="الهاتف"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select
          className={inputClass}
          value={form.relationship}
          onChange={(e) =>
            setForm({ ...form, relationship: e.target.value as ContactRelationship })
          }
        >
          {CONTACT_RELATIONSHIP_VALUES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {form.relationship === 'أخرى' ? (
          <input
            className={inputClass}
            placeholder="صلة القرابة (أخرى)"
            value={form.relationshipOther}
            onChange={(e) => setForm({ ...form, relationshipOther: e.target.value })}
          />
        ) : (
          <div />
        )}
      </div>
      {error ? <p className="text-[#FB7185] text-xs">{error}</p> : null}
      <Button variant="secondary" onClick={() => void add()} disabled={contacts.length >= 3}>
        إضافة جهة اتصال
      </Button>
    </div>
  );
}
