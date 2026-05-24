'use client';

import CandidatesTable from '@/components/recruitment/CandidatesTable';
import NewCandidateForm from '@/components/recruitment/NewCandidateForm';
import { useState } from 'react';

export default function RecruitmentCandidatesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">جميع المتقدمين</h2>
      <div className="mb-4">
        <NewCandidateForm onCreated={() => setRefreshKey((v) => v + 1)} />
      </div>
      <CandidatesTable key={refreshKey} mode="active" />
    </div>
  );
}
