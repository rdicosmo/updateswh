import {
    originPattern,
    domainPatterns,
    hasOrigins,
    openOptionsPage,
    requestOrigins,
    removeOrigins,
    listGrantedOrigins,
    registerContentScript,
    unregisterContentScript,
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
        scripting: {
            registerContentScripts:   jest.fn().mockResolvedValue(undefined),
            unregisterContentScripts: jest.fn().mockResolvedValue(undefined),
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

/* ── dynamic content script registration ── */

describe("registerContentScript (MV3 path)", () => {
    test("calls chrome.scripting.registerContentScripts", async () => {
        stubPermissions();
        await registerContentScript("custom-forge-1", ["*://example.com/*"]);
        expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith([{
            id: "custom-forge-1",
            matches: ["*://example.com/*"],
            js:  ["updateswh.js"],
            css: ["css/updateswh.css"],
            runAt: "document_idle",
        }]);
    });
});

describe("unregisterContentScript (MV3 path)", () => {
    test("calls chrome.scripting.unregisterContentScripts", async () => {
        stubPermissions();
        await unregisterContentScript("custom-forge-1", null);
        expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: ["custom-forge-1"] });
    });
});

describe("registerContentScript (MV2 Firefox path)", () => {
    test("calls browser.contentScripts.register", async () => {
        const mockRegister = jest.fn().mockResolvedValue({ unregister: jest.fn() });
        globalThis.browser = { contentScripts: { register: mockRegister } };
        await registerContentScript("custom-forge-1", ["*://example.com/*"]);
        expect(mockRegister).toHaveBeenCalledWith({
            matches: ["*://example.com/*"],
            js:  [{ file: "updateswh.js" }],
            css: [{ file: "css/updateswh.css" }],
            runAt: "document_idle",
        });
    });
});

describe("unregisterContentScript (MV2 Firefox path)", () => {
    test("calls handle.unregister()", async () => {
        const handle = { unregister: jest.fn().mockResolvedValue(undefined) };
        await unregisterContentScript("ignored-id", handle);
        expect(handle.unregister).toHaveBeenCalled();
    });
});
