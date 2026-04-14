export function memoizeWithTTL(fn, { ttlMs = 60_000, now = () => Date.now() } = {}) {
    const cache = new Map();
    const inflight = new Map();

    const api = async (key, ...args) => {
        const hit = cache.get(key);
        if (hit && now() - hit.at < ttlMs) return hit.value;

        const existing = inflight.get(key);
        if (existing) return existing;

        const promise = (async () => {
            try {
                const value = await fn(key, ...args);
                cache.set(key, { at: now(), value });
                return value;
            } finally {
                inflight.delete(key);
            }
        })();
        inflight.set(key, promise);
        return promise;
    };

    api.clear = () => { cache.clear(); inflight.clear(); };
    api.invalidate = (key) => { cache.delete(key); };
    api.size = () => cache.size;

    return api;
}
