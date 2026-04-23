import { createMockServer } from "../server.js";
import { setup, waitForButtonColor, defaultRules } from "../harness.js";

/**
 * Verifies the extension tags every SWH API call with identifying
 * headers so the SWH side can allow-list updateSWH traffic through
 * bot filters (Anubis) without the JS-challenge interstitial, and can
 * distinguish extension requests from human browser requests in logs.
 *
 * Expected headers on every FETCH_SWH_API call:
 *   Accept: application/json
 *   X-UpdateSWH-Client: updateSWH/<manifest-version>
 *   User-Agent: updateSWH/<version> (+<homepage>)
 *                 ↑ MV3 Chromium may silently replace this; we still send it.
 *
 * Asserted on GET /visit/latest/ and POST /save/git/url/ paths.
 */

describe("E2E: SWH API request headers", () => {
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

    test("GET visit/latest + POST save include Accept + X-UpdateSWH-Client", async () => {
        mock.setScenario({
            forge: { status: 200, body: { pushed_at: "2026-01-01T00:00:00Z" } },
            swhVisit: { status: 404, body: { exception: "NotFoundExc" } },
            swhSave: {
                status: 200,
                body: { save_request_status: "accepted", save_task_status: "pending" },
            },
        });

        // Stash every SWH request for assertion.
        const swhRequests = [];
        const base = `http://127.0.0.1:${mockPort}`;
        const rules = defaultRules(base);
        rules[2] = {
            urlPattern: "https://archive.softwareheritage.org/api/1/origin/*",
            handler: async (req) => {
                swhRequests.push({ method: req.method, url: req.url, headers: req.headers });
                const isSave = req.url.includes("/save/");
                const mockPath = isSave ? "/swh/origin/save/" : "/swh/origin/visit/latest/";
                const r = await fetch(`${base}${mockPath}`, { method: isSave ? "POST" : "GET" });
                return {
                    status: r.status,
                    contentType: r.headers.get("content-type"),
                    body: await r.text(),
                };
            },
        };

        ctx = await setup({ mockPort, rules });
        await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });

        await waitForButtonColor(ctx.page, "grey");
        await ctx.page.click(".swh-save-button");
        await waitForButtonColor(ctx.page, "lightgreen");

        const get  = swhRequests.find((r) => r.method === "GET"  && r.url.endsWith("/visit/latest/"));
        const post = swhRequests.find((r) => r.method === "POST" && r.url.includes("/save/"));

        expect(get).toBeDefined();
        expect(post).toBeDefined();

        // CDP request.headers keys are case-preserved in Chromium; the content
        // script's Accept from forgeAuthHeaders is merged in too. Compare
        // lower-case to be robust across Chromium versions.
        for (const req of [get, post]) {
            const h = lowerKeys(req.headers);
            expect(h["accept"]).toBe("application/json");
            expect(h["x-updateswh-client"]).toMatch(/^updateSWH\/\d+\.\d+\.\d+$/);
        }
    });
});

function lowerKeys(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
    return out;
}
