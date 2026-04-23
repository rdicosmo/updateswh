import { createMockServer } from "../server.js";
import { setup, waitForButtonColor } from "../harness.js";

describe("E2E: GitHub repo up-to-date", () => {
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

    test("button renders green when SWH visit status is full and date >= forge pushed_at", async () => {
        const mockBase = `http://127.0.0.1:${mockPort}`;
        mock.setScenario({
            forge: { status: 200, body: { pushed_at: "2026-01-01T00:00:00Z" } },
            swhVisit: {
                status: 200,
                body: {
                    origin: "https://github.com/u/r",
                    visit: 42,
                    date: "2026-04-01T00:00:00+00:00",
                    status: "full",
                    snapshot: "deadbeef".padEnd(40, "0"),
                    type: "git-checkout",
                },
            },
        });

        const rules = [
            rule("https://github.com/u/r*", mockBase, "/fixtures/github/u/r"),
            rule("https://api.github.com/repos/u/r*", mockBase, "/forge/github/repos/u/r"),
            swhRule(mockBase),
        ];

        ctx = await setup({ mockPort, rules });
        await ctx.page.goto("https://github.com/u/r", { waitUntil: "domcontentloaded" });
        await waitForButtonColor(ctx.page, "green");

        const tooltip = await ctx.page.$eval(".swh-save-button", (el) => el.getAttribute("title"));
        expect(tooltip).toMatch(/up to date/i);
    });
});

function rule(urlPattern, mockBase, mockPath) {
    return {
        urlPattern,
        handler: async () => proxy(`${mockBase}${mockPath}`),
    };
}

function swhRule(mockBase) {
    return {
        urlPattern: "https://archive.softwareheritage.org/api/1/origin/*",
        handler: async (req) => {
            const isSave = req.url.includes("/save/");
            const mockPath = isSave ? "/swh/origin/save/" : "/swh/origin/visit/latest/";
            return proxy(`${mockBase}${mockPath}`, { method: isSave ? "POST" : "GET" });
        },
    };
}

async function proxy(url, init = {}) {
    const r = await fetch(url, init);
    return {
        status: r.status,
        contentType: r.headers.get("content-type"),
        body: await r.text(),
    };
}
