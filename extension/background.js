const browser = (typeof chrome !== "undefined" && chrome) ? chrome : globalThis.browser;

const WELCOME_URL = "https://www.softwareheritage.org/updateswh-8-x/";

browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        browser.tabs.create({ url: WELCOME_URL });
        browser.runtime.openOptionsPage();
    }
});

// Mirror of src/api/swhResponse.js — kept in sync because the background
// script is not an ES module and cannot import. If you change one, change the
// other (tests cover the module copy).
async function shapeSwhResponse(response) {
    if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, status: response.status };
    }
    const ct = response.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
        return {
            success: false,
            status: response.status,
            error: "Non-JSON response from SWH (possibly bot-challenge page)",
            kind: "challenge",
        };
    }
    try {
        const data = await response.json();
        return { success: true, data };
    } catch (e) {
        return {
            success: false,
            status: response.status,
            error: e.message || "JSON parse error",
            kind: "parse_error",
        };
    }
}

// MV3 Chrome: sendResponse throws if the caller has disconnected (the SW was
// suspended, the page navigated, or the port closed). Swallow those — the
// content script has its own timeout and will recover.
function safeSendResponse(sendResponse, payload) {
    try {
        sendResponse(payload);
    } catch (e) {
        console.warn("[updateswh] sendResponse failed:", e?.message || e);
    }
}

// Identify updateSWH to the SWH side on every API call, so their
// Anubis (or similar) bot-filter can allow-list API traffic without
// guessing, and so request logs can distinguish extension traffic from
// browser traffic. Caller-supplied headers win on key collision — we
// merge defaults first, overrides second.
//
// Note: Chromium MV3 service workers may silently replace User-Agent
// with the browser's default. X-UpdateSWH-Client is the reliable
// fallback; send both.
function defaultSwhHeaders() {
    const { version = "unknown" } = browser.runtime.getManifest?.() || {};
    const ua = `updateSWH/${version} (+https://github.com/rdicosmo/updateswh)`;
    return {
        "Accept": "application/json",
        "User-Agent": ua,
        "X-UpdateSWH-Client": `updateSWH/${version}`,
    };
}

async function handleFetchSwhApi(data, sendResponse) {
    const opts = {
        method: data.method || "GET",
        headers: { ...defaultSwhHeaders(), ...(data.headers || {}) },
        // Don't send cookies. If a user is logged into
        // archive.softwareheritage.org in the same browser, the session
        // cookie would be auto-included here, triggering swh-web's Django
        // CSRF middleware and getting the request rejected. The extension
        // never needs cookie-based auth — explicit `Authorization` headers
        // (swhtoken) are preserved, they're not "credentials" in the
        // fetch-spec sense.
        credentials: "omit",
    };
    if (data.body) opts.body = data.body;

    try {
        const response = await fetch(data.url, opts);
        const shaped = await shapeSwhResponse(response);
        safeSendResponse(sendResponse, shaped);
    } catch (error) {
        console.warn("[updateswh] SWH fetch failed:", error?.message || error);
        safeSendResponse(sendResponse, { success: false, error: error.message, status: 0 });
    }
}

/* ── Custom forge content-script injection ── */

// Keep a set of custom forge domains for the tabs.onUpdated listener.
let customForgeDomains = new Set();

function migrateAndLoadCustomForges(cb) {
    browser.storage.local.get({
        customForges: null,
        customForgeOrigins: null,
        gitlabs: "",
        giteas: ""
    }, (items) => {
        if (Array.isArray(items.customForges)) { cb(items.customForges); return; }
        const list = [];
        const push = (d, type) => { if (d) list.push({ domain: d, type }); };
        (items.gitlabs || "").split(/[\s,\n\r]+/).filter(Boolean).forEach((d) => push(d, "gitlab"));
        (items.giteas  || "").split(/[\s,\n\r]+/).filter(Boolean).forEach((d) => push(d, "gitea"));
        const patterns = list.map((f) => `*://${f.domain}/*`);
        browser.storage.local.set({ customForges: list, customForgeOrigins: patterns }, () => {
            browser.storage.local.remove(["gitlabs", "giteas"], () => cb(list));
        });
    });
}

function refreshCustomDomains() {
    migrateAndLoadCustomForges((list) => {
        customForgeDomains = new Set(list.map((f) => f.domain));
    });
}

// Load on startup
refreshCustomDomains();

// Reload when storage changes (options page saved new domains)
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.customForges || changes.customForgeOrigins)) {
        refreshCustomDomains();
    }
});

// Inject content script into custom forge pages via tabs.executeScript.
// This is more reliable than contentScripts.register, which returns
// undefined on Firefox ESR.
function injectCustomForge(tabId, url) {
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return; }
    if (!customForgeDomains.has(hostname)) return;

    const origin = `*://${hostname}/*`;
    browser.permissions.contains({ origins: [origin] }, (has) => {
        if (!has) return;
        // MV3: chrome.scripting.executeScript
        if (browser.scripting?.executeScript) {
            browser.scripting.insertCSS({ target: { tabId }, files: ["css/updateswh.css"] }).catch(() => {});
            browser.scripting.executeScript({ target: { tabId }, files: ["updateswh.js"] }).catch(() => {});
            return;
        }
        // MV2: browser.tabs.executeScript / insertCSS
        browser.tabs.insertCSS(tabId, { file: "css/updateswh.css", runAt: "document_idle" }, () => {
            if (browser.runtime.lastError) { /* ignore — no permission or tab gone */ }
        });
        browser.tabs.executeScript(tabId, { file: "updateswh.js", runAt: "document_idle" }, () => {
            if (browser.runtime.lastError) { /* ignore */ }
        });
    });
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        injectCustomForge(tabId, tab.url);
    }
});

/* ── Message handlers ── */

browser.runtime.onMessage.addListener((data, _sender, sendResponse) => {
    if (data.type === "FETCH_SWH_API") {
        handleFetchSwhApi(data, sendResponse);
        return true;
    }
    if (data.type === "createtab") {
        browser.tabs.create({ url: data.url });
        return false;
    }
    if (data.type === "CHECK_PERMISSION") {
        browser.permissions.contains({ origins: data.origins }, (result) => {
            sendResponse({ granted: !!result });
        });
        return true;
    }
    if (data.type === "OPEN_OPTIONS") {
        browser.runtime.openOptionsPage();
        return false;
    }
    return false;
});
