export type PayoutCycleStatus = 'draft' | 'active' | 'finalized';

export type PayoutCycle = {
  cycleId: string;
  year: number;
  month: number;
  cycleNumber: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  payoutDate: string;
  deductionGenerationDate: string;
  isClosing: boolean;
  equipmentDeductionEnabled: boolean;
  status: PayoutCycleStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  sheetRow?: number;
};

export type PayoutCycleInput = {
  year: number;
  month: number;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  payoutDate: string;
  deductionGenerationDate: string;
  isClosing?: boolean;
  equipmentDeductionEnabled?: boolean;
  status?: PayoutCycleStatus;
  notes?: string;
};
