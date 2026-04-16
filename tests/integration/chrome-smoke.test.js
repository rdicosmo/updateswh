/**
 * Integration smoke tests — launches headless Chromium with the unpacked
 * MV3 extension and verifies the SWH button appears on built-in forge pages.
 *
 * Requires: system chromium, npm run build already done.
 * Run:      npm run test:chrome
 */

import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const EXT_DIR = path.join(ROOT, "extension");

// Timeout for slow network + extension startup
const TIMEOUT = 30_000;

let browser;

function findChromium() {
    for (const name of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
        try {
            return execSync(`which ${name}`, { encoding: "utf8" }).trim();
        } catch { /* next */ }
    }
    throw new Error("No Chromium/Chrome found on PATH");
}

beforeAll(async () => {
    // Ensure MV3 manifest is in place for Chrome
    const mv3 = path.join(EXT_DIR, "manifest-v3.json");
    const mv2 = path.join(EXT_DIR, "manifest.json");
    const mv2Backup = path.join(EXT_DIR, "manifest-v2-backup.json");

    if (fs.existsSync(mv2)) {
        fs.renameSync(mv2, mv2Backup);
    }
    fs.copyFileSync(mv3, mv2);

    browser = await puppeteer.launch({
        executablePath: findChromium(),
        headless: "new",
        args: [
            `--disable-extensions-except=${EXT_DIR}`,
            `--load-extension=${EXT_DIR}`,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ],
    });
}, TIMEOUT);

afterAll(async () => {
    if (browser) await browser.close();

    // Restore MV2 manifest
    const mv2 = path.join(EXT_DIR, "manifest.json");
    const mv2Backup = path.join(EXT_DIR, "manifest-v2-backup.json");
    if (fs.existsSync(mv2Backup)) {
        fs.renameSync(mv2Backup, mv2);
    }
});

async function waitForSwhButton(page, timeout = TIMEOUT) {
    return page.waitForSelector(".swh-save-button, .swh-grant-button", { timeout });
}

describe("Chrome extension smoke tests", () => {
    test("GitHub: SWH button appears on a public repo", async () => {
        const page = await browser.newPage();
        try {
            await page.goto("https://github.com/rdicosmo/updateswh", {
                waitUntil: "networkidle2",
                timeout: TIMEOUT,
            });
            const btn = await waitForSwhButton(page);
            expect(btn).not.toBeNull();

            // Headless Chrome may not auto-grant optional host permissions,
            // so the button could be either a save button (permissions
            // granted) or a grant button (permissions pending).
            const classes = await btn.evaluate((el) => el.className);
            const isSwhButton = classes.includes("swh-save-button") || classes.includes("swh-grant-button");
            expect(isSwhButton).toBe(true);
        } finally {
            await page.close();
        }
    }, TIMEOUT);

    test("GitLab: SWH button appears on a public repo", async () => {
        const page = await browser.newPage();
        try {
            await page.goto("https://gitlab.com/gitlab-org/gitlab", {
                waitUntil: "networkidle2",
                timeout: TIMEOUT,
            });
            const btn = await waitForSwhButton(page);
            expect(btn).not.toBeNull();
        } finally {
            await page.close();
        }
    }, TIMEOUT);

    test("Codeberg: SWH button appears on a public repo", async () => {
        const page = await browser.newPage();
        try {
            await page.goto("https://codeberg.org/forgejo/forgejo", {
                waitUntil: "networkidle2",
                timeout: TIMEOUT,
            });
            const btn = await waitForSwhButton(page);
            expect(btn).not.toBeNull();
        } finally {
            await page.close();
        }
    }, TIMEOUT);

    test("Non-repo page: no SWH button", async () => {
        const page = await browser.newPage();
        try {
            await page.goto("https://github.com/features", {
                waitUntil: "networkidle2",
                timeout: TIMEOUT,
            });
            // Wait a bit for the content script to run (it should exit early)
            await new Promise((r) => setTimeout(r, 3000));
            const btn = await page.$(".swh-save-button, .swh-grant-button");
            expect(btn).toBeNull();
        } finally {
            await page.close();
        }
    }, TIMEOUT);

    test("GitHub SPA navigation: button updates on repo change", async () => {
        const page = await browser.newPage();
        try {
            await page.goto("https://github.com/rdicosmo/updateswh", {
                waitUntil: "networkidle2",
                timeout: TIMEOUT,
            });
            await waitForSwhButton(page);

            // Navigate via SPA to a different repo
            await page.goto("https://github.com/softwareheritage/swh-web", {
                waitUntil: "networkidle2",
                timeout: TIMEOUT,
            });

            // Button should reappear for the new repo
            const btn = await waitForSwhButton(page);
            expect(btn).not.toBeNull();
        } finally {
            await page.close();
        }
    }, TIMEOUT);
});
