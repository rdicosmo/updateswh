import { COLOR_CODES, SWH_ORIGIN_VISIT_URL, SWH_FETCH_TIMEOUT_MS } from "../constants.js";

function getBrowser() {
    if (typeof chrome !== "undefined" && chrome?.runtime) return chrome;
    if (typeof browser !== "undefined" && browser?.runtime) return browser;
    throw new Error("No extension messaging API available");
}

// Wrap runtime.sendMessage in a promise with a timeout. The timeout guards
// against MV3 Chrome service-worker suspension where a response may be
// dropped silently, leaving the content script awaiting forever.
export function sendMessageWithTimeout(message, { timeoutMs = SWH_FETCH_TIMEOUT_MS } = {}) {
    const b = getBrowser();
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(`background did not respond within ${timeoutMs}ms`));
        }, timeoutMs);
        try {
            b.runtime.sendMessage(message, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                const err = b.runtime.lastError;
                if (err) { reject(new Error(err.message || String(err))); return; }
                resolve(response);
            });
        } catch (e) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(e);
        }
    });
}

function responseToSwhError(response, error) {
    if (response?.kind === "challenge") {
        return { ok: false, errorType: COLOR_CODES.SWH_UNREACHABLE, status: response.status ?? 0, error: response.error };
    }
    const status = response?.status ?? 0;
    if (status === 403) return { ok: false, errorType: COLOR_CODES.API_LIMIT, status, error: response?.error || error };
    return { ok: false, errorType: COLOR_CODES.NOT_ARCHIVED, status, error: response?.error || error };
}

export async function fetchSwhLatestVisit(projecturl, { swhtoken } = {}) {
    const url = SWH_ORIGIN_VISIT_URL + projecturl + "/visit/latest/";
    const headers = swhtoken ? { Authorization: `Bearer ${swhtoken}` } : {};
    try {
        const response = await sendMessageWithTimeout({ type: "FETCH_SWH_API", url, method: "GET", headers });
        if (response?.success) return { ok: true, data: response.data };
        return responseToSwhError(response);
    } catch (error) {
        return { ok: false, errorType: COLOR_CODES.SWH_UNREACHABLE, status: 0, error: error.message };
    }
}

export async function requestSwhSave(projecturl, { swhtoken } = {}) {
    const url = `https://archive.softwareheritage.org/api/1/origin/save/git/url/${encodeURI(projecturl)}/`;
    const headers = swhtoken ? { Authorization: `Bearer ${swhtoken}` } : {};
    try {
        const response = await sendMessageWithTimeout({ type: "FETCH_SWH_API", url, method: "POST", headers });
        if (response?.success) return { ok: true, data: response.data };
        if (response?.kind === "challenge") {
            return { ok: false, kind: "challenge", status: response.status ?? 0, error: response.error };
        }
        return { ok: false, status: response?.status ?? 0, error: response?.error };
    } catch (error) {
        return { ok: false, status: 0, error: error.message, kind: "timeout" };
    }
}
