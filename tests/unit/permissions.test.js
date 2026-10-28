import {
    originPattern,
    domainPatterns,
    hasOrigins,
    openOptionsPage,
    requestOrigins,
    removeOrigins,
    listGrantedOrigins,
} from "../../src/permissions.js";

/* ── stub chrome.permissions ── */

function stubPermissions(granted = []) {
    const state = new Set(granted);
    globalThis.chrome = {
        permissions: {
            contains: ({ origins }, cb) => cb(origins.every((o) => state.has(o))),
            request:  ({ origins }, cb) => { origins.forEach((o) => state.add(o)); cb(true); },
            remove:   ({ origins }, cb) => { origins.forEach((o) => state.delete(o)); cb(true); },
            getAll:   (cb) => cb({ origins: [...state] }),
        },
    };
    return state;
}

afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.browser;
});

/* ── pattern helpers ── */

describe("originPattern", () => {
    test("wraps a domain into a match-pattern", () => {
        expect(originPattern("github.com")).toBe("*://github.com/*");
    });
});

describe("domainPatterns", () => {
    test("maps a list of domains", () => {
        expect(domainPatterns(["a.org", "b.io"])).toEqual([
            "*://a.org/*",
            "*://b.io/*",
        ]);
    });
});

/* ── permission queries ── */

describe("hasOrigins", () => {
    test("returns true when all origins are granted", async () => {
        stubPermissions(["*://github.com/*"]);
        expect(await hasOrigins("*://github.com/*")).toBe(true);
    });

    test("returns false when an origin is missing", async () => {
        stubPermissions([]);
        expect(await hasOrigins("*://github.com/*")).toBe(false);
    });

    test("accepts an array of origins", async () => {
        stubPermissions(["*://github.com/*", "*://gitlab.com/*"]);
        expect(await hasOrigins(["*://github.com/*", "*://gitlab.com/*"])).toBe(true);
    });

    test("returns false when api is unavailable", async () => {
        expect(await hasOrigins("*://github.com/*")).toBe(false);
    });

    test("falls back to runtime.sendMessage when permissions API is absent", async () => {
        // Simulate content-script context: no chrome.permissions, but runtime exists
        const sendMessage = jest.fn((_msg, cb) => cb({ granted: true }));
        globalThis.chrome = { runtime: { sendMessage } };
        expect(await hasOrigins("*://github.com/*")).toBe(true);
        expect(sendMessage).toHaveBeenCalledWith(
            { type: "CHECK_PERMISSION", origins: ["*://github.com/*"] },
            expect.any(Function),
        );
    });
});

/* ── openOptionsPage ── */

describe("openOptionsPage", () => {
    test("sends OPEN_OPTIONS message via runtime", () => {
        const sendMessage = jest.fn();
        globalThis.chrome = { runtime: { sendMessage } };
        openOptionsPage();
        expect(sendMessage).toHaveBeenCalledWith({ type: "OPEN_OPTIONS" });
    });
});

/* ── permission mutations ── */

describe("requestOrigins", () => {
    test("adds origins and resolves true", async () => {
        const state = stubPermissions([]);
        expect(await requestOrigins(["*://github.com/*"])).toBe(true);
        expect(state.has("*://github.com/*")).toBe(true);
    });
});

describe("removeOrigins", () => {
    test("removes origins and resolves true", async () => {
        const state = stubPermissions(["*://github.com/*"]);
        expect(await removeOrigins(["*://github.com/*"])).toBe(true);
        expect(state.has("*://github.com/*")).toBe(false);
    });
});

describe("listGrantedOrigins", () => {
    test("returns currently granted origins", async () => {
        stubPermissions(["*://github.com/*", "*://gitlab.com/*"]);
        const list = await listGrantedOrigins();
        expect(list).toEqual(expect.arrayContaining(["*://github.com/*", "*://gitlab.com/*"]));
    });

    test("returns empty array when api is unavailable", async () => {
        expect(await listGrantedOrigins()).toEqual([]);
    });
});
