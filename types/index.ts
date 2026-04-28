export interface User {
  code: string;
  name: string;
  role: 'supervisor' | 'admin';
  region?: string;
  email?: string;
  permissions?: string;
}

export interface Rider {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName: string;
  phone: string;
  joinDate: string;
  status: string;
}

export interface RiderData {
  code: string;
  name: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: number;
  debt: number;
}

export interface DashboardData {
  totalHours: number;
  totalOrders: number;
  totalAbsences: number;
  avgAcceptance: number;
  topRiders: Array<{
    name: string;
    orders: number;
    hours: number;
    acceptance: number;
  }>;
}

export interface SalaryData {
  baseSalary: number;
  commission?: number;
  totalSalary?: number;
  totalOrders: number;
  totalHours: number;
  multiplier: number;
  deductions: number;
  advances: number;
  securityCost: number;
  equipmentCost: number;
  bonus: number;
  netSalary: number;
  salaryType?: 'fixed' | 'commission' | 'custom' | 'legacy';
  commissionRate?: number;
}

export interface PerformanceData {
  success: boolean;
  labels: string[];
  orders: number[];
  hours: number[];
  error?: string;
}

