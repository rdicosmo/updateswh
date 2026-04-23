import { setup, waitForButtonColor } from "../harness.js";

/**
 * LIVE end-to-end smoke: runs the real built extension against real
 * api.github.com and real archive.softwareheritage.org, with no Fetch
 * intercepts.  Target: https://github.com/rdicosmo/parmap — verified
 * fully archived, so the expected outcome is the green button.
 *
 * Also observes (via Network domain, non-blocking) the outgoing SWH
 * request headers so we can prove the Accept + X-UpdateSWH-Client tags
 * make it onto the wire.  If Nicolas's Anubis allow-list keys off
 * those headers correctly, the button is green; if it doesn't, it's
 * blue (bot-challenge page returned instead of JSON).
 *
 * Gated behind E2E_LIVE=1 so CI and the default `npm run test:e2e`
 * skip it — live tests depend on third-party services and GitHub
 * rate-limits, so they're opt-in.
 *
 *   E2E_LIVE=1 npm run test:e2e -- --testPathPattern=live-swh
 */

const RUN_LIVE = !!process.env.E2E_LIVE;
const describeLive = RUN_LIVE ? describe : describe.skip;

describeLive("E2E (live): rdicosmo/parmap against real SWH + GitHub", () => {
    let ctx;

    afterEach(async () => {
        await ctx?.stop();
    });

    // Headless Chromium's default UA contains "HeadlessChrome", which the
    // SWH Anubis proxy flags as a bot and answers with a JS challenge
    // page — so the test would always go blue even when the extension is
    // working correctly. Use a normal Chrome UA to validate the real-user
    // code path. (Anubis should allow-list updateSWH traffic by
    // X-UpdateSWH-Client regardless of UA — that's server-side work
    // outside this test.)
    const REAL_CHROME_UA =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

    test("button renders green (archive is up to date)", async () => {
        ctx = await setup({ mockPort: 0, rules: [], userAgent: REAL_CHROME_UA });

        // Observe — not intercept — outgoing SWH requests from the SW,
        // so we can assert the identifying headers are on the wire.
        const swhRequests = [];
        await ctx.swCdp.send("Network.enable");
        ctx.swCdp.on("Network.requestWillBeSent", (e) => {
            if (e.request.url.includes("archive.softwareheritage.org")) {
                swhRequests.push({ url: e.request.url, headers: e.request.headers });
            }
        });
        const swhResponses = [];
        ctx.swCdp.on("Network.responseReceived", (e) => {
            if (e.response.url.includes("archive.softwareheritage.org")) {
                swhResponses.push({
                    url: e.response.url,
                    status: e.response.status,
                    contentType: e.response.headers?.["content-type"] || e.response.mimeType,
                });
            }
        });

        await ctx.page.goto("https://github.com/rdicosmo/parmap", { waitUntil: "domcontentloaded" });

        try {
            await waitForButtonColor(ctx.page, "green", { timeoutMs: 20_000 });
        } catch (e) {
            const btn = await ctx.page.evaluate(() => {
                const el = document.querySelector(".swh-save-button");
                return el ? { classes: Array.from(el.classList), title: el.getAttribute("title") } : null;
            });
            console.log("[live] button state:", JSON.stringify(btn, null, 2));
            console.log("[live] SWH requests:", JSON.stringify(swhRequests, null, 2));
            console.log("[live] SWH responses:", JSON.stringify(swhResponses, null, 2));
            throw e;
        }

        expect(swhRequests.length).toBeGreaterThan(0);
        const h = lowerKeys(swhRequests[0].headers);
        expect(h["accept"]).toBe("application/json");
        expect(h["x-updateswh-client"]).toMatch(/^updateSWH\/\d+\.\d+\.\d+$/);
        console.log("[live] OK — button green; SWH headers confirmed on wire:");
        console.log("       Accept:             ", h["accept"]);
        console.log("       X-UpdateSWH-Client: ", h["x-updateswh-client"]);
        console.log("       User-Agent:         ", h["user-agent"]);
    }, 30_000);
});

function lowerKeys(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
    return out;
}
