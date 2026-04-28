'use client';

import Layout from '@/components/Layout';
import ExcelUpload from '@/components/ExcelUpload';

export default function AdminUploadPage() {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-[#EAF0FF] mb-2">رفع الملفات</h1>
          <p className="text-[rgba(234,240,255,0.70)]">
            رفع بيانات Excel للمناديب والأداء (المديونية موجودة في عمود المحفظة بملف الأداء)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExcelUpload type="riders" />
          <ExcelUpload type="performance" />
        </div>
      </div>
    </Layout>
  );
}

