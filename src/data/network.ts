/** Online/offline state, straight from the browser. */
type Listener = () => void;

export const isOnline = () => navigator.onLine;

export function onNetworkChange(l: Listener): () => void {
	window.addEventListener("online", l);
	window.addEventListener("offline", l);
	return () => {
		window.removeEventListener("online", l);
		window.removeEventListener("offline", l);
	};
}
