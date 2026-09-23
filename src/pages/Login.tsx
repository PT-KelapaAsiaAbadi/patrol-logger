import { useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { useApp } from '../state';
import * as api from '../data/api';

export function Login() {
  const { t, setUser } = useApp();
  const [, navigate] = useLocation();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(staffCode: string, p: string) {
    setBusy(true);
    setError(false);
    const user = await api.signIn(staffCode, p);
    setBusy(false);
    if (!user) { setError(true); return; }
    setUser(user);
    navigate(user.role === 'supervisor' ? '/supervisor' : '/');
  }

  return (
    <main class="mx-auto w-full max-w-sm px-5 pt-10 pb-12">
      <h1 class="text-2xl font-bold mb-6">{t('signInTitle')}</h1>

      <form
        class="grid gap-4"
        onSubmit={(e) => { e.preventDefault(); void submit(code, pin); }}
      >
        <label class="grid gap-1">
          <span class="font-medium">{t('staffCode')}</span>
          <input class="field" autoComplete="username" autoCapitalize="none" required
            value={code} onInput={(e) => setCode(e.currentTarget.value)} />
        </label>
        <label class="grid gap-1">
          <span class="font-medium">{t('pin')}</span>
          <input class="field tabular-nums" type="password" inputMode="numeric" autoComplete="current-password" required
            value={pin} onInput={(e) => setPin(e.currentTarget.value)} />
        </label>
        {error && <p class="notice notice-warn" role="alert">{t('signInError')}</p>}
        <button class="btn btn-primary btn-lg" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button>
      </form>

      <section class="mt-10">
        <h2 class="font-semibold mb-2">{t('demoAccounts')}</h2>
        <ul class="divide-y divide-line border-y border-line">
          {api.demoAccounts().map(({ user, pin: p }) => (
            <li key={user.id}>
              <button type="button" class="w-full flex justify-between gap-3 py-3 text-left hover:bg-sunken px-1"
                disabled={busy} onClick={() => void submit(user.staffCode, p)}>
                <span>{user.name}</span>
                <span class="text-muted">{t(user.role === 'guard' ? 'guardRole' : 'supervisorRole')}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
