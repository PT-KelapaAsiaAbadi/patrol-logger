import { useState } from 'preact/hooks';
import { useApp } from '../state';
import { isSimulatedOffline, setSimulatedOffline } from '../data/network';
import { resetEverything } from '../data/api';

/** Controls that only exist in the prototype. Delete this component for production. */
export function PrototypeBar() {
  const { t, lang, setLang, setUser } = useApp();
  const [offline, setOffline] = useState(isSimulatedOffline);

  return (
    <div class="proto-bar">
      <span class="text-muted">{t('prototypeNote')}</span>
      <label class="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={offline}
          onChange={(e) => { const v = e.currentTarget.checked; setSimulatedOffline(v); setOffline(v); }}
        />
        {t('simulateOffline')}
      </label>
      <button
        type="button"
        class="link-btn"
        onClick={() => {
          if (!confirm(t('resetConfirm'))) return;
          resetEverything();
          setUser(null);
          location.hash = '#/login';
        }}
      >
        {t('resetData')}
      </button>
      <span class="ml-auto inline-flex" role="group" aria-label="Language">
        {(['id', 'en'] as const).map((l) => (
          <button key={l} type="button" class="lang-btn" aria-pressed={lang === l} onClick={() => setLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </span>
    </div>
  );
}
