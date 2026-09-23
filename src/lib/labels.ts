import QRCode from 'qrcode';
import type { Checkpoint } from '../types';

export const qrImage = (payload: string) =>
  QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 480 });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A standalone A4 page of cut-out labels, opened and printed from any browser. */
export function labelsDocument(items: { cp: Checkpoint; img: string }[]): string {
  const labels = items.map(({ cp, img }) => `
    <div class="label">
      <img src="${img}" alt="">
      <p class="name">${esc(cp.name)}</p>
      <p class="code">${esc(cp.manualCode)}</p>
    </div>`).join('');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Label titik patroli</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, sans-serif; margin: 0; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .label { border: 1px dashed #888; padding: 5mm; text-align: center; break-inside: avoid; }
  .label img { width: 55mm; height: 55mm; }
  .name { font-size: 13pt; font-weight: 700; margin: 3mm 0 1mm; }
  .code { font-size: 16pt; letter-spacing: 2px; margin: 0; font-variant-numeric: tabular-nums; }
</style></head><body><div class="sheet">${labels}</div></body></html>`;
}
