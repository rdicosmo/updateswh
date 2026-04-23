import { createMockServer } from "../server.js";
import { setup, waitForButtonColor, defaultRules } from "../harness.js";

/**
 * Save-click flows. Each test starts from an archive-not-up-to-date state
 * (grey), clicks the button, then waits for the resulting colour:
 *   - SWH save accepted           → lightgreen, tooltip linking to save list
 *   - SWH save returns challenge  → blue, tooltip pointing to the archive
 *   - SWH save plain 5xx          → red, generic "archival failed" tooltip
 */

const FORGE = { status: 200, body: { pushed_at: "2026-01-01T00:00:00Z" } };
const NOT_ARCHIVED = { status: 404, body: { exception: "NotFoundExc" } };

describe("E2E save-click", () => {
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

    async function startGreyThenClick(swhSave) {
        mock.setScenario({ forge: FORGE, swhVisit: NOT_ARCHIVED, swhSave });
        ctx = await setup({ mockPort, rules: defaultRules(`http://127.0.0.1:${mockPort}`) });
        await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });
        await waitForButtonColor(ctx.page, "grey");
        await ctx.page.click(".swh-save-button");
    }

    async function tooltip() {
        return ctx.page.$eval(".swh-save-button", (el) => el.getAttribute("title"));
    }

    async function anchorHref() {
        return ctx.page.$eval(".swh-save-button", (el) => el.parentElement?.tagName === "A"
            ? el.parentElement.getAttribute("href")
            : null);
    }

    test("save accepted → lightgreen + save-list anchor", async () => {
        await startGreyThenClick({
            status: 200,
            body: { id: 1, save_request_status: "accepted", save_task_status: "pending" },
        });
        await waitForButtonColor(ctx.page, "lightgreen");
        expect(await tooltip()).toMatch(/update requested/i);
        expect(await anchorHref()).toBe("https://archive.softwareheritage.org/save/list/");
    });

    test("save hits bot-challenge → blue + archive-home anchor", async () => {
        await startGreyThenClick({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: "<!doctype html><html><body>anubis challenge</body></html>",
        });
        await waitForButtonColor(ctx.page, "blue");
        expect(await tooltip()).toMatch(/bot-challenge|archive\.softwareheritage\.org/i);
        expect(await anchorHref()).toBe("https://archive.softwareheritage.org/");
    });

    test("save fails with HTTP 500 → red + help-page anchor", async () => {
        await startGreyThenClick({
            status: 500,
            body: { exception: "InternalServerError" },
        });
        await waitForButtonColor(ctx.page, "red");
        expect(await tooltip()).toMatch(/archival failed/i);
        expect(await anchorHref()).toMatch(/browser-extension|updateswh-/);
    });
});
