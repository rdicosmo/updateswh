import { COLOR_CODES, CACHE_TTL_MS } from "../constants.js";
import { buildForges, findMatchingForge, setupForge } from "../forges.js";
import { fetchForgeApi, githubAuthHeaders } from "../api/forge.js";
import { fetchSwhLatestVisit } from "../api/swh.js";
import { isArchiveUpToDate } from "../utils/dateUtils.js";
import { memoizeWithTTL } from "../utils/cache.js";
import { insertSaveIcon, removeSaveIcon, saveIconPresent, saveIconColor } from "./ui.js";
import { onNavigation } from "./navigation.js";

function getBrowser() {
    if (typeof chrome !== "undefined" && chrome?.storage) return chrome;
    return globalThis.browser;
}

function loadSettings() {
    return new Promise((resolve) => {
        getBrowser().storage.local.get(null, (items) => resolve(items || {}));
    });
}

async function computeResults(url, forges, settings) {
    const forge = findMatchingForge(url, forges);
    if (!forge) return null;

    const specs = setupForge(url, forge);
    const { projecturl, forgeapiurl, forgename, lastupdate } = specs;

    const headers = forgename === "GitHub" ? githubAuthHeaders(settings.ghtoken) : {};
    const [forgeResult, swhResult] = await Promise.all([
        fetchForgeApi(forgeapiurl, { headers }),
        fetchSwhLatestVisit(projecturl, { swhtoken: settings.swhtoken }),
    ]);

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

    if (swhResult.data.status !== "full") {
        results.color = COLOR_CODES.FAILED_UPDATE;
    } else if (isArchiveUpToDate(results.forgelastupdate, results.swhlastupdate)) {
        results.color = COLOR_CODES.UP_TO_DATE;
    } else {
        results.color = COLOR_CODES.OUT_OF_DATE;
    }
    return results;
}

async function handle(url, forges, settings, getResults) {
    const forge = findMatchingForge(url, forges);
    if (!forge) {
        removeSaveIcon();
        return;
    }
    if (saveIconPresent() && saveIconColor() !== COLOR_CODES.API_LIMIT) return;

    const results = await getResults(url);
    if (!results) return;
    if (window.location.href !== url) return;
    insertSaveIcon(results, settings);
}

export async function start() {
    const settings = await loadSettings();
    const forges = buildForges({ gitlabs: settings.gitlabs, giteas: settings.giteas });
    const getResults = memoizeWithTTL((url) => computeResults(url, forges, settings), { ttlMs: CACHE_TTL_MS });

    const run = () => handle(window.location.href, forges, settings, getResults);
    run();
    onNavigation(() => {
        removeSaveIcon();
        run();
    });
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
}
