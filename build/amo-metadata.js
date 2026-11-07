// Sets the Firefox AMO listing (description, summary) and the release
// notes of one version from the text kept under store/.
//
//   FIREFOX_JWT_ISSUER=... FIREFOX_JWT_SECRET=... node build/amo-metadata.js [--dry-run] [--version X.Y.Z]
//   FIREFOX_JWT_ISSUER=... FIREFOX_JWT_SECRET=... node build/amo-metadata.js --check-version [--version X.Y.Z]
//
// --check-version only asks AMO whether the version exists, and writes
// exists=true|false to $GITHUB_OUTPUT (or prints it), so that a re-run
// of the Release workflow skips an upload that already went through.
// --dry-run prints the requests, with the Authorization header redacted,
// and makes no network call; it needs no credentials. The version
// defaults to src/manifest-base.json, the add-on GUID comes from
// build/firefox-gecko.json.
//
// API: https://mozilla.github.io/addons-server/topics/api/addons.html
// (Edit, Version Edit) and .../auth.html (JWT, HS256, exp at most five
// minutes after iat, "Authorization: JWT <token>").

import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStoreText, manifestVersion } from "./check-store-text.js";

export const AMO_API = "https://addons.mozilla.org/api/v5";
// Translated fields are objects keyed by locale. Version release notes
// always default to en-US on AMO.
const LOCALE = "en-US";
const JWT_LIFETIME_S = 60;
// The upload action creates the version before it returns, so a 404 on
// the version should not happen; retry a bounded number of times anyway.
const VERSION_ATTEMPTS = 6;
const VERSION_RETRY_MS = 10_000;

export function makeJwt(issuer, secret, nowMs = Date.now(), jti = randomUUID()) {
    const iat = Math.floor(nowMs / 1000);
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: issuer, jti, iat, exp: iat + JWT_LIFETIME_S })}`;
    return `${signed}.${createHmac("sha256", secret).update(signed).digest("base64url")}`;
}

export function buildRequests({ guid, version, description, summary, notes }) {
    const addon = `${AMO_API}/addons/addon/${encodeURIComponent(guid)}`;
    return [
        {
            method: "PATCH",
            url: `${addon}/`,
            body: { description: { [LOCALE]: description }, summary: { [LOCALE]: summary } },
        },
        {
            // The "v" prefix forces a lookup by version number.
            method: "PATCH",
            url: `${addon}/versions/v${version}/`,
            body: { release_notes: { [LOCALE]: notes } },
            attempts: VERSION_ATTEMPTS,
        },
    ];
}

export function describeRequest(req) {
    return [
        `${req.method} ${req.url}`,
        "Authorization: JWT <redacted>",
        "Content-Type: application/json",
        "",
        JSON.stringify(req.body, null, 2),
        "",
    ].join("\n");
}

export async function send(req, { issuer, secret, fetchImpl = fetch, sleep, retryMs = VERSION_RETRY_MS, log = console.log }) {
    const attempts = req.attempts || 1;
    for (let attempt = 1; ; attempt++) {
        const res = await fetchImpl(req.url, {
            method: req.method,
            headers: { Authorization: `JWT ${makeJwt(issuer, secret)}`, "Content-Type": "application/json" },
            body: JSON.stringify(req.body),
        });
        if (res.ok) return;
        if (res.status === 404 && attempt < attempts) {
            log(`${req.method} ${req.url}: 404, attempt ${attempt}/${attempts}, retrying in ${retryMs / 1000} s.`);
            await sleep(retryMs);
            continue;
        }
        const text = (await res.text()).slice(0, 500);
        throw new Error(`${req.method} ${req.url}: HTTP ${res.status} ${text}`);
    }
}

export async function versionExists({ guid, version, issuer, secret, fetchImpl = fetch }) {
    const url = `${AMO_API}/addons/addon/${encodeURIComponent(guid)}/versions/v${version}/`;
    const res = await fetchImpl(url, { headers: { Authorization: `JWT ${makeJwt(issuer, secret)}` } });
    if (res.ok) return true;
    if (res.status === 404) return false;
    throw new Error(`GET ${url}: HTTP ${res.status} ${(await res.text()).slice(0, 500)}`);
}

export function readStoreText(root, version) {
    const errors = checkStoreText(root, version);
    if (errors.length) throw new Error(errors.join("\n"));
    const read = (rel) => readFileSync(join(root, rel), "utf8").trim();
    return {
        description: read("store/description.txt"),
        summary: read("store/summary.txt"),
        notes: read(`store/notes/${version}.txt`),
    };
}

export async function run({ root, version, guid, dryRun, env = {}, fetchImpl, sleep, log = console.log }) {
    const requests = buildRequests({ guid, version, ...readStoreText(root, version) });
    if (dryRun) {
        for (const req of requests) log(describeRequest(req));
        return requests;
    }
    const issuer = env.FIREFOX_JWT_ISSUER;
    const secret = env.FIREFOX_JWT_SECRET;
    if (!issuer || !secret) throw new Error("FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set.");
    for (const req of requests) {
        await send(req, { issuer, secret, fetchImpl, sleep, log });
        log(`${req.method} ${req.url}: done.`);
    }
    return requests;
}

if (process.argv[1]?.endsWith("amo-metadata.js")) {
    const args = process.argv.slice(2);
    const root = process.cwd();
    const versionAt = args.indexOf("--version");
    const version = versionAt >= 0 ? args[versionAt + 1] : manifestVersion(root);
    const gecko = JSON.parse(readFileSync(join(root, "build/firefox-gecko.json"), "utf8"));
    const guid = gecko.browser_specific_settings.gecko.id;
    const main = args.includes("--check-version")
        ? versionExists({
              guid,
              version,
              issuer: process.env.FIREFOX_JWT_ISSUER,
              secret: process.env.FIREFOX_JWT_SECRET,
          }).then((exists) => {
              console.log(`AMO ${exists ? "already has" : "does not have"} version ${version}.`);
              if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `exists=${exists}\n`);
          })
        : run({
              root,
              version,
              guid,
              dryRun: args.includes("--dry-run"),
              env: process.env,
              sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          });
    main.catch((error) => {
        console.log(`::error::${error.message.replaceAll("\n", " ")}`);
        process.exit(1);
    });
}
