import { COLOR_CODES, CACHE_TTL_MS, PENDING_VISIT_STATUSES } from "../constants.js";
import { buildForges, findMatchingForge, setupForge } from "../forges.js";
import { fetchForgeApi, githubAuthHeaders } from "../api/forge.js";
import { fetchSwhLatestVisit } from "../api/swh.js";
import { isArchiveUpToDate } from "../utils/dateUtils.js";
import { memoizeWithTTL } from "../utils/cache.js";
import { hasOrigins, originPattern } from "../permissions.js";
import {
    insertSaveIcon, removeSaveIcon, saveIconPresent, saveIconColor,
    insertGrantButton, removeGrantButton, grantButtonPresent,
} from "./ui.js";
import { onNavigation } from "./navigation.js";

function getBrowser() {
    if (typeof chrome !== "undefined" && chrome?.storage) return chrome;
    return globalThis.browser;
}

let debug = false;
function dbg(...args) {
    if (debug) console.log("[SWH]", ...args);
}

function loadSettings() {
    return new Promise((resolve) => {
        getBrowser().storage.local.get(null, (items) => resolve(items || {}));
    });
}

function forgeDomainFromUrl(url) {
    try { return new URL(url).hostname; } catch { return null; }
}

async function computeResults(url, forges, settings) {
    const forge = findMatchingForge(url, forges);
    if (!forge) return null;

    const specs = setupForge(url, forge);
    const { projecturl, forgeapiurl, forgename, lastupdate } = specs;
    dbg("computeResults", { projecturl, forgeapiurl, forgename });

    const headers = forgename === "GitHub" ? githubAuthHeaders(settings.ghtoken) : {};
    const [forgeResult, swhResult] = await Promise.all([
        fetchForgeApi(forgeapiurl, { headers }),
        fetchSwhLatestVisit(projecturl, { swhtoken: settings.swhtoken }),
    ]);
    dbg("forgeResult", forgeResult.ok, forgeResult.errorType);
    dbg("swhResult", swhResult.ok, swhResult.errorType);

    const results = {
        projecturl,
        forgename,
        color: COLOR_CODES.NOT_ARCHIVED,
        forgelastupdate: null,
        swhlastupdate: null,
    };

    if (!forgeResult.ok) {
        results.color = forgeResult.errorType;
        return results;
    }
    results.forgelastupdate = lastupdate(forgeResult.data);

    if (!swhResult.ok) {
        results.color = swhResult.errorType;
        return results;
    }
    results.swhlastupdate = swhResult.data.date;

    if (PENDING_VISIT_STATUSES.has(swhResult.data.status)) {
        // A visit is currently in flight (just scheduled / being fetched).
        // Don't mark it as failed — the outcome isn't known yet.
        results.color = COLOR_CODES.PENDING_VISIT;
    } else if (swhResult.data.status !== "full") {
        results.color = COLOR_CODES.FAILED_UPDATE;
    } else if (isArchiveUpToDate(results.forgelastupdate, results.swhlastupdate)) {
        results.color = COLOR_CODES.UP_TO_DATE;
    } else {
        results.color = COLOR_CODES.OUT_OF_DATE;
    }
    dbg("result color", results.color);
    return results;
}

async function handle(url, forges, settings, getResults) {
    dbg("handle", url);
    const forge = findMatchingForge(url, forges);
    if (!forge) {
        dbg("no forge match for", url);
        removeSaveIcon();
        removeGrantButton();
        return;
    }
    dbg("forge match:", forge.name);

    // Check host permission before attempting API calls
    const domain = forgeDomainFromUrl(url);
    if (domain) {
        const pattern = originPattern(domain);
        dbg("checking permission for", pattern);
        const permitted = await hasOrigins(pattern);
        dbg("permission result:", permitted);
        if (!permitted) {
            removeSaveIcon();
            if (!grantButtonPresent()) {
                insertGrantButton(domain);
            }
            return;
        }
    }

    removeGrantButton();
    if (saveIconPresent() && saveIconColor() !== COLOR_CODES.API_LIMIT) return;

    const results = await getResults(url);
    if (!results) return;
    if (window.location.href !== url) return;
    insertSaveIcon(results, settings);
}

export function customForgesByType(settings) {
    // Prefer the canonical customForges array; fall back to legacy
    // gitlabs/giteas text if migration hasn't run yet in this context.
    const list = Array.isArray(settings.customForges) ? settings.customForges : null;
    if (list) {
        return {
            gitlabs: list.filter((f) => f.type === "gitlab").map((f) => f.domain).join("\n"),
            giteas:  list.filter((f) => f.type === "gitea").map((f)  => f.domain).join("\n"),
        };
    }
    return { gitlabs: settings.gitlabs || "", giteas: settings.giteas || "" };
}

export async function start() {
    const settings = await loadSettings();
    debug = !!settings.swhdebug;
    const { gitlabs, giteas } = customForgesByType(settings);
    dbg("start — settings loaded", {
        customForges: settings.customForges,
        gitlabs, giteas,
        swhdebug: settings.swhdebug,
    });
    const forges = buildForges({ gitlabs, giteas });
    dbg("forges built:", forges.length, "entries");
    const getResults = memoizeWithTTL((url) => computeResults(url, forges, settings), { ttlMs: CACHE_TTL_MS });

    const run = () => handle(window.location.href, forges, settings, getResults);
    run();
    onNavigation(() => {
        removeSaveIcon();
        removeGrantButton();
        run();
    });
}

if (typeof document !== "undefined" && (typeof chrome !== "undefined" ? chrome : globalThis.browser)?.storage) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
}
