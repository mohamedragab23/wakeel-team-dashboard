'use client';

import ExcelUploadEnhanced from './ExcelUploadEnhanced';

interface ExcelUploadProps {
  type: 'riders' | 'performance';
  performanceDate?: string; // Date for performance data upload
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
}

// Use enhanced version with drag & drop
export default function ExcelUpload({ type, performanceDate, onSuccess, onError }: ExcelUploadProps) {
  return <ExcelUploadEnhanced type={type} performanceDate={performanceDate} onSuccess={onSuccess} onError={onError} />;
}
