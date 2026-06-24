export type WorkflowRequestMetadata = {
  contractType: string;
  joinDate: string;
  contractEndDate: string;
};

/** Extended columns after approved-by in assignment/reactivation sheets (with zone column). */
export function extractWorkflowMetadataFromRow(row: unknown[], hasZone: boolean): WorkflowRequestMetadata {
  const baseIndex = hasZone ? 9 : 8;
  const r = row as unknown[];
  return {
    contractType: r[baseIndex]?.toString().trim() || '',
    joinDate: r[baseIndex + 1]?.toString().trim() || '',
    contractEndDate: r[baseIndex + 2]?.toString().trim() || '',
  };
}

export function appendWorkflowMetadataToRow(row: unknown[], metadata: WorkflowRequestMetadata): unknown[] {
  return [...row, metadata.contractType, metadata.joinDate, metadata.contractEndDate];
}

export const WORKFLOW_METADATA_HEADERS = [
  'نوع العقد',
  'تاريخ الانضمام',
  'تاريخ انتهاء العقد',
] as const;
