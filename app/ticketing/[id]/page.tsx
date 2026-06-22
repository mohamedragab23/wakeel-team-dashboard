'use client';

import { getStoredUser } from '@/lib/clientSession';
import { authFetch } from '@/lib/authFetch';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TicketStatusBadge } from '@/components/ticketing/TicketTable';
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS_AR,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS_AR,
  TICKET_TYPE_LABELS_AR,
  type TicketAttachmentMeta,
  type TicketAuditRow,
  type TicketCommentRow,
  type TicketRow } from '@/lib/ticketing/types';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const user = getStoredUser() || {};
      setIsAdmin(user?.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ticketing', 'detail', id],
    queryFn: async (): Promise<{
      ticket: TicketRow;
      comments: TicketCommentRow[];
      attachments: TicketAttachmentMeta[];
      audit: TicketAuditRow[];
    }> => {
      const res = await authFetch(`/api/ticketing/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json.data;
    } });

  const postComment = async () => {
    if (!comment.trim()) return;
    await authFetch(`/api/ticketing/${id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json' },
      body: JSON.stringify({ body: comment }) });
    setComment('');
    refetch();
    queryClient.invalidateQueries({ queryKey: ['ticketing', 'notifications'] });
  };

  const updateStatus = async (patch: Record<string, string>) => {
    await authFetch(`/api/ticketing/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json' },
      body: JSON.stringify(patch) });
    refetch();
    queryClient.invalidateQueries({ queryKey: ['ticketing'] });
  };

  if (isLoading) return <p className="text-sm">جاري التحميل…</p>;
  if (error) return <p className="text-sm text-red-400">{(error as Error).message}</p>;
  if (!data) return null;

  const { ticket, comments, attachments, audit } = data;
  const closed = ['closed', 'rejected', 'approved'].includes(ticket.status);

  return (
    <div className="space-y-6 max-w-4xl">
      <button type="button" onClick={() => router.back()} className="text-sm text-cyan-400">
        ← رجوع
      </button>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h2 className="text-xl font-bold">#{ticket.ticketNumber}</h2>
          <TicketStatusBadge status={ticket.status} />
          <span className="text-xs text-[#94A3B8]">{TICKET_TYPE_LABELS_AR[ticket.type]}</span>
        </div>
        <p className="font-medium">{ticket.subject}</p>
        <p className="text-sm text-[#CBD5E1] mt-2 whitespace-pre-wrap">{ticket.description}</p>
        <div className="grid sm:grid-cols-2 gap-2 mt-4 text-xs text-[#94A3B8]">
          <span>المنطقة: {ticket.zone}</span>
          <span>المشرف: {ticket.supervisorName}</span>
          <span>الأولوية: {TICKET_PRIORITY_LABELS_AR[ticket.priority]}</span>
          {ticket.slaDueAt && <span>SLA: {new Date(ticket.slaDueAt).toLocaleString('ar-EG')}</span>}
        </div>
      </div>

      {isAdmin && !closed && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-200">إجراءات الأدمن</p>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg bg-white/5 border border-white/10 p-2 text-sm"
              value={ticket.status}
              onChange={(e) => updateStatus({ status: e.target.value })}
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABELS_AR[s]}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg bg-white/5 border border-white/10 p-2 text-sm"
              value={ticket.priority}
              onChange={(e) => updateStatus({ priority: e.target.value })}
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS_AR[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-2">المرفقات ({attachments.length})</h3>
        <ul className="space-y-1 text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <button
                type="button"
                className="text-cyan-400 hover:underline"
                onClick={() => setPreviewId(previewId === a.id ? null : a.id)}
              >
                {a.originalName} ({Math.round(a.sizeBytes / 1024)} KB)
              </button>
              <a
                href={`/api/ticketing/attachments/${a.id}?download=1`}
                className="text-xs text-[#94A3B8]"
                onClick={(e) => {
                  e.preventDefault();
                  authFetch(`/api/ticketing/attachments/${a.id}?download=1`)
                    .then((r) => r.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = a.originalName;
                      link.click();
                      URL.revokeObjectURL(url);
                    });
                }}
              >
                تحميل
              </a>
            </li>
          ))}
        </ul>
        {previewId && (
          <div className="mt-3 rounded-lg border border-white/10 p-2">
            {/* Lazy load: only fetch when user opens preview */}
            <AttachmentPreview id={previewId}  />
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">التعليقات</h3>
        <div className="space-y-2 mb-4">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-white/5 p-3 text-sm">
              <p className="text-xs text-[#94A3B8] mb-1">
                {c.authorName} ({c.authorRole}) — {new Date(c.createdAt).toLocaleString('ar-EG')}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
        {!closed && (
          <div className="flex gap-2">
            <textarea
              className="flex-1 rounded-lg bg-white/5 border border-white/10 p-2 text-sm"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="اكتب رداً…"
            />
            <button
              type="button"
              onClick={postComment}
              className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-200 text-sm self-end"
            >
              إرسال
            </button>
          </div>
        )}
      </section>

      {isAdmin && audit?.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">سجل التدقيق</h3>
          <ul className="text-xs text-[#94A3B8] space-y-1">
            {audit.map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString('ar-EG')} — {a.actorName}: {a.action}
                {a.fromStatus && a.toStatus ? ` (${a.fromStatus} → ${a.toStatus})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AttachmentPreview({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState('');

  useEffect(() => {
    let objectUrl: string | null = null;
    authFetch(`/api/ticketing/attachments/${id}`)
      .then((r) => {
        setMime(r.headers.get('content-type') || '');
        return r.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (!url) return <p className="text-xs">جاري تحميل المعاينة…</p>;
  if (mime.startsWith('image/')) {
    return <img src={url} alt="" className="max-h-96 rounded" />;
  }
  return <p className="text-xs">معاينة غير متاحة — استخدم التحميل</p>;
}
