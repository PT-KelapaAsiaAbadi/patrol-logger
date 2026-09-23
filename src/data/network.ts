/**
 * Online/offline state. Real signal comes from the browser;
 * the "simulate" switch exists only so the prototype can demo offline scanning.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let simulatedOffline = false;

export const isOnline = () => navigator.onLine && !simulatedOffline;
export const isSimulatedOffline = () => simulatedOffline;

export function setSimulatedOffline(v: boolean) {
  simulatedOffline = v;
  listeners.forEach((l) => l());
}

export function onNetworkChange(l: Listener): () => void {
  listeners.add(l);
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
}
