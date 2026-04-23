import { createMockServer } from "../server.js";
import { setup, waitForButtonColor } from "../harness.js";

/**
 * Simulates a GitHub-style SPA navigation (pushState without reload) and
 * verifies the content script re-runs against the new URL. The 500 ms poll
 * in onNavigation is what catches this case in real life — this test
 * proves the button updates for a URL change without a full document load.
 */

const FORGE_PUSHED = "2026-01-01T00:00:00Z";

describe("E2E: SPA navigation", () => {
    let mock, mockPort, ctx;

    beforeAll(async () => {
        mock = createMockServer();
        mockPort = await mock.start();
    });

    afterAll(async () => {
        await mock?.stop();
    });

    afterEach(async () => {
        await ctx?.stop();
    });

    test("pushState to a different repo re-fetches and re-renders", async () => {
        const base = `http://127.0.0.1:${mockPort}`;
        // Per-URL responses: /u/r1 → not archived (grey); /u/r2 → up-to-date (green).
        // The mock server uses one global scenario; we route by URL in the
        // intercept layer instead, keeping fixtures simple.
        const scenarioByOrigin = {
            "https://github.com/u/r1": { visit: { status: 404, body: { exception: "NotFoundExc" } } },
            "https://github.com/u/r2": {
                visit: {
                    status: 200,
                    body: {
                        origin: "https://github.com/u/r2", visit: 5,
                        date: "2026-04-10T00:00:00+00:00", status: "full",
                        snapshot: "f".repeat(40), type: "git-checkout",
                    },
                },
            },
        };

        const rules = [
            {
                urlPattern: "https://github.com/u/*",
                handler: async (req) => {
                    const m = /\/u\/(r1|r2)/.exec(req.url);
                    return proxy(`${base}/fixtures/github/u/${m?.[1] || "r1"}`);
                },
            },
            {
                urlPattern: "https://api.github.com/repos/u/*",
                handler: async () => ({
                    status: 200, contentType: "application/json",
                    body: JSON.stringify({ pushed_at: FORGE_PUSHED }),
                }),
            },
            {
                urlPattern: "https://archive.softwareheritage.org/api/1/origin/*",
                handler: async (req) => {
                    const origin = req.url.includes("/u/r2/") ? "https://github.com/u/r2" : "https://github.com/u/r1";
                    const spec = scenarioByOrigin[origin].visit;
                    return {
                        status: spec.status,
                        contentType: spec.contentType || "application/json",
                        body: typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body),
                    };
                },
            },
        ];

        ctx = await setup({ mockPort, rules });

        await ctx.page.goto("https://github.com/u/r1", { waitUntil: "domcontentloaded" });
        await waitForButtonColor(ctx.page, "grey");

        // Simulate a Turbo SPA nav: change URL without reload, then fire both
        // the popstate signal and a turbo:render event; either should wake the
        // onNavigation callback faster than the 500 ms poll.
        await ctx.page.evaluate(() => {
            history.pushState({}, "", "/u/r2");
            window.dispatchEvent(new PopStateEvent("popstate"));
            document.dispatchEvent(new CustomEvent("turbo:render"));
        });

        await waitForButtonColor(ctx.page, "green", { timeoutMs: 5000 });
    });
});

async function proxy(url, init = {}) {
    const r = await fetch(url, init);
    return {
        status: r.status,
        contentType: r.headers.get("content-type"),
        body: await r.text(),
    };
}
