import { COLOR_CODES } from "../constants.js";

function statusToErrorType(status) {
    if (status === 403) return COLOR_CODES.API_LIMIT;
    return COLOR_CODES.FORGE_API_ERROR;
}

export async function fetchForgeApi(forgeapiurl, { headers = {} } = {}) {
    try {
        const response = await fetch(forgeapiurl, { method: "GET", headers });
        if (!response.ok) {
            return { ok: false, errorType: statusToErrorType(response.status), status: response.status };
        }
        const data = await response.json();
        return { ok: true, data };
    } catch (error) {
        return { ok: false, errorType: COLOR_CODES.FORGE_API_ERROR, status: 0, error: error.message };
    }
}

export function githubAuthHeaders(ghtoken) {
    return ghtoken ? { Authorization: `Bearer ${ghtoken}` } : {};
}
