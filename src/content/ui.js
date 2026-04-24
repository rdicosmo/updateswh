import { COLOR_CODES } from "../constants.js";
import { requestSwhSave } from "../api/swh.js";
import { openOptionsPage } from "../permissions.js";

const SELECTOR = ".swh-save-button";
const GRANT_SELECTOR = ".swh-grant-button";
const SWH_HELP_URL = "https://www.softwareheritage.org/updateswh-8-x/#missingrepo";
const SWH_SAVE_LIST_URL = "https://archive.softwareheritage.org/save/list/";
const SWH_HOME_URL = "https://archive.softwareheritage.org/";
const SWH_UNREACHABLE_TITLE =
    "Cannot reach the SWH API from the extension.\n" +
    "The archive may be temporarily unavailable or blocking the request.\n" +
    "Click to open archive.softwareheritage.org to check.";
// Build the save-icon SVG via DOM APIs instead of assigning a string to
// innerHTML. Firefox's add-on linter flags every innerHTML assignment,
// and even though the string here is a static constant (not user input)
// the DOM-built form is both warning-free and marginally faster.
const SVG_NS = "http://www.w3.org/2000/svg";
const SAVE_ICON_PATH =
    "M48 96V416c0 8.8 7.2 16 16 16H384c8.8 0 16-7.2 16-16V170.5c0-4.2-1.7-8.3-4.7-11.3l33.9-33.9c12 12 18.7 28.3 18.7 45.3V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96C0 60.7 28.7 32 64 32H309.5c17 0 33.3 6.7 45.3 18.7l74.5 74.5-33.9 33.9L320.8 84.7c-.3-.3-.5-.5-.8-.8V184c0 13.3-10.7 24-24 24H104c-13.3 0-24-10.7-24-24V80H64c-8.8 0-16 7.2-16 16zm80-16v80H272V80H128zm32 240a64 64 0 1 1 128 0 64 64 0 1 1 -128 0z";

function createSaveIconSvg() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("height", "3em");
    svg.setAttribute("viewBox", "0 0 448 512");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", SAVE_ICON_PATH);
    svg.appendChild(path);
    return svg;
}

let saveRequestedFor = "";

function swhArchiveUrl(projecturl) {
    return `https://archive.softwareheritage.org/browse/origin/directory/?origin_url=${encodeURI(projecturl)}`;
}

function dayOf(iso) {
    return iso ? String(iso).split("T")[0] : "";
}

function createButton() {
    const btn = document.createElement("div");
    btn.className = "swh-save-button";
    const icon = document.createElement("div");
    icon.className = "swh-save-icon";
    icon.appendChild(createSaveIconSvg());
    btn.appendChild(icon);
    return btn;
}

function wrapInAnchor(btn, href) {
    const a = document.createElement("a");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.href = href;
    btn.parentNode.insertBefore(a, btn);
    a.appendChild(btn);
    return a;
}

function unwrapFromAnchor(btn) {
    const parent = btn.parentNode;
    if (parent && parent.tagName === "A") {
        parent.parentNode.insertBefore(btn, parent);
        parent.remove();
    }
}

function setColor(btn, color) {
    for (const c of Object.values(COLOR_CODES)) btn.classList.remove(c);
    btn.classList.remove("lightgreen");
    btn.classList.add(color);
}

function onRightClickOpenArchive(btn, projecturl) {
    btn.addEventListener("mousedown", (event) => {
        if (event.button === 2) {
            chrome.runtime.sendMessage({ type: "createtab", url: swhArchiveUrl(projecturl) });
        }
    });
}

function onSaveClick(btn, projecturl, settings) {
    btn.addEventListener("click", async () => {
        const saveUrl = `https://archive.softwareheritage.org/api/1/origin/save/git/url/${encodeURI(projecturl)}/`;
        if (saveRequestedFor === saveUrl) return;
        const result = await requestSwhSave(projecturl, { swhtoken: settings.swhtoken });
        if (result.ok) {
            saveRequestedFor = saveUrl;
            unwrapFromAnchor(btn);
            setColor(btn, "lightgreen");
            btn.setAttribute(
                "title",
                "SWH update requested already!\nClick to go to the request status page.\nThe archival takes a few minutes, and the\nbutton may not be up to date in the meantime.",
            );
            wrapInAnchor(btn, SWH_SAVE_LIST_URL);
            if (settings.showrequest) {
                chrome.runtime.sendMessage({ type: "createtab", url: SWH_SAVE_LIST_URL });
            }
        } else if (result.kind === "challenge" || result.kind === "timeout") {
            unwrapFromAnchor(btn);
            setColor(btn, COLOR_CODES.SWH_UNREACHABLE);
            btn.setAttribute("title", SWH_UNREACHABLE_TITLE);
            wrapInAnchor(btn, SWH_HOME_URL);
        } else {
            unwrapFromAnchor(btn);
            setColor(btn, COLOR_CODES.FORGE_API_ERROR);
            btn.setAttribute("title", `Archival failed: ${result.error || "unknown"}.`);
            wrapInAnchor(btn, SWH_HELP_URL);
        }
    });
}

export function removeSaveIcon() {
    const existing = document.querySelector(SELECTOR);
    if (!existing) return;
    unwrapFromAnchor(existing);
    existing.remove();
}

export function saveIconPresent() {
    return !!document.querySelector(SELECTOR);
}

export function saveIconColor() {
    const el = document.querySelector(SELECTOR);
    if (!el) return null;
    for (const c of Object.values(COLOR_CODES)) if (el.classList.contains(c)) return c;
    return null;
}

export function removeGrantButton() {
    const existing = document.querySelector(GRANT_SELECTOR);
    if (existing) existing.remove();
}

export function grantButtonPresent() {
    return !!document.querySelector(GRANT_SELECTOR);
}

/**
 * Show a distinct dashed-outline button when the extension lacks
 * host permission for the current forge.  Clicking it opens the
 * extension's options page where the user can grant permissions.
 *
 * (Content scripts cannot call chrome.permissions.request directly;
 * the options page has the grant UI.)
 */
export function insertGrantButton(forgeDomain) {
    if (document.querySelector(GRANT_SELECTOR)) return;
    if (document.querySelector(SELECTOR)) return;

    const btn = document.createElement("div");
    btn.className = "swh-grant-button";
    const icon = document.createElement("div");
    icon.className = "swh-save-icon";
    icon.appendChild(createSaveIconSvg());
    btn.appendChild(icon);
    btn.setAttribute(
        "title",
        `UpdateSWH needs permission for ${forgeDomain}.\nClick to open settings and grant access.`,
    );
    btn.addEventListener("click", () => {
        openOptionsPage();
    });
    document.body.appendChild(btn);
}

export function insertSaveIcon(results, settings = {}) {
    if (document.querySelector(SELECTOR)) return;

    const { color, projecturl, forgelastupdate, swhlastupdate } = results;
    const forgeDay = dayOf(forgelastupdate);
    const swhDay = dayOf(swhlastupdate);

    const btn = createButton();
    document.body.appendChild(btn);
    setColor(btn, color);

    if (color === COLOR_CODES.UP_TO_DATE) {
        btn.setAttribute(
            "title",
            `Good news: archive is up to date!\nLast visit on: ${swhDay}\nClick to open the archive page.`,
        );
        wrapInAnchor(btn, swhArchiveUrl(projecturl));
        return;
    }

    if (color === COLOR_CODES.FORGE_API_ERROR) {
        btn.setAttribute(
            "title",
            "Could not get information:\nprivate repository?\nnon repository GitLab path?\nwrong values in setting?",
        );
        wrapInAnchor(btn, SWH_HELP_URL);
        return;
    }

    if (color === COLOR_CODES.API_LIMIT) {
        btn.setAttribute(
            "title",
            "Cannot trigger archival!\nIs archive.softwareheritage.org in maintenance?\nIf not, you used up the API call quota.\nClick to read more on the help page.",
        );
        wrapInAnchor(btn, SWH_HELP_URL);
        return;
    }

    if (color === COLOR_CODES.SWH_UNREACHABLE) {
        btn.setAttribute("title", SWH_UNREACHABLE_TITLE);
        wrapInAnchor(btn, SWH_HOME_URL);
        return;
    }

    if (color === COLOR_CODES.PENDING_VISIT) {
        btn.setAttribute(
            "title",
            `Archival in progress.\nLatest visit recorded on ${swhDay || "(unknown)"}.\nCheck back in a few minutes.\nClick to open the save queue.`,
        );
        wrapInAnchor(btn, SWH_SAVE_LIST_URL);
        return;
    }

    if (color === COLOR_CODES.OUT_OF_DATE) {
        btn.setAttribute(
            "title",
            `Archival copy is not current.\nLast changed  on ${forgeDay}.\nLast archival on ${swhDay}.\nClick to trigger an update\nRight click to view last archival`,
        );
        onRightClickOpenArchive(btn, projecturl);
    } else if (color === COLOR_CODES.NOT_ARCHIVED) {
        btn.setAttribute("title", "Not yet archived.\nClick to trigger archival");
    } else if (color === COLOR_CODES.FAILED_UPDATE) {
        btn.setAttribute(
            "title",
            `Last archival tried on ${swhDay} failed.\nClick to try again, but beware:\nthere may be technical issues\nthat prevent archival at the moment.\nRight click to view last archival`,
        );
        onRightClickOpenArchive(btn, projecturl);
    }

    onSaveClick(btn, projecturl, settings);
}
