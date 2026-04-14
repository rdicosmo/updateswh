import { COLOR_CODES, SWH_ORIGIN_VISIT_URL } from "../constants.js";

function getBrowser() {
    if (typeof chrome !== "undefined" && chrome?.runtime) return chrome;
    if (typeof browser !== "undefined" && browser?.runtime) return browser;
    throw new Error("No extension messaging API available");
}

function sendMessage(message) {
    const b = getBrowser();
    return new Promise((resolve, reject) => {
        try {
            b.runtime.sendMessage(message, (response) => {
                const err = b.runtime.lastError;
                if (err) { reject(new Error(err.message || String(err))); return; }
                resolve(response);
            });
        } catch (e) { reject(e); }
    });
}

function statusToErrorType(status) {
    if (status === 403) return COLOR_CODES.API_LIMIT;
    if (status === 404) return COLOR_CODES.NOT_ARCHIVED;
    return COLOR_CODES.NOT_ARCHIVED;
}

export async function fetchSwhLatestVisit(projecturl, { swhtoken } = {}) {
    const url = SWH_ORIGIN_VISIT_URL + projecturl + "/visit/latest/";
    const headers = swhtoken ? { Authorization: `Bearer ${swhtoken}` } : {};
    try {
        const response = await sendMessage({ type: "FETCH_SWH_API", url, method: "GET", headers });
        if (response?.success) return { ok: true, data: response.data };
        return { ok: false, errorType: statusToErrorType(response?.status ?? 0), status: response?.status ?? 0, error: response?.error };
    } catch (error) {
        return { ok: false, errorType: COLOR_CODES.NOT_ARCHIVED, status: 0, error: error.message };
    }
}

export async function requestSwhSave(projecturl, { swhtoken } = {}) {
    const url = `https://archive.softwareheritage.org/api/1/origin/save/git/url/${encodeURI(projecturl)}/`;
    const headers = swhtoken ? { Authorization: `Bearer ${swhtoken}` } : {};
    try {
        const response = await sendMessage({ type: "FETCH_SWH_API", url, method: "POST", headers });
        if (response?.success) return { ok: true, data: response.data };
        return { ok: false, status: response?.status ?? 0, error: response?.error };
    } catch (error) {
        return { ok: false, status: 0, error: error.message };
    }
}
