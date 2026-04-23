/**
 * Puppeteer-core harness for updateswh E2E tests.
 *
 * Responsibilities:
 *   - Copy the built extension/ to a temp dir and swap in the MV3 manifest
 *     (Chrome rejects MV2 manifests when loading unpacked).
 *   - Launch system Chromium (headless=new) with --load-extension.
 *   - Wait for the extension's service-worker target and attach CDP to it.
 *   - Install Fetch interception on *both* the page target and the SW target,
 *     redirecting the real forge + SWH hostnames to a local mock server.
 *
 * The content script matches real hostnames like github.com; we don't
 * modify its patterns. Navigation to https://github.com/u/r is intercepted
 * at the browser level and fulfilled from our fixture HTML, so the page
 * origin is genuinely github.com from the content script's perspective.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const EXECUTABLE_PATH = process.env.CHROME_BIN || "/usr/bin/chromium";

export async function prepareExtensionDir() {
    const src = path.join(REPO_ROOT, "extension");
    const dst = await fs.mkdtemp(path.join(os.tmpdir(), "updateswh-e2e-"));
    await fs.cp(src, dst, { recursive: true });
    // Chrome needs MV3 manifest.json when loading unpacked.
    const mv3 = path.join(dst, "manifest-v3.json");
    const target = path.join(dst, "manifest.json");
    await fs.copyFile(mv3, target);
    return dst;
}

export async function launchBrowser(extensionDir) {
    const browser = await puppeteer.launch({
        executablePath: EXECUTABLE_PATH,
        headless: "new",
        args: [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-features=DialMediaRouteProvider",
        ],
    });
    return browser;
}

/**
 * Wait for the extension's service-worker target to appear.
 * Returns the puppeteer Target (not a CDP session).
 */
export async function waitForServiceWorker(browser, { timeoutMs = 15_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const target = browser.targets().find((t) => t.type() === "service_worker");
        if (target) return target;
        await sleep(100);
    }
    throw new Error("service-worker target never appeared");
}

/**
 * Install Fetch-domain interception on a CDP session.
 *
 * `rules` is a list of { urlPattern, handler(request) }. handler returns
 * `{ status, contentType, body, headers? }` to fulfil the request, or
 * `null` to pass through unchanged.
 *
 * Pattern syntax is Chrome's Fetch.RequestPattern.urlPattern (wildcards
 * with `*`).
 */
export async function interceptFetch(cdp, rules, { label = "cdp" } = {}) {
    await cdp.send("Fetch.enable", {
        patterns: rules.map((r) => ({ urlPattern: r.urlPattern, requestStage: "Request" })),
    });

    cdp.on("Fetch.requestPaused", async (event) => {
        const { requestId, request } = event;
        try {
            const rule = rules.find((r) => matchPattern(r.urlPattern, request.url));
            if (process.env.E2E_DEBUG) {
                console.log(`[${label}] intercept`, request.method, request.url, "→", rule ? "HANDLED" : "PASS");
            }
            const out = rule ? await rule.handler(request) : null;
            if (!out) {
                await cdp.send("Fetch.continueRequest", { requestId });
                return;
            }
            const body = out.body == null
                ? ""
                : (typeof out.body === "string" ? out.body : JSON.stringify(out.body));
            // Cross-origin fetches from the content script (e.g. api.github.com
            // issued from a page on github.com) require CORS headers on the
            // fulfilled response. Add them by default; rules can override.
            const headers = [
                { name: "content-type", value: out.contentType || "application/json" },
                { name: "access-control-allow-origin", value: "*" },
                { name: "access-control-allow-headers", value: "*" },
                ...(out.headers || []).map(([name, value]) => ({ name, value })),
            ];
            await cdp.send("Fetch.fulfillRequest", {
                requestId,
                responseCode: out.status || 200,
                responseHeaders: headers,
                body: Buffer.from(body, "utf8").toString("base64"),
            });
        } catch (e) {
            console.warn(`[${label}] interceptFetch handler error:`, e.message);
            try { await cdp.send("Fetch.failRequest", { requestId, errorReason: "Failed" }); } catch { /* ignore */ }
        }
    });
}

function matchPattern(pattern, url) {
    // Minimal glob: `*` matches anything. Chrome's Fetch.urlPattern uses the
    // same semantics. Escape regex metacharacters, then swap `*` for `.*`.
    const re = new RegExp(
        "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
    );
    return re.test(url);
}

/**
 * High-level setup: launch browser + harness ready to run one scenario.
 * Returns `{ browser, page, stop, mockUrl }`.
 *
 * `mockPort` is the port of an already-running mock server.
 * `rules` are the Fetch rules applied to BOTH page + SW targets.
 */
export async function setup({ mockPort, rules }) {
    const extensionDir = await prepareExtensionDir();
    const browser = await launchBrowser(extensionDir);
    const swTarget = await waitForServiceWorker(browser);
    const swCdp = await swTarget.createCDPSession();
    await interceptFetch(swCdp, rules, { label: "sw" });

    const page = await browser.newPage();
    const pageCdp = await page.target().createCDPSession();
    await interceptFetch(pageCdp, rules, { label: "page" });


    const stop = async () => {
        try { await browser.close(); } finally {
            await fs.rm(extensionDir, { recursive: true, force: true });
        }
    };

    return { browser, page, swTarget, swCdp, pageCdp, stop, mockUrl: `http://127.0.0.1:${mockPort}` };
}

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Default Fetch rules covering the three request families the content
 * script + background make:
 *   - navigation to https://<forge-host>/<user>/<repo>  → fixture HTML
 *   - content-script forge API call                     → mock forge API
 *   - background SWH API call                           → mock SWH API
 *
 * All three proxy to the local mock server; tune response shape via
 * mock.setScenario() before navigation.
 */
export function defaultRules(mockBase, { user = "u", repo = "r", forge = "github" } = {}) {
    const page = `https://${hostFor(forge)}/${user}/${repo}`;
    const api = apiFor(forge, user, repo);
    return [
        { urlPattern: `${page}*`, handler: async () => proxy(`${mockBase}/fixtures/${forge}/${user}/${repo}`) },
        { urlPattern: `${api}*`,  handler: async () => proxy(`${mockBase}/forge/${forge}/repos/${user}/${repo}`) },
        {
            urlPattern: "https://archive.softwareheritage.org/api/1/origin/*",
            handler: async (req) => {
                const isSave = req.url.includes("/save/");
                const mockPath = isSave ? "/swh/origin/save/" : "/swh/origin/visit/latest/";
                return proxy(`${mockBase}${mockPath}`, { method: isSave ? "POST" : "GET" });
            },
        },
    ];
}

function hostFor(forge) {
    if (forge === "github") return "github.com";
    throw new Error(`unknown forge ${forge}`);
}

function apiFor(forge, user, repo) {
    if (forge === "github") return `https://api.github.com/repos/${user}/${repo}`;
    throw new Error(`unknown forge ${forge}`);
}

async function proxy(url, init = {}) {
    const r = await fetch(url, init);
    return {
        status: r.status,
        contentType: r.headers.get("content-type"),
        body: await r.text(),
    };
}

/**
 * Wait for `.swh-save-button` to carry the given colour class.
 * On timeout, dumps the button's current state so failing scenarios don't
 * need their own diagnostic scaffolding.
 */
export async function waitForButtonColor(page, color, { timeoutMs = 10_000 } = {}) {
    try {
        return await page.waitForFunction(
            (sel, col) => {
                const el = document.querySelector(sel);
                return !!el && el.classList.contains(col);
            },
            { timeout: timeoutMs },
            ".swh-save-button",
            color,
        );
    } catch (e) {
        const state = await page.evaluate(() => {
            const btn = document.querySelector(".swh-save-button");
            return {
                url: location.href,
                title: document.title,
                btnClasses: btn ? Array.from(btn.classList) : null,
                btnTitle: btn ? btn.getAttribute("title") : null,
                bodyLen: document.body?.innerHTML?.length ?? 0,
            };
        }).catch(() => null);
        console.log("[waitForButtonColor] state on timeout:", JSON.stringify(state, null, 2));
        throw e;
    }
}
