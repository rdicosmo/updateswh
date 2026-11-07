/** @jest-environment node */
import { spawnSync } from "node:child_process";

const help = (store) => spawnSync("sh", ["build/store-failure-help.sh", store], { encoding: "utf8" });

describe("store-failure-help.sh", () => {
    test.each([
        ["chrome", ["CHROME_REFRESH_TOKEN", "invalid_grant", "CHROME_CLIENT_SECRET"]],
        ["edge", ["EDGE_API_KEY", "72 days", "EDGE_PRODUCT_ID"]],
        ["firefox", ["FIREFOX_JWT_SECRET", "skips the upload"]],
    ])("%s names its credentials and points to Re-run failed jobs", (store, words) => {
        const { status, stdout } = help(store);
        expect(status).toBe(0);
        for (const word of words) expect(stdout).toContain(word);
        expect(stdout).toContain("Re-run failed jobs");
        expect(stdout).toContain("Do not start a new run");
    });

    test("each store gets only its own section", () => {
        expect(help("chrome").stdout).not.toContain("EDGE_");
        expect(help("edge").stdout).not.toContain("FIREFOX_");
        expect(help("firefox").stdout).not.toContain("CHROME_");
    });

    test("an unknown store is a usage error", () => {
        const { status, stdout } = help("safari");
        expect(status).toBe(2);
        expect(stdout).toBe("");
    });
});
