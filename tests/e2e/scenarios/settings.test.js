import { createMockServer } from "../server.js";
import { setup, waitForButtonColor, defaultRules, seedStorage, extensionId } from "../harness.js";

/**
 * Options-page / storage wiring. Two directions:
 *
 * 1. Storage → request: a ghtoken in chrome.storage.local reaches the content
 *    script and gets added to the forge API request as a Bearer token.
 * 2. UI → storage: typing in the options page and clicking Save persists the
 *    value into chrome.storage.local.
 *
 * Neither path has any unit coverage on this branch (options.js is a
 * non-module extension page), so this is the only place these regressions
 * get caught before users see them.
 */

const FORGE = { status: 200, body: { pushed_at: "2026-01-01T00:00:00Z" } };
const VISIT_OK = {
    status: 200,
    body: {
        origin: "https://github.com/u/r", visit: 1,
        date: "2026-04-10T00:00:00+00:00", status: "full",
        snapshot: "a".repeat(40), type: "git-checkout",
    },
};

describe("E2E: settings / storage wiring", () => {
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

    test("ghtoken in storage is sent as Authorization: Bearer on forge API", async () => {
        mock.setScenario({ forge: FORGE, swhVisit: VISIT_OK });

        // Capture the forge API request headers via a per-request stash.
        const forgeRequests = [];
        const base = `http://127.0.0.1:${mockPort}`;
        const rules = defaultRules(base);
        const origForgeHandler = rules[1].handler;
        rules[1] = {
            urlPattern: rules[1].urlPattern,
            handler: async (req) => {
                // Skip CORS preflights — only capture the real GET so we
                // can assert on Authorization which is never sent on OPTIONS.
                if (req.method !== "OPTIONS") {
                    forgeRequests.push({ method: req.method, headers: req.headers });
                }
                return origForgeHandler(req);
            },
        };

        ctx = await setup({ mockPort, rules });
        await seedStorage(ctx.swCdp, { ghtoken: "ghp_e2e_token" });

        await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });
        await waitForButtonColor(ctx.page, "green");

        expect(forgeRequests.length).toBeGreaterThan(0);
        const h = lowerKeys(forgeRequests[0].headers);
        expect(h["authorization"]).toBe("Bearer ghp_e2e_token");
    });

    test("options page persists swhtoken to storage on Save click", async () => {
        ctx = await setup({ mockPort, rules: defaultRules(`http://127.0.0.1:${mockPort}`) });
        const id = extensionId(ctx.swTarget);

        await ctx.page.goto(`chrome-extension://${id}/options.html`, { waitUntil: "domcontentloaded" });

        await ctx.page.evaluate(() => {
            document.getElementById("swhtoken").value = "swh_e2e_token";
        });
        await ctx.page.evaluate(() => {
            // options.js binds save_options to onclick of #save
            const btn = document.getElementById("save");
            if (btn) btn.click();
            else save_options(); // eslint-disable-line no-undef
        });

        // Give chrome.storage.local.set() a tick to settle.
        const stored = await readStorage(ctx.swCdp, ["swhtoken"]);
        expect(stored.swhtoken).toBe("swh_e2e_token");
    });
});

function lowerKeys(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
    return out;
}

async function readStorage(swCdp, keys) {
    const expr = `new Promise(r => chrome.storage.local.get(${JSON.stringify(keys)}, r))`;
    const out = await swCdp.send("Runtime.evaluate", {
        expression: expr, awaitPromise: true, returnByValue: true,
    });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text);
    return out.result.value;
}
