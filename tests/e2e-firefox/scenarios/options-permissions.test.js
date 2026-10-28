import { createProxy, FORGE_HOST } from "../server.js";
import { setup, waitFor } from "../harness.js";

/**
 * Options-page permission flows in Firefox, driven by real clicks.
 *
 * Firefox rejects permissions.request unless it runs synchronously inside
 * a user-input handler, so "Add as ...", "Enable all forges" and "Grant
 * and import" must request before any storage callback. The Chromium
 * suite cannot catch a regression here: Chrome keeps the gesture alive
 * across those callbacks.
 *
 * The custom-forge cases also load a forge page, which covers the
 * background script's content-script injection under MV2.
 */

const FORGE_ORIGIN = `*://${FORGE_HOST}/*`;
const REPO_URL = `http://${FORGE_HOST}/u/r`;

describe("E2E Firefox: options-page permissions", () => {
    let proxy, proxyPort, ctx;

    beforeAll(async () => {
        proxy = createProxy();
        proxyPort = await proxy.start();
    });

    afterAll(async () => {
        await proxy?.stop();
    });

    beforeEach(async () => {
        proxy.requests.length = 0;
        ctx = await setup({ proxyPort });
    });

    afterEach(async () => {
        await ctx?.stop();
    });

    const customForges = async () => (await ctx.stored()).customForges || [];

    test("Add as Gitea grants the domain, stores it and injects on its pages", async () => {
        await ctx.page.type("#custom-forge-domain", FORGE_HOST);
        await ctx.page.click("#add-gitea-btn");

        expect(await waitFor(() => ctx.hasOrigin(FORGE_ORIGIN))).toBe(true);
        expect(await waitFor(async () => (await customForges()).length > 0 && customForges()))
            .toEqual([{ domain: FORGE_HOST, type: "gitea" }]);
        expect(await ctx.status()).toBe(`Added ${FORGE_HOST} as Gitea.`);
        expect(await ctx.page.$$eval(".forge-domain", (els) => els.map((e) => e.textContent)))
            .toContain(FORGE_HOST);

        // The forge API answers from the fixture and the background's SWH
        // lookup fails at the refused CONNECT, which the content script
        // reports as not archived.
        expect(await ctx.buttonOn(REPO_URL)).toBe("swh-save-button grey");
        expect(proxy.requests).toContainEqual({ method: "GET", host: FORGE_HOST, path: "/api/v1/repos/u/r" });
        expect(proxy.requests).toContainEqual({ method: "CONNECT", host: "archive.softwareheritage.org:443", path: "" });
    });

    test("adding a listed domain reports it and stores nothing", async () => {
        await ctx.seed({ customForges: [{ domain: FORGE_HOST, type: "gitea" }], customForgeOrigins: [FORGE_ORIGIN] });
        await ctx.page.type("#custom-forge-domain", FORGE_HOST);
        await ctx.page.click("#add-gitlab-btn");

        expect(await waitFor(async () => (await ctx.status()) || null))
            .toBe(`${FORGE_HOST} is already in the list.`);
        expect(await customForges()).toEqual([{ domain: FORGE_HOST, type: "gitea" }]);
    });

    test("an invalid domain is rejected before any request", async () => {
        await ctx.page.type("#custom-forge-domain", "not a domain");
        await ctx.page.click("#add-gitea-btn");

        expect(await waitFor(async () => (await ctx.status()) || null))
            .toBe("Please enter a valid domain (e.g. git.example.org).");
        expect(await customForges()).toEqual([]);
    });

    test("Add on pre-0.9 storage migrates the old list and keeps it", async () => {
        await ctx.seed({ gitlabs: "gitlab.inria.fr", giteas: "" }, { remove: ["customForges", "customForgeOrigins"] });
        expect(await customForges()).toEqual([{ domain: "gitlab.inria.fr", type: "gitlab" }]);

        await ctx.page.type("#custom-forge-domain", FORGE_HOST);
        await ctx.page.click("#add-gitea-btn");

        expect(await waitFor(async () => (await customForges()).length === 2 && customForges())).toEqual([
            { domain: "gitlab.inria.fr", type: "gitlab" },
            { domain: FORGE_HOST, type: "gitea" },
        ]);
        const all = await ctx.stored();
        expect(all).not.toHaveProperty("gitlabs");
        expect(all).not.toHaveProperty("giteas");
    });

    test("Enable all forges grants built-in, API and custom origins", async () => {
        await ctx.seed({ customForges: [{ domain: FORGE_HOST, type: "gitea" }], customForgeOrigins: [FORGE_ORIGIN] });
        await ctx.page.click("#grant-all-btn");

        expect(await waitFor(async () => (await ctx.status()) || null)).toBe("All forge permissions granted.");
        for (const origin of ["*://github.com/*", "*://api.github.com/*", "*://codeberg.org/*", FORGE_ORIGIN]) {
            expect([origin, await ctx.hasOrigin(origin)]).toEqual([origin, true]);
        }
        expect(await ctx.hasOrigin("<all_urls>")).toBe(false);
        expect(await ctx.page.$eval("#permissions-status", (e) => e.textContent))
            .toMatch(/^(\d+) \/ \1 forges enabled\.$/);
    });

    test("Grant and import merges into the list, keeping existing entries", async () => {
        await ctx.seed({ customForges: [{ domain: "example.org", type: "gitlab" }], customForgeOrigins: ["*://example.org/*"] });
        // Stands in for the file picker, which BiDi cannot drive.
        await ctx.page.evaluate((host) => showImportPreview([
            { domain: host, type: "gitea" },
            { domain: "example.org", type: "gitea" },
        ]), FORGE_HOST);
        await ctx.clickButtonText("#import-preview button", "Grant and import");

        expect(await waitFor(async () => (await ctx.status()) || null))
            .toBe("Imported 2 forge(s); permissions granted.");
        expect(await ctx.hasOrigin(FORGE_ORIGIN)).toBe(true);
        expect(await ctx.hasOrigin("*://example.org/*")).toBe(true);
        expect(await customForges()).toEqual([
            { domain: "example.org", type: "gitlab" },
            { domain: FORGE_HOST, type: "gitea" },
        ]);
        expect(await ctx.page.$eval("#import-preview", (e) => e.innerHTML)).toBe("");
        expect(await ctx.buttonOn(REPO_URL)).toMatch(/swh-save-button/);
    });

    test("a built-in forge slider grants its domain", async () => {
        const knob = await ctx.page.evaluateHandle(() => [...document.querySelectorAll(".forge-row")]
            .find((r) => r.querySelector(".forge-domain").textContent === "codeberg.org")
            .querySelector(".knob"));
        await knob.click();

        expect(await waitFor(() => ctx.hasOrigin("*://codeberg.org/*"))).toBe(true);
    });
});
