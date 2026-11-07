// Checks the store listing text kept under store/ before a release:
// description and summary present, summary within the Chrome Web Store
// limit, release notes written for the version being released.
//
//   node build/check-store-text.js [X.Y.Z]
//
// The version defaults to the one in src/manifest-base.json. Errors are
// printed as GitHub Actions ::error:: lines; the exit status is 1 if any.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Chrome Web Store summary limit; AMO allows 250, Edge has no summary.
export const SUMMARY_MAX = 132;

function readTrimmed(root, rel) {
    const path = join(root, rel);
    return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

export function checkStoreText(root, version) {
    if (!/^\d+(\.\d+)*$/.test(version)) return [`"${version}" is not a version number.`];
    const errors = [];
    if (!readTrimmed(root, "store/description.txt")) {
        errors.push("store/description.txt is missing or empty.");
    }
    const summary = readTrimmed(root, "store/summary.txt");
    const length = [...summary].length;
    if (!summary) {
        errors.push("store/summary.txt is missing or empty.");
    } else if (summary.includes("\n")) {
        errors.push("store/summary.txt must be a single line.");
    } else if (length > SUMMARY_MAX) {
        errors.push(`store/summary.txt has ${length} characters, the Chrome Web Store allows ${SUMMARY_MAX}.`);
    }
    if (!readTrimmed(root, `store/notes/${version}.txt`)) {
        errors.push(`store/notes/${version}.txt is missing or empty: write the release notes of ${version} before tagging it.`);
    }
    return errors;
}

export function manifestVersion(root) {
    return JSON.parse(readFileSync(join(root, "src/manifest-base.json"), "utf8")).version;
}

if (process.argv[1]?.endsWith("check-store-text.js")) {
    const root = process.cwd();
    const version = process.argv[2] || manifestVersion(root);
    const errors = checkStoreText(root, version);
    for (const error of errors) console.log(`::error::${error}`);
    if (errors.length) process.exit(1);
    console.log(`Store text for ${version}: ok.`);
}
