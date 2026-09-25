import { useCallback, useEffect, useState } from "preact/hooks";
import { isOnline, onNetworkChange } from "./data/network";
import { onOutboxChange, outboxItems, rejectedCount } from "./data/api";

/** Runs an async loader and tracks loading/error. Re-runs when `deps` change or `reload()` is called. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
	const [state, setState] = useState<{
		data: T | null;
		error: boolean;
		loading: boolean;
	}>({ data: null, error: false, loading: true });
	const [tick, setTick] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setState((s) => ({ ...s, loading: true, error: false }));
		load()
			.then((data) => {
				if (!cancelled)
					setState({ data, error: false, loading: false });
			})
			.catch(() => {
				if (!cancelled)
					setState((s) => ({ ...s, error: true, loading: false }));
			});
		return () => {
			cancelled = true;
		};
	}, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps

	const reload = useCallback(() => setTick((n) => n + 1), []);
	return { ...state, reload };
}

export function useOnline(): boolean {
	const [online, setOnline] = useState(isOnline);
	useEffect(() => onNetworkChange(() => setOnline(isOnline())), []);
	return online;
}

export function useOutbox() {
	const read = () => ({ items: outboxItems(), rejected: rejectedCount() });
	const [state, setState] = useState(read);
	useEffect(() => onOutboxChange(() => setState(read())), []);
	return state;
}
