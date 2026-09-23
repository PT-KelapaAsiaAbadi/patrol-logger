import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useCallback, useContext, useState } from 'preact/hooks';
import { translate, type Key, type Lang } from './i18n';
import * as api from './data/api';
import type { User } from './types';

interface AppState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  user: User | null;
  setUser: (u: User | null) => void;
}

const Ctx = createContext<AppState | null>(null);
const LANG_KEY = 'patrol-lang';

function initialLang(): Lang {
  try { const v = localStorage.getItem(LANG_KEY); if (v === 'id' || v === 'en') return v; } catch { /* ignore */ }
  return 'id';
}

export function AppProvider({ children }: { children: ComponentChildren }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [user, setUser] = useState<User | null>(api.currentUser);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  return <Ctx.Provider value={{ lang, setLang, t, user, setUser }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
