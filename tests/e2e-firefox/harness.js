/**
 * Firefox ESR harness for updateswh E2E tests.
 *
 * Loads the real MV2 build (extension/manifest.json merged with
 * build/firefox-gecko.json, as `make` does) into Firefox over WebDriver
 * BiDi, and drives the options page with real clicks. Firefox honours
 * permissions.request only inside a user-input handler, and BiDi clicks
 * count as user input, so these tests exercise the same path a user does.
 *
 * Network: every http and https request goes to a local proxy (server.js).
 * Forge pages and APIs are served over plain http from fixtures; https
 * CONNECTs, including the SWH API, are refused, so nothing reaches the
 * internet and the SWH lookup fails deterministically.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXECUTABLE_PATH = process.env.FIREFOX_BIN || "/usr/bin/firefox-esr";
const EXT_ID = "{157eb9f0-9814-4fcc-b0b7-586b3093c641}";
const UUID = "11111111-2222-3333-4444-555555555555";
export const OPTIONS_URL = `moz-extension://${UUID}/options.html`;

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function deepMerge(a, b) {
    if (typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) return b;
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? deepMerge(a[k], v) : v;
    return out;
}

export async function prepareExtensionDir() {
    const dst = await fs.mkdtemp(path.join(os.tmpdir(), "updateswh-e2e-ff-"));
    await fs.cp(path.join(REPO_ROOT, "extension"), dst, { recursive: true });
    await fs.rm(path.join(dst, "manifest-v3.json"), { force: true });
    const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
    const manifest = deepMerge(
        await read(path.join(REPO_ROOT, "extension", "manifest.json")),
        await read(path.join(REPO_ROOT, "build", "firefox-gecko.json")),
    );
    await fs.writeFile(path.join(dst, "manifest.json"), JSON.stringify(manifest, null, 2));
    return dst;
}

/**
 * Launch Firefox with the extension installed and the options page open.
 * Returns helpers bound to that page; call `stop()` when done.
 */
export async function setup({ proxyPort }) {
    const extensionDir = await prepareExtensionDir();
    const browser = await puppeteer.launch({
        browser: "firefox",
        executablePath: EXECUTABLE_PATH,
        headless: true,
        extraPrefsFirefox: {
            "extensions.webextensions.uuids": JSON.stringify({ [EXT_ID]: UUID }),
            // Accept permission prompts; the request itself is still refused
            // outside a user-input handler, which is what these tests check.
            "extensions.webextOptionalPermissionPrompts": false,
            "network.proxy.type": 1,
            "network.proxy.http": "127.0.0.1",
            "network.proxy.http_port": proxyPort,
            "network.proxy.ssl": "127.0.0.1",
            "network.proxy.ssl_port": proxyPort,
            "network.proxy.share_proxy_settings": false,
            "dom.security.https_first": false,
            "dom.security.https_only_mode": false,
        },
    });
    let page;
    try {
        await browser.installExtension(extensionDir);
        page = await browser.newPage();
        await openOptions(page);
    } catch (e) {
        await browser.close();
        throw e;
    }

    const evalStorage = (fn, arg) => page.evaluate(fn, arg);
    return {
        browser,
        page,
        hasOrigin: (origin) => page.evaluate((o) => new Promise((r) => chrome.permissions.contains({ origins: [o] }, r)), origin),
        status: () => page.$eval("#status", (e) => e.textContent),
        stored: () => evalStorage(() => new Promise((r) => chrome.storage.local.get(null, r))),
        /** Write storage, then reload the options page so it renders from it. */
        async seed(items, { remove = [] } = {}) {
            await evalStorage((i) => new Promise((r) => chrome.storage.local.set(i, r)), items);
            if (remove.length) await evalStorage((k) => new Promise((r) => chrome.storage.local.remove(k, r)), remove);
            await openOptions(page);
        },
        async clickButtonText(selector, text) {
            const el = await page.evaluateHandle(
                (s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent === t), selector, text);
            await el.click();
        },
        /** Open a forge page in a new tab and return the updateswh button's class, or null. */
        async buttonOn(url, { timeoutMs = 15_000 } = {}) {
            const tab = await browser.newPage();
            await tab.goto(url, { waitUntil: "domcontentloaded" });
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const cls = await tab.evaluate(() => {
                    const el = document.querySelector(".swh-save-button, .swh-grant-button");
                    return el && el.className;
                });
                if (cls) return cls;
                await sleep(250);
            }
            return null;
        },
        async stop() {
            await browser.close();
            await fs.rm(extensionDir, { recursive: true, force: true });
        },
    };
}

// The BiDi navigation to a moz-extension: page can fail to report its load
// event although the page loads; wait for the forge list instead. Not
// waitForFunction: the extension CSP blocks the Function() it compiles.
async function openOptions(page) {
    await page.goto(OPTIONS_URL, { waitUntil: "domcontentloaded", timeout: 5_000 }).catch(() => {});
    const ready = await waitFor(() => page.evaluate(() => document.querySelectorAll(".forge-row").length > 0)
        .catch(() => false), { timeoutMs: 10_000 });
    if (!ready) throw new Error("options page did not render its forge list");
}

/** Poll until `fn()` resolves truthy, or return its last value after the timeout. */
export async function waitFor(fn, { timeoutMs = 5_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let v;
    while (Date.now() < deadline) {
        v = await fn();
        if (v) return v;
        await sleep(100);
    }
    return v;
}
