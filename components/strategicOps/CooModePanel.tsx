'use client';

/**
 * SRS-010/SRS-011 Part 9/10 — COO Mode (AI Executive Assistant).
 * Renders as a free-text chat over a FIXED, deterministic answer set —
 * there is no LLM here. Typing a question runs a keyword-intent match
 * against `matchKeywords` on each pre-computed `CooModeAnswer` (built from
 * real engines server-side). Every answer discloses its confidence % and
 * its data source, per SRS-011 Part 10 ("كل إجابة يجب أن تعتمد فقط على
 * المحركات الحالية وبيانات النظام، مع إظهار مستوى الثقة ومصدر البيانات").
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import type { CooModeAnswer, CooModeReport } from '@/lib/strategicOps/cooMode';

type Props = {
  enabled: boolean;
  qs: string;
  onOpenKpi?: (kpiId: string) => void;
};

type ChatEntry = { kind: 'question'; text: string } | { kind: 'answer'; answer: CooModeAnswer | null };

function normalizeAr(s: string): string {
  return s.toLowerCase().trim();
}

/** Best-effort keyword intent match — no LLM, fully deterministic and auditable. */
function matchAnswer(freeText: string, answers: CooModeAnswer[]): CooModeAnswer | null {
  const q = normalizeAr(freeText);
  if (!q) return null;
  let best: { answer: CooModeAnswer; score: number } | null = null;
  for (const a of answers) {
    let score = 0;
    for (const kw of a.matchKeywords) {
      if (q.includes(normalizeAr(kw))) score += kw.length; // longer/more specific match wins
    }
    if (score > 0 && (!best || score > best.score)) best = { answer: a, score };
  }
  return best?.answer ?? null;
}

export function CooModePanel({ enabled, qs, onOpenKpi }: Props) {
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);

  const query = useQuery({
    queryKey: ['strategic-ops-coo-mode', qs],
    queryFn: async () => {
      const res = await authFetch(`/api/strategic-ops/coo-mode?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل وضع COO');
      return json.data as CooModeReport;
    },
    enabled,
    staleTime: 60_000,
  });

  const answers = query.data?.answers ?? [];

  const suggestions = useMemo(
    () => answers.slice(0, 6).map((a) => ({ id: a.id, label: a.questionAr })),
    [answers]
  );

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || answers.length === 0) return;
    const matched = matchAnswer(trimmed, answers);
    setChat((prev) => [...prev, { kind: 'question', text: trimmed }, { kind: 'answer', answer: matched }]);
    setInput('');
  }

  if (!enabled) return null;

  if (query.isLoading) {
    return <p className="text-sm text-[#94A3B8]">⏳ جاري توليد إجابات COO Mode (يشمل محاكاة سيناريوهات what-if)…</p>;
  }
  if (query.error) {
    return <p className="text-sm text-red-300">{(query.error as Error).message}</p>;
  }
  if (!query.data) return null;

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-[11px] text-[#64748B]">
        توليد تلقائي: {new Date(query.data.generatedAt).toLocaleString('ar-EG')} — اكتب سؤالك التنفيذي بالعربية أو الإنجليزية.
      </p>

      {/* Chat input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="مثال: لماذا لم نحقق الهدف اليوم؟ / كم Rider أقل من 4 ساعات؟"
          className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#64748B]"
        />
        <button
          type="submit"
          className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-4 py-2 text-sm"
        >
          اسأل
        </button>
      </form>

      {/* Quick-ask suggestion chips (still free-text underneath — not a fixed menu) */}
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => ask(s.label)}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-[#94A3B8] hover:bg-white/10 hover:text-[#EAF0FF]"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Chat history */}
      {chat.length > 0 && (
        <div className="space-y-2">
          {chat.map((entry, idx) =>
            entry.kind === 'question' ? (
              <div key={idx} className="flex justify-end">
                <div className="rounded-xl bg-cyan-500/15 border border-cyan-500/30 px-3 py-2 text-sm text-cyan-100 max-w-[80%]">
                  {entry.text}
                </div>
              </div>
            ) : (
              <AnswerBubble key={idx} answer={entry.answer} onOpenKpi={onOpenKpi} />
            )
          )}
        </div>
      )}

      {/* Full known Q&A list underneath, unchanged from SRS-010 — still browsable directly */}
      <details className="rounded-xl border border-white/10 bg-black/10 p-2">
        <summary className="text-xs text-[#94A3B8] cursor-pointer">عرض كل الأسئلة المُجهَّزة تلقائيًا ({answers.length})</summary>
        <div className="space-y-2 mt-2">
          {answers.map((a) => (
            <div key={a.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#64748B] mb-1">{a.questionAr}</p>
              <p className="text-sm text-[#EAF0FF]">{a.answerAr}</p>
              {a.detailAr && a.detailAr.length > 0 && (
                <ul className="list-disc list-inside mt-1.5 space-y-0.5">
                  {a.detailAr.map((d, i) => (
                    <li key={i} className="text-[11px] text-[#94A3B8]">{d}</li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-[10px] text-emerald-300">الثقة: {a.confidencePercent}%</span>
                <span className="text-[10px] text-[#64748B]">المصدر: {a.sourceAr}</span>
                {onOpenKpi && (
                  <button type="button" onClick={() => onOpenKpi(a.kpiId)} className="text-[10px] text-cyan-300 hover:underline">
                    🔎 التفاصيل الكاملة للمؤشر
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function AnswerBubble({
  answer,
  onOpenKpi,
}: {
  answer: CooModeAnswer | null;
  onOpenKpi?: (kpiId: string) => void;
}) {
  if (!answer) {
    return (
      <div className="flex justify-start">
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-[#94A3B8] max-w-[85%]">
          لا يوجد محرك حاليًا يجيب على هذا السؤال بدقة — جرّب إحدى الأسئلة المقترحة أعلاه أو صِغ السؤال بشكل أقرب لها.
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-[#EAF0FF] max-w-[85%] space-y-1.5">
        <p>{answer.answerAr}</p>
        {answer.detailAr && answer.detailAr.length > 0 && (
          <ul className="list-disc list-inside space-y-0.5">
            {answer.detailAr.map((d, i) => (
              <li key={i} className="text-[11px] text-[#94A3B8]">{d}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="text-[10px] text-emerald-300">الثقة: {answer.confidencePercent}%</span>
          <span className="text-[10px] text-[#64748B]">المصدر: {answer.sourceAr}</span>
          {onOpenKpi && (
            <button type="button" onClick={() => onOpenKpi(answer.kpiId)} className="text-[10px] text-cyan-300 hover:underline">
              🔎 التفاصيل الكاملة للمؤشر
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
