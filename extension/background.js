const browser = (typeof chrome !== "undefined" && chrome) ? chrome : globalThis.browser;

const WELCOME_URL = "https://softwareheritage.org/browser-extension";

browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        browser.tabs.create({ url: WELCOME_URL });
        browser.runtime.openOptionsPage();
    }
});

function handleFetchSwhApi(data, sendResponse) {
    const opts = {
        method: data.method || "GET",
        headers: data.headers || {},
    };
    if (data.body) opts.body = data.body;

    fetch(data.url, opts)
        .then(async (response) => {
            if (!response.ok) {
                sendResponse({ success: false, error: `HTTP ${response.status}`, status: response.status });
                return;
            }
            const body = await response.json();
            sendResponse({ success: true, data: body });
        })
        .catch((error) => {
            sendResponse({ success: false, error: error.message, status: 0 });
        });
}

/* ── Custom forge content-script injection ── */

// Keep a set of custom forge domains for the tabs.onUpdated listener.
let customForgeDomains = new Set();

function refreshCustomDomains() {
    browser.storage.local.get({ customForgeOrigins: [] }, (items) => {
        customForgeDomains = new Set();
        (items.customForgeOrigins || []).forEach((origin) => {
            const domain = origin.replace(/^\*:\/\//, "").replace(/\/\*$/, "");
            if (domain) customForgeDomains.add(domain);
        });
    });
}

// Load on startup
refreshCustomDomains();

// Reload when storage changes (options page saved new domains)
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.customForgeOrigins) {
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
