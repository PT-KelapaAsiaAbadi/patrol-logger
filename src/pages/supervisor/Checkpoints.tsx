import { useState } from 'preact/hooks';
import { useApp } from '../../state';
import { useAsync } from '../../hooks';
import * as api from '../../data/api';
import { labelsDocument, qrImage } from '../../lib/labels';
import { saveFile } from '../../lib/download';
import { LoadError } from './Log';

export function Checkpoints() {
  const { t } = useApp();
  const [saved, setSaved] = useState(false);
  const labels = useAsync(async () => {
    const cps = await api.allCheckpoints();
    return Promise.all(cps.map(async (cp) => ({ cp, img: await qrImage(await api.qrPayloadFor(cp.id)) })));
  }, []);

  async function download() {
    if (!labels.data) return;
    setSaved((await saveFile('label-titik-patroli.html', labelsDocument(labels.data), 'text/html')) === 'saved');
  }

  return (
    <>
      <h1 class="text-xl font-bold">{t('navCheckpoints')}</h1>
      <p class="mt-2 max-w-prose text-muted">{t('qrIntro')}</p>
      <div class="flex items-center gap-3 mt-4">
        <button type="button" class="btn btn-quiet" disabled={!labels.data} onClick={() => void download()}>{t('downloadLabels')}</button>
        {saved && <span class="text-muted" role="status">{t('downloaded')}</span>}
      </div>

      {labels.error && <div class="mt-4"><LoadError onRetry={labels.reload} /></div>}
      {labels.loading && <p class="mt-6 text-muted">{t('loading')}</p>}
      {labels.data && (
        <ul class="sticker-grid mt-6">
          {labels.data.map(({ cp, img }) => (
            <li key={cp.id} class="sticker">
              <img src={img} alt={`QR ${cp.name}`} />
              <p class="sticker-name">{cp.name}</p>
              <p class="sticker-code">{cp.manualCode}</p>
              <p class="sticker-order">{t('routeOrder', { n: cp.routeOrder })}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
