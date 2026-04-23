import { createMockServer } from "../server.js";
import { setup, defaultRules } from "../harness.js";

/**
 * Feature-branch-only: runtime host permissions.
 *
 * When the extension lacks optional host permission for the current
 * forge domain, the content script must render the dashed-outline
 * grant button (NOT the save button), because it can't reach the forge
 * API without permission. This scenario verifies that conditional
 * render by opting OUT of the harness's default grantAll patch.
 */

describe("E2E: grant button on missing permission", () => {
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

    test("no host permission → dashed grant button, no save button", async () => {
        mock.setScenario({}); // any scenario; content script short-circuits before fetching
        ctx = await setup({
            mockPort,
            rules: defaultRules(`http://127.0.0.1:${mockPort}`),
            grantAll: false,
        });

        await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });

        // The content script races: hasOrigins → false → insertGrantButton.
        // Wait up to 3s for it to settle.
        await ctx.page.waitForFunction(() => !!document.querySelector(".swh-grant-button"), { timeout: 3000 });

        const state = await ctx.page.evaluate(() => ({
            hasGrant: !!document.querySelector(".swh-grant-button"),
            hasSave:  !!document.querySelector(".swh-save-button"),
        }));
        expect(state.hasGrant).toBe(true);
        expect(state.hasSave).toBe(false);
    });
});
