# Extending updateswh

This document describes the extension's architecture and explains how to add
support for a new forge.

## Objectives

### User-facing

- Show an immediate visual indication of the archival status of the project
  currently displayed on a code-hosting platform.
- One-click operations to trigger a new archival for missing or out-of-date
  repositories, or open the archive page for a known one.
- Support user-defined forge instances on top of the default ones.
- Request only the host permissions that are actually needed, per forge, at
  runtime — no blanket `<all_urls>`.

### Developer-facing

- Adding support for a new forge must be a small, local change.
- The extension must work on both MV2 (Firefox) and MV3 (Chromium) without
  divergent codebases.

## Architecture at a glance

The extension is a small content script (plus a thin background script) that:

1. Listens for SPA navigation (`popstate`, `turbo:load`, `turbo:render`, and a
   500 ms `location.href` poll as a safety net).
2. Matches the current URL against a flat table of forge records in
   `src/forges.js`.
3. Checks whether the extension has host permission for the matched forge
   domain. If not, a dashed-outline grant button is shown instead of the
   normal save button.
4. Calls the forge API directly (CORS-allowed from a content script with
   host permission) in parallel with the Software Heritage API via the
   background script (SWH does not serve CORS).
5. Renders a fixed-position button whose colour reflects the archival state.

The background script also identifies every SWH API call with
`Accept: application/json`, a `User-Agent` carrying the extension name and
version, and an `X-UpdateSWH-Client: updateSWH/<version>` header (the
reliable identifier — Chromium MV3 service workers silently override
`User-Agent`). Fetches are sent with `credentials: "omit"` so an open
browser session on archive.softwareheritage.org cannot trigger CSRF
rejection of the request.

### Source layout

```
extension/
  background.js         SWH fetch proxy + identifying headers +
                        non-JSON-response detection; createtab; onInstalled;
                        custom-forge content-script injection via
                        tabs.onUpdated + tabs.executeScript / scripting.executeScript
  popup.{html,js}       browser action popup — "as GitLab / Gitea / Forgejo"
                        entry points for adding custom forges
  options.{html,js}     options page — per-forge sliders, "Enable all forges",
                        "Add as …" input row, Import / Export forge whitelist JSON
  css/  img/            styles + icons
  updateswh.js          Vite bundle output (gitignored; produced by `npm run build`)
src/
  constants.js          COLOR_CODES, CACHE_TTL_MS, NAV_POLL_MS,
                        SWH_FETCH_TIMEOUT_MS, PENDING_VISIT_STATUSES
  forges.js             flat forge table + matches / findMatchingForge /
                        setupForge; BUILTIN_FORGE_DOMAINS; BUILTIN_DOMAIN_TYPES;
                        gitlabInstanceHandler / giteaInstanceHandler (user-defined)
  permissions.js        chrome.permissions / chrome.scripting wrappers (MV2 + MV3)
  manifest-base.json    single source for MV2 + MV3 manifests
  api/
    forge.js            direct fetch; maps HTTP status to an errorType
    swh.js              sendMessageWithTimeout → background proxy;
                        propagates "challenge" / "timeout" envelopes to the UI
    swhResponse.js      pure shapeSwhResponse — detects non-JSON responses
                        (Anubis-style challenge pages) and returns a
                        { kind: "challenge" } envelope. Mirrored inline in
                        extension/background.js (non-module).
  content/
    main.js             orchestration (permission check, Promise.all, cache,
                        nav); customForgesByType buckets forgejo with gitea
    navigation.js       onNavigation(callback)
    ui.js               vanilla-DOM save button + dashed grant button;
                        createSaveIconSvg builds the icon via createElementNS
                        (no innerHTML — silences the AMO linter)
  utils/
    cache.js            memoizeWithTTL (inflight-dedup + TTL)
    dateUtils.js        isArchiveUpToDate, parseDate
build/
  manifest-generator.js MV2 + MV3 manifests from src/manifest-base.json
  firefox-gecko.json    Firefox-only gecko.id + data_collection_permissions,
                        merged into the Firefox MV2 zip by the Makefile
tests/
  unit/                 jest tests (jsdom) — 102 tests
  e2e/                  headless Chromium end-to-end: mock server +
                        puppeteer harness + 18 scenarios (live smoke gated
                        behind E2E_LIVE=1)
.github/workflows/
  ci.yml                two-tier CI: unit first, e2e after
```

## Colour codes

Defined in `src/constants.js` as `COLOR_CODES`:

| Colour          | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| green           | UP_TO_DATE — archive matches the latest forge commit              |
| lightgreen      | PENDING_VISIT — a SWH visit is currently in flight (created / ongoing), **or** a save was just clicked |
| yellow          | OUT_OF_DATE — archived but older than the forge head              |
| grey            | NOT_ARCHIVED — no visit record for this origin                    |
| brown           | FAILED_UPDATE — last visit completed with status "failed" / "partial" |
| orange          | API_LIMIT — SWH or forge rate limit hit                           |
| red             | FORGE_API_ERROR — forge API request failed                        |
| blue            | SWH_UNREACHABLE — non-JSON response (bot-challenge) or SW timeout |
| dashed outline  | host permission not granted — click to grant                      |

## Permissions model

Forge host permissions are **optional** and requested at runtime. There is no
`<all_urls>` in the required set.

- `host_permissions` (required): only `https://archive.softwareheritage.org/*`.
- `optional_host_permissions` (MV3) / `optional_permissions` (MV2): the
  built-in forge page domains + `api.github.com` + `api.bitbucket.org`,
  plus `<all_urls>` as a last-resort fallback the store reviewers accept.
- `content_scripts.matches`: the built-in page domains. Custom user-added
  domains get dynamic content-script registration via
  `chrome.scripting.registerContentScripts` (MV3) or
  `browser.contentScripts.register` / `tabs.executeScript` (MV2 Firefox).

The canonical list of built-in domains is `BUILTIN_FORGE_DOMAINS` in
`src/forges.js`. When adding a new built-in forge, update:

1. `src/forges.js`:
   - add a record to `DEFAULT_FORGES` (or extend an existing one if it
     shares a setup function with a known forge type);
   - add the domain to `BUILTIN_FORGE_DOMAINS`;
   - add the domain to one of `GITLAB_KNOWN_DOMAINS`,
     `GITEA_KNOWN_DOMAINS`, or `FORGEJO_KNOWN_DOMAINS` if the forge is
     API-compatible with one of those families;
   - add the domain to `BUILTIN_DOMAIN_TYPES` so the options-page row
     shows the right badge.
2. `src/manifest-base.json`: add the domain to `content_scripts[0].matches`
   and `optional_host_permissions`. If the forge uses a separate API
   domain (like `api.github.com`), add that to `optional_host_permissions`
   too.
3. `extension/options.js`: mirror the new domain → type mapping in the
   inline `BUILTIN_DOMAIN_TYPES` constant (options.js is a non-module
   extension page and cannot import from `src/`).
4. `tests/unit/forgeHandlers.test.js`: matching / rejection / setup cases
   + `BUILTIN_FORGE_DOMAINS.toContain(...)` assertion.

## Getting information from a forge

- **Bitbucket:** `GET https://api.bitbucket.org/2.0/repositories/<ws>/<repo>`;
  last update in `updated_on`.
- **GitHub:** `GET https://api.github.com/repos/<entity>/<repo>`; last update
  in `pushed_at`.
- **GitLab:** `GET https://gitlab.com/api/v4/projects/<url-encoded slug>`; last
  update in `last_activity_at`.
- **Gitea:** `GET <origin>/api/v1/repos/<entity>/<repo>`; last update in
  `updated_at`.
- **Forgejo:** identical to Gitea — Forgejo preserves the `/api/v1` surface,
  so `giteaInstanceSetup` is reused; only the forge record's `name` differs
  (for labels / logs).
- **Pagure:** `GET https://pagure.io/api/0/<path>`; last update in
  `date_modified` (unix seconds — `pagureSetup` converts to an ISO string
  so the shared date comparator works unchanged).

In every case a URL prefix is enough to identify a repository page; no DOM
scraping is needed.

## Getting information from Software Heritage

`GET https://archive.softwareheritage.org/api/1/origin/<projecturl>/visit/latest/`
returns `{ date, status, snapshot, ... }`. Because SWH does not serve CORS,
this request is sent through the background script via a `FETCH_SWH_API`
message.

The background:

- merges the default identifying headers with any caller-supplied headers
  (auth tokens win on key collision);
- sets `credentials: "omit"` so a logged-in SWH session cookie can't
  trigger Django CSRF rejection;
- inspects the response's `Content-Type` before calling `.json()` — a
  non-JSON body (typically an Anubis bot-challenge HTML page served with
  200) is surfaced as `{ success: false, kind: "challenge" }` and rendered
  as the blue `SWH_UNREACHABLE` state, distinct from "not archived".

`sendMessageWithTimeout` in `src/api/swh.js` guards against MV3 Chromium
service-worker suspension by rejecting the promise after 15 s (and then
mapping that timeout to `SWH_UNREACHABLE` too).

## Adding support for a new forge

A forge is a record in `src/forges.js`:

```js
{
  name: "GitHub",
  pattern: /^https?:\/\/github\.com\/[^/]+\/[^/]+/,
  reject:  /^https?:\/\/github\.com\/(apps|features|marketplace|orgs|topics|collections|settings|([^/]+\/[^/]+\/search\?))/,
  setup: githubSetup,
},
```

- **`name`** — string shown in debug logs and used by `computeResults` to
  special-case GitHub's auth header.
- **`pattern`** — must match *exactly* the repository URL prefix; the
  matched prefix is what is passed to the SWH API as the origin. Patterns
  stop at the repo segment boundary so sub-pages (`/issues`, `/pulls`, …)
  don't drag extra path into the origin URL.
- **`reject`** — matches forge-reserved prefixes that otherwise look like
  `<user>/<project>` (marketplace, explore, user profiles, repo sub-paths
  without archival semantics, etc.).
- **`setup(projecturl)`** — returns `{ userproject, forgeapiurl, lastupdate }`
  where `lastupdate(response)` extracts the last-change timestamp from the
  parsed JSON response as an ISO string (or returns `null` if absent).

`matches(forge, url)`, `findMatchingForge(url, forges)`, and
`setupForge(url, forge)` in `src/forges.js` do the dispatch. There is no
class hierarchy.

The v0.9.0 Pagure addition is a good worked example — a single
`pagureSetup` function plus one `DEFAULT_FORGES` record, plus the
manifest + options.js + test updates listed in the Permissions section
above. See the commit that introduced it (`git log --grep=Pagure`).

### User-defined instances

Custom GitLab / Gitea / Forgejo instances can be added in three ways:

1. **Popup menu** ("as GitLab" / "as Gitea" / "as Forgejo" while browsing
   the instance): stores `{ domain, type }` into `customForges` and opens
   the options page. Permission is granted by the user flipping the row's
   slider — popups close on the permission dialog in Firefox, which is why
   the popup flow always defers to the options page for the gesture.
2. **Options-page input row** (domain input + "Add as GitLab / Gitea /
   Forgejo"): requests permission inside the click gesture; on grant,
   the new row appears in the list with its slider already on.
3. **Import / Export JSON**: `{ "version": 1, "customForges": [...] }`.
   Import is staged as a preview + "Grant and import" button so the user
   gesture survives the async `FileReader` read. On an empty
   `customForges`, export writes a self-documenting template with a
   `_comment` and a `_example` block that the importer ignores.

All three paths converge on a single canonical shape in
`chrome.storage.local`:

```js
customForges:       [{ domain, type }]     // type ∈ "gitlab" | "gitea" | "forgejo"
customForgeOrigins: ["*://domain/*", ...]  // derived cache for the injector
```

`type: "forgejo"` is routed through the Gitea handler by
`customForgesByType` in `src/content/main.js` (Forgejo's API is Gitea's
`/api/v1`). The distinction is cosmetic — users see "Forgejo" where it
matters, the code reuses the proven handler.

At startup, `buildForges({gitlabs, giteas})` appends
`gitlabInstanceHandler(...)` / `giteaInstanceHandler(...)` records to the
default table, derived from `customForgesByType(settings)`. The background
re-reads `customForgeOrigins` on every `storage.onChanged` and injects the
content script on matching tabs via `tabs.onUpdated`.

### Tests

Unit tests live in `tests/unit/` and run under jest + jsdom:

- `forgeHandlers.test.js` — URL matching / rejection / setup per forge.
- `customForges.test.js` — storage-shape derivation.
- `swhResponse.test.js` — non-JSON and challenge-page detection.
- `swhApi.test.js` — message-timeout and envelope propagation.
- `ui.test.js`, `permissions.test.js`, `navigation.test.js`,
  `cache.test.js`, `dateUtils.test.js` — the surrounding primitives.

End-to-end tests live in `tests/e2e/` and run against real headless
Chromium:

- `tests/e2e/server.js` — configurable mock for forge + SWH endpoints
  (status, content-type, body, delay).
- `tests/e2e/harness.js` — launches Chromium with the unpacked extension,
  attaches CDP Fetch interception on both page and service-worker targets.
- `tests/e2e/scenarios/` — one file per scenario (archival states,
  save-click flows, SPA navigation, storage, request headers, grant
  button, live smoke against real github.com + archive.softwareheritage.org).

Run them with `npm run test:e2e` (or `make e2e`). Live smoke is
opt-in behind `E2E_LIVE=1`.

For a new forge, at minimum: add matching / rejection / setup cases to
`forgeHandlers.test.js`. An e2e scenario is welcome but not required —
the mocked archival-states suite exercises every colour branch through
the forge agnostic code path.

## Build and test

```
npm install
npm test                    # jest (jsdom) — 102 tests
npm run test:e2e            # jest + puppeteer-core (real Chromium) — 18 scenarios
npm run build               # produces extension/updateswh.js + manifests
make                        # build + package FireFox.zip / Chrome.zip / Edge.zip
make e2e                    # alias for npm run test:e2e
```

The Vite bundle is ~27 KB (no jQuery).
`extension/updateswh.js`, `extension/manifest.json`, and
`extension/manifest-v3.json` are build artefacts and are gitignored — run
`npm run build` (or `make`) before loading the extension unpacked.

**Build dependency:** the Makefile merges `build/firefox-gecko.json`
(Firefox-only gecko.id + data_collection_permissions) into the Firefox
zip's manifest at package time, which requires `jq` (`apt-get install jq`
or equivalent).

## Submitting your contribution

Once tested on your new forge and on the existing ones, please open a pull
request at <https://github.com/rdicosmo/updateswh/>. The CI workflow runs
the unit tier on every PR and the e2e tier after unit passes.

Thank you!

## Releasing a new version

Maintainers only. The three zip bundles produced by `make` are uploaded to
the Firefox, Chrome and Edge stores by the project owner. Store dashboard
URLs and account bindings are kept locally in `HOWTO-RELEASE` (gitignored).

1. Bump the version in **both** sources of truth:
   - `src/manifest-base.json` → `"version"` (drives
     `extension/manifest.json` and `extension/manifest-v3.json`)
   - `package.json` → `"version"`
2. `make` — runs `npm run build` and packages
   `FireFox.zip` / `Chrome.zip` / `Edge.zip` at the repo root. Requires
   `jq` for the Firefox gecko merge (see above).
3. Verify both generated manifests **and the zips themselves** report the
   new version (older zips from a pre-bump `make` will otherwise be
   uploaded and rejected by the store):
   ```
   grep '"version"' extension/manifest.json extension/manifest-v3.json
   unzip -p FireFox.zip manifest.json | grep '"version"'
   unzip -p Chrome.zip  manifest.json | grep '"version"'
   ```
   Also confirm the Firefox zip carries the gecko block:
   ```
   unzip -p FireFox.zip manifest.json | grep -A2 browser_specific_settings
   ```
4. `npm test && npm run test:e2e` — 102 unit tests + 18 e2e scenarios must
   stay green.
5. Commit: `Bump version to X.Y.Z`. Tag: `git tag vX.Y.Z`.
6. Push `main` and the tag: `git push origin main vX.Y.Z`.
7. Upload the three zips to the three store dashboards (see
   `HOWTO-RELEASE` for login URLs and account bindings).
