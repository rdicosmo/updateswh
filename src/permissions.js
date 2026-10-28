/**
 * Thin wrappers over chrome.permissions for
 * runtime host-permission management.  Works in both MV2 (Firefox)
 * and MV3 (Chrome / Edge).
 *
 * In content scripts, chrome.permissions is NOT available.
 * hasOrigins falls back to message passing via the background script.
 * requestOrigins cannot work from a content script (no user gesture
 * in the background); use openOptionsPage instead.
 */

function permissionsApi() {
    if (typeof chrome !== "undefined" && chrome?.permissions?.contains) return chrome.permissions;
    if (typeof browser !== "undefined" && browser?.permissions?.contains) return browser.permissions;
    return null;
}

function runtime() {
    if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) return chrome.runtime;
    if (typeof browser !== "undefined" && browser?.runtime?.sendMessage) return browser.runtime;
    return null;
}

/** Match-pattern for a domain: `*://domain/*` */
export function originPattern(domain) {
    return `*://${domain}/*`;
}

/** Convert a list of domains to origin match-patterns. */
export function domainPatterns(domains) {
    return domains.map(originPattern);
}

/**
 * Check whether the extension currently has host permission for
 * the given origin pattern(s).
 *
 * Works from both extension pages (direct API) and content scripts
 * (message passing to background).
 *
 * @param {string|string[]} origins  One or more match-patterns.
 * @returns {Promise<boolean>}
 */
export function hasOrigins(origins) {
    const list = Array.isArray(origins) ? origins : [origins];
    const perms = permissionsApi();
    if (perms) {
        return new Promise((resolve) =>
            perms.contains({ origins: list }, (result) => resolve(!!result)),
        );
    }
    // Content script fallback: ask the background script
    const rt = runtime();
    if (!rt) return Promise.resolve(false);
    return new Promise((resolve) =>
        rt.sendMessage({ type: "CHECK_PERMISSION", origins: list }, (resp) =>
            resolve(resp?.granted ?? false),
        ),
    );
}

/**
 * Request host permissions.  Must be called from a user-gesture
 * context on an extension page (background, popup, options).
 * NOT available in content scripts.
 * @param {string[]} origins  Match-patterns to request.
 * @returns {Promise<boolean>}  true if the user granted.
 */
export function requestOrigins(origins) {
    const perms = permissionsApi();
    if (!perms || !perms.request) return Promise.resolve(false);
    return new Promise((resolve) =>
        perms.request({ origins }, (granted) => resolve(!!granted)),
    );
}

/**
 * Open the extension's options page.  Works from content scripts
 * via message passing.
 */
export function openOptionsPage() {
    const rt = runtime();
    if (!rt) return;
    rt.sendMessage({ type: "OPEN_OPTIONS" });
}

/**
 * Revoke host permissions.
 * @param {string[]} origins  Match-patterns to remove.
 * @returns {Promise<boolean>}
 */
export function removeOrigins(origins) {
    const perms = permissionsApi();
    if (!perms || !perms.remove) return Promise.resolve(false);
    return new Promise((resolve) =>
        perms.remove({ origins }, (removed) => resolve(!!removed)),
    );
}

/**
 * List all currently granted optional origins.
 * @returns {Promise<string[]>}
 */
export function listGrantedOrigins() {
    const perms = permissionsApi();
    if (!perms || !perms.getAll) return Promise.resolve([]);
    return new Promise((resolve) =>
        perms.getAll((p) => resolve(p.origins || [])),
    );
}
