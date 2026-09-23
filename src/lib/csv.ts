import type { ScanRow } from '../types';

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function scansToCsv(rows: ScanRow[]): string {
  const header = ['scanned_at', 'received_at', 'guard', 'checkpoint', 'report_note', 'report_photos'];
  const lines = rows.map((r) => [
    r.scannedAt, r.receivedAt, r.guardName, r.checkpointName, r.report?.note ?? '', String(r.report?.photos.length ?? 0),
  ].map(cell).join(','));
  // BOM so Excel opens UTF-8 names correctly
  return '\uFEFF' + [header.join(','), ...lines].join('\n');
}
