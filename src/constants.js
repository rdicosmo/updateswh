export const COLOR_CODES = {
    UP_TO_DATE: "green",
    OUT_OF_DATE: "yellow",
    FAILED_UPDATE: "brown",
    API_LIMIT: "orange",
    NOT_ARCHIVED: "grey",
    FORGE_API_ERROR: "red",
    SWH_UNREACHABLE: "blue",
    PENDING_VISIT: "lightgreen",
};

/** SWH visit.status values that mean "a visit is in flight right now". */
export const PENDING_VISIT_STATUSES = new Set(["created", "ongoing"]);

export const SWH_FETCH_TIMEOUT_MS = 15_000;

export const CACHE_TTL_MS = 60_000;

export const NAV_POLL_MS = 500;

export const SWH_ORIGIN_VISIT_URL = "https://archive.softwareheritage.org/api/1/origin/";
