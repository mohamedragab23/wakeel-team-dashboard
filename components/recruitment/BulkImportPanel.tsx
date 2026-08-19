'use client';

import { authFetch } from '@/lib/authFetch';
import { useState } from 'react';
import Papa from 'papaparse';
import Button from '@/components/ui-v2/Button';
import Card from '@/components/ui-v2/Card';
import type { CandidateInput } from '@/lib/recruitment/types';
import { readRecruitmentExcelRows, sheetRowsToCandidates } from '@/lib/recruitment/bulkExcelImport';

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF] font-mono';

function parseTextLines(text: string): CandidateInput[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t|]/).map((p) => p.trim());
      return {
        fullName: parts[0] || '',
        phone: parts[1] || '',
        jobAd: parts[2] || 'غير محدد',
        appliedDate: parts[3] || '' };
    });
}

type Props = {
  isLegacy: boolean;
  title: string;
  description: string;
  onImported?: () => void;
};

export default function BulkImportPanel({ isLegacy, title, description, onImported }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const uploadRows = async (rows: CandidateInput[]) => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await authFetch('/api/recruitment/candidates/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, isLegacy }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل الاستيراد');
      setResult(data.data);
      onImported?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  const onFile = async (file: File) => {
    setError('');
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.csv')) {
        const text = new TextDecoder().decode(buf);
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (r) => {
            const parsed = sheetRowsToCandidates(r.data as Record<string, unknown>[]);
            if (!parsed.length) {
              setError('الملف لا يحتوي على بيانات صالحة للاستيراد');
              return;
            }
            uploadRows(parsed);
          } });
        return;
      }
      const json = await readRecruitmentExcelRows(buf, file.name);
      const parsed = sheetRowsToCandidates(json);
      if (!parsed.length) {
        setError('الملف لا يحتوي على بيانات صالحة للاستيراد');
        return;
      }
      uploadRows(parsed);
    } catch (e: unknown) {
      setError(e instanceof Error ? `فشل قراءة الملف: ${e.message}` : 'فشل قراءة الملف');
    }
  };

  const onTextSubmit = () => uploadRows(parseTextLines(text));

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-1">{title}</h2>
        <p className="text-sm text-[rgba(234,240,255,0.65)]">{description}</p>
      </div>

      <div>
        <h2 className="text-lg font-bold mb-2">رفع ملف Excel أو CSV</h2>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mb-2">
          الأعمدة المتوقعة: الاسم، الهاتف، الإعلان (اختياري)، تاريخ التقديم (اختياري)
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.currentTarget.value = '';
          }}
        />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-2">لصق نصي (سطر لكل مرشح)</h2>
        <p className="text-sm text-[rgba(234,240,255,0.65)] mb-2">
          الصيغة: الاسم، الهاتف، الإعلان، التاريخ — مفصولة بفاصلة أو tab
        </p>
        <textarea
          className={inputClass + ' min-h-[120px]'}
          placeholder="أحمد علي، 01001234567، سائق توصيل - القاهرة"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button className="mt-3" variant="primary" onClick={onTextSubmit} disabled={loading || !text.trim()}>
          استيراد من النص
        </Button>
      </div>

      {error && <p className="text-[#FB7185]">{error}</p>}
      {result && (
        <div className="p-4 rounded-lg bg-[rgba(0,245,255,0.08)] border border-[rgba(0,245,255,0.2)]">
          <p className="font-medium">تم إنشاء {result.created} مرشح</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-sm text-[#FB7185] list-disc list-inside">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
