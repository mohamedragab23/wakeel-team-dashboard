import type { RiderRowForFilter } from '@/lib/ridersTableFilter';
import { cellToFilterLabel, distinctFilterValues } from '@/lib/tableColumnFilterValues';

export function collectRiderColumnValues(rows: RiderRowForFilter[], col: string): string[] {
  const labels: string[] = [];
  for (const r of rows) {
    switch (col) {
      case 'code':
        labels.push(cellToFilterLabel(r.code));
        break;
      case 'name':
        labels.push(cellToFilterLabel(r.name));
        break;
      case 'date':
        labels.push(cellToFilterLabel(r.date));
        break;
      case 'workDays':
        labels.push(cellToFilterLabel(r.workDays));
        break;
      case 'hours':
        labels.push(cellToFilterLabel(r.hours));
        break;
      case 'break':
        labels.push(cellToFilterLabel(r.break));
        break;
      case 'delay':
        labels.push(cellToFilterLabel(r.delay));
        break;
      case 'absence':
        labels.push(cellToFilterLabel(r.absence));
        break;
      case 'orders':
        labels.push(cellToFilterLabel(r.orders));
        break;
      case 'acceptance':
        labels.push(cellToFilterLabel(r.acceptance));
        break;
      case 'debt':
        labels.push(cellToFilterLabel(r.debt));
        break;
      default:
        break;
    }
  }
  return distinctFilterValues(labels);
}
