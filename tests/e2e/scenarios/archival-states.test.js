import { createMockServer } from "../server.js";
import { setup, waitForButtonColor, defaultRules } from "../harness.js";

/**
 * Covers the eight colour states the initial render can produce, each
 * driven by mock forge + SWH responses. Save-click transitions live in
 * save-click.test.js.
 *
 * Colour map (see src/constants.js):
 *   green  UP_TO_DATE       SWH visit.full, date >= forge.pushed_at
 *   yellow OUT_OF_DATE      SWH visit.full, date <  forge.pushed_at
 *   brown  FAILED_UPDATE    SWH visit.status !== "full"
 *   grey   NOT_ARCHIVED     SWH visit/latest 404
 *   orange API_LIMIT        SWH visit/latest 403
 *   red    FORGE_API_ERROR  forge API 5xx (or any non-403)
 *   blue   SWH_UNREACHABLE  SWH visit/latest 200 + text/html (bot-challenge)
 *                        or SWH visit/latest never responds (SW timeout)
 */

const VISIT_DATE_LATE  = "2026-04-01T00:00:00+00:00"; // after forge pushed_at below
const VISIT_DATE_EARLY = "2025-06-01T00:00:00+00:00"; // before forge pushed_at below
const FORGE_PUSHED_AT  = "2026-01-01T00:00:00Z";

function visit(overrides = {}) {
    return {
        origin: "https://github.com/u/r",
        visit: 42,
        date: VISIT_DATE_LATE,
        status: "full",
        snapshot: "deadbeef".padEnd(40, "0"),
        type: "git-checkout",
        ...overrides,
    };
}

describe("E2E archival states", () => {
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

    async function navigate(scenario) {
        mock.setScenario(scenario);
        ctx = await setup({ mockPort, rules: defaultRules(`http://127.0.0.1:${mockPort}`) });
        await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });
    }

    async function tooltip() {
        return ctx.page.$eval(".swh-save-button", (el) => el.getAttribute("title"));
    }

    test("green: archive up to date", async () => {
        await navigate({
            forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            swhVisit: { status: 200, body: visit({ date: VISIT_DATE_LATE, status: "full" }) },
        });
        await waitForButtonColor(ctx.page, "green");
        expect(await tooltip()).toMatch(/up to date/i);
    });

    test("yellow: archive out of date (forge newer than last visit)", async () => {
        await navigate({
            forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            swhVisit: { status: 200, body: visit({ date: VISIT_DATE_EARLY, status: "full" }) },
        });
        await waitForButtonColor(ctx.page, "yellow");
        expect(await tooltip()).toMatch(/not current/i);
    });

    test("brown: last archival attempt failed (visit.status !== 'full')", async () => {
        await navigate({
            forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            swhVisit: { status: 200, body: visit({ status: "failed" }) },
        });
        await waitForButtonColor(ctx.page, "brown");
        expect(await tooltip()).toMatch(/failed/i);
    });

    test("grey: origin not archived (SWH 404)", async () => {
        await navigate({
            forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            swhVisit: { status: 404, body: { exception: "NotFoundExc" } },
        });
        await waitForButtonColor(ctx.page, "grey");
        expect(await tooltip()).toMatch(/not.*archived|trigger archival/i);
    });

    test("orange: SWH API rate-limit (403)", async () => {
        await navigate({
            forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            swhVisit: { status: 403, body: { exception: "QuotaExceeded" } },
        });
        await waitForButtonColor(ctx.page, "orange");
        expect(await tooltip()).toMatch(/quota|maintenance/i);
    });

    test("red: forge API failure (500)", async () => {
        await navigate({
            forge: { status: 500, body: { message: "server error" } },
            swhVisit: { status: 200, body: visit() },
        });
        await waitForButtonColor(ctx.page, "red");
        expect(await tooltip()).toMatch(/could not get information/i);
    });

    test("blue: SWH behind a bot-challenge (200 + text/html)", async () => {
        await navigate({
            forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            swhVisit: {
                status: 200,
                contentType: "text/html; charset=utf-8",
                body: "<!doctype html><html><body>anubis challenge — enable JavaScript to continue…</body></html>",
            },
        });
        await waitForButtonColor(ctx.page, "blue");
        expect(await tooltip()).toMatch(/bot-challenge|archive\.softwareheritage\.org/i);
    });

    test(
        "blue: SWH unreachable by background-message timeout (~15s)",
        async () => {
            // The rule never fulfils the SWH fetch → the background fetch hangs
            // → the content-script sendMessageWithTimeout fires at 15 s and the
            // fetchSwhLatestVisit catch maps the rejection to SWH_UNREACHABLE.
            const base = `http://127.0.0.1:${mockPort}`;
            const rules = defaultRules(base);
            rules[2] = {
                urlPattern: "https://archive.softwareheritage.org/api/1/origin/*",
                handler: async () => null, // null = passthrough; CDP will continueRequest
            };
            mock.setScenario({
                forge: { status: 200, body: { pushed_at: FORGE_PUSHED_AT } },
            });
            // Passthrough would hit the real archive; swap to a handler that
            // hangs instead (never resolves).
            rules[2].handler = () => new Promise(() => {});
            ctx = await setup({ mockPort, rules });
            await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });
            await waitForButtonColor(ctx.page, "blue", { timeoutMs: 20_000 });
            expect(await tooltip()).toMatch(/bot-challenge|archive\.softwareheritage\.org/i);
        },
        30_000,
    );
});
