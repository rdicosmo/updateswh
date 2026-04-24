const browser = (typeof chrome !== "undefined" && chrome) ? chrome : globalThis.browser;

const WELCOME_URL = "https://softwareheritage.org/browser-extension";

browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        browser.tabs.create({ url: WELCOME_URL });
    }
});

function handleFetchSwhApi(data, sendResponse) {
    const opts = {
        method: data.method || "GET",
        headers: data.headers || {},
        // ensure to not send any credentials through cookies as if a user is
        // currently logged in to the SWH webapp, this will trigger CSRF check
        // server side and the request will be rejected
        credentials: "omit",
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

browser.runtime.onMessage.addListener((data, _sender, sendResponse) => {
    if (data.type === "FETCH_SWH_API") {
        handleFetchSwhApi(data, sendResponse);
        return true;
    }
    if (data.type === "createtab") {
        browser.tabs.create({ url: data.url });
        return false;
    }
    return false;
});
