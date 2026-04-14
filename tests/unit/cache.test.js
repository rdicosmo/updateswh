import { memoizeWithTTL } from "../../src/utils/cache.js";

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe("memoizeWithTTL", () => {
    test("calls fn once per key within TTL", async () => {
        const fn = jest.fn(async (k) => `v:${k}`);
        const memo = memoizeWithTTL(fn, { ttlMs: 60_000 });

        expect(await memo("a")).toBe("v:a");
        expect(await memo("a")).toBe("v:a");
        expect(await memo("a")).toBe("v:a");
        expect(fn).toHaveBeenCalledTimes(1);

        expect(await memo("b")).toBe("v:b");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test("re-fetches after TTL expires", async () => {
        let nowValue = 1000;
        const fn = jest.fn(async (k) => `v:${k}:${nowValue}`);
        const memo = memoizeWithTTL(fn, { ttlMs: 1000, now: () => nowValue });

        expect(await memo("a")).toBe("v:a:1000");
        nowValue = 1500;
        expect(await memo("a")).toBe("v:a:1000");
        expect(fn).toHaveBeenCalledTimes(1);

        nowValue = 2500;
        expect(await memo("a")).toBe("v:a:2500");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test("dedupes concurrent calls for the same key (inflight)", async () => {
        const d = deferred();
        const fn = jest.fn(() => d.promise);
        const memo = memoizeWithTTL(fn, { ttlMs: 60_000 });

        const p1 = memo("a");
        const p2 = memo("a");
        const p3 = memo("a");

        expect(fn).toHaveBeenCalledTimes(1);

        d.resolve("done");
        const results = await Promise.all([p1, p2, p3]);
        expect(results).toEqual(["done", "done", "done"]);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test("inflight map is cleared on rejection, allowing retry", async () => {
        let attempt = 0;
        const fn = jest.fn(() => {
            attempt += 1;
            if (attempt === 1) return Promise.reject(new Error("boom"));
            return Promise.resolve("ok");
        });
        const memo = memoizeWithTTL(fn, { ttlMs: 60_000 });

        await expect(memo("a")).rejects.toThrow("boom");
        expect(await memo("a")).toBe("ok");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test("clear() drops both cache and inflight", async () => {
        const fn = jest.fn(async (k) => `v:${k}`);
        const memo = memoizeWithTTL(fn, { ttlMs: 60_000 });
        await memo("a");
        expect(memo.size()).toBe(1);
        memo.clear();
        expect(memo.size()).toBe(0);
        await memo("a");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test("invalidate(key) forces next call to re-fetch that key only", async () => {
        const fn = jest.fn(async (k) => `v:${k}`);
        const memo = memoizeWithTTL(fn, { ttlMs: 60_000 });
        await memo("a");
        await memo("b");
        memo.invalidate("a");
        await memo("a");
        await memo("b");
        expect(fn).toHaveBeenCalledTimes(3);
    });
});
