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

## Architecture at a glance

The extension is a small content script (plus a thin background script) that:

1. Listens for SPA navigation (`popstate`, `turbo:load`, `turbo:render`, and a
   500 ms `location.href` poll as a safety net).
2. Matches the current URL against a flat table of forge records.
3. Checks whether the extension has host permission for the matched forge
   domain.  If not, a dashed-outline grant button is shown instead of the
   normal save button.
4. Calls the forge API directly (CORS-allowed) and the Software Heritage API
   via the background script (not CORS-allowed).
5. Renders a fixed-position button whose colour reflects the archival state.

### Source layout

```
extension/
  background.js         SWH CORS proxy + createtab + onInstalled + custom-forge
                        content-script re-registration on startup
  popup.{html,js}       browser action popup
  options.{html,js}     options page — permission grant UI + custom-forge
                        save flow with dynamic content-script registration
  css/  img/            styles + icons
  updateswh.js          Vite bundle output (gitignored; produced by `npm run build`)
src/
  constants.js          COLOR_CODES, CACHE_TTL_MS, NAV_POLL_MS
  forges.js             flat forge table + matches/findMatchingForge/setupForge
                        + BUILTIN_FORGE_DOMAINS export
  permissions.js        chrome.permissions / chrome.scripting wrappers (MV2 + MV3)
  manifest-base.json    single source for MV2 + MV3 manifests
  api/
    forge.js            direct fetch; maps HTTP status to an errorType
    swh.js              chrome.runtime.sendMessage → background proxy
  content/
    main.js             orchestration (permission check, Promise.all, cache, nav)
    navigation.js       onNavigation(callback)
    ui.js               vanilla-DOM save button + dashed grant button
  utils/
    cache.js            memoizeWithTTL (inflight-dedup + TTL)
    dateUtils.js        isArchiveUpToDate, parseDate
build/
  manifest-generator.js MV2 + MV3 manifests from src/manifest-base.json
tests/unit/             jest tests (jsdom) — 67 tests
```

## Colour codes

| Colour        | Meaning                                                     |
| ------------- | ----------------------------------------------------------- |
| green         | archive is up to date                                       |
| yellow        | archived but out of date — click to trigger an update       |
| grey          | not yet archived — click to trigger archival                |
| brown         | last archival visit did not complete — click to retry       |
| orange        | SWH rate limit hit — an access token may help               |
| red           | forge API request failed (private repo? wrong URL?)         |
| dashed outline | host permission not granted — click to grant               |

## Permissions model

Forge host permissions are **optional** and requested at runtime.

- `host_permissions` (required): only `https://archive.softwareheritage.org/*`.
- `optional_host_permissions` (MV3) / `optional_permissions` (MV2): the 13
  built-in forge page domains plus `api.github.com` and `api.bitbucket.org`.
  Listed explicitly in `src/manifest-base.json`.
- `content_scripts.matches`: the 13 built-in page domains.
- Custom forge domains get per-domain permission requests at save time in
  the options page, plus dynamic content-script registration via
  `chrome.scripting.registerContentScripts` (MV3) or
  `browser.contentScripts.register` (MV2 Firefox).

The canonical list of built-in domains is `BUILTIN_FORGE_DOMAINS` in
`src/forges.js`.  When adding a new built-in forge, you must update:

1. `src/forges.js` — add the forge record to `DEFAULT_FORGES` and the domain
   to `BUILTIN_FORGE_DOMAINS` (and to `GITLAB_KNOWN_DOMAINS` or
   `GITEA_KNOWN_DOMAINS` if applicable).
2. `src/manifest-base.json` — add the domain to `content_scripts[0].matches`
   and to `optional_host_permissions`.  If the forge uses a separate API
   domain (like `api.github.com`), add that too.
3. `tests/unit/forgeHandlers.test.js` — add matching/rejection and setup cases.

## Getting information from a forge

- **Bitbucket:** `GET https://api.bitbucket.org/2.0/repositories/<ws>/<repo>`;
  last update in `updated_on`.
- **GitHub:** `GET https://api.github.com/repos/<entity>/<repo>`; last update
  in `pushed_at`.
- **GitLab:** `GET https://gitlab.com/api/v4/projects/<url-encoded slug>`; last
  update in `last_activity_at`.
- **Gitea:** `GET <origin>/api/v1/repos/<entity>/<repo>`; last update in
  `updated_at`.

In every case a URL prefix is enough to identify a repository page; no DOM
scraping is needed.

## Getting information from Software Heritage

`GET https://archive.softwareheritage.org/api/1/origin/<projecturl>/visit/latest/`
returns `{ date, status, ... }`. Because SWH does not serve CORS, this request
is sent through the background script via a `FETCH_SWH_API` message.

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

- **`name`** — string shown in debug logs and used to special-case GitHub's
  auth header.
- **`pattern`** — must match *exactly* the repository URL prefix (this prefix
  is what is passed to the SWH API).
- **`reject`** — matches forge-reserved prefixes that otherwise look like
  `<user>/<project>` (marketplace, explore, user profile pages, …).
- **`setup(projecturl)`** — returns `{ userproject, forgeapiurl, lastupdate }`
  where `lastupdate(response)` extracts the last-change timestamp from the
  parsed JSON response.

`matches(forge, url)`, `findMatchingForge(url, forges)`, and
`setupForge(url, forge)` in `src/forges.js` do the dispatch. There is no class
hierarchy.

### User-defined instances

The options page persists `settings.gitlabs` and `settings.giteas` (whitespace-
or newline-separated domain lists). Clicking **"Save custom forge domains"**:

1. Diffs old vs new domain lists.
2. Calls `chrome.permissions.request` for newly added domains (the button click
   provides the user gesture).
3. Calls `chrome.permissions.remove` for removed domains.
4. Registers / unregisters dynamic content scripts per domain so the content
   script runs on the new pages.
5. Saves the domain strings and the granted-origins list to
   `chrome.storage.local`.

At startup, `buildForges({gitlabs, giteas})` appends
`gitlabInstanceHandler(...)` / `giteaInstanceHandler(...)` records to the
default table. The background script re-registers dynamic content scripts for
custom domains on service-worker restart (MV3).

### Tests

Unit tests live in `tests/unit/`. For a new forge, add matching/rejection and
setup cases to `forgeHandlers.test.js`.

## Build and test

```
npm install
npm test                    # jest (jsdom) — 67 tests
npm run build               # produces extension/updateswh.js + manifests
make                        # build + package Firefox.zip / Chrome.zip / Edge.zip
```

The Vite bundle is ~22 KB (no jQuery). `extension/updateswh.js`,
`extension/manifest.json`, and `extension/manifest-v3.json` are build artefacts
and are gitignored; run `npm run build` (or `make`) before loading the
extension unpacked.

## Submitting your contribution

Once tested on your new forge and on the existing ones, please open a pull
request at <https://github.com/rdicosmo/updateswh/>.

Thank you!

## Releasing a new version

Maintainers only. The three zip bundles produced by `make` are uploaded to the
Firefox, Chrome and Edge stores by the project owner. Store dashboard URLs and
account bindings are kept locally in `HOWTO-RELEASE` (gitignored).

1. Bump the version in **both** sources of truth:
   - `src/manifest-base.json` → `"version"` (drives
     `extension/manifest.json` and `extension/manifest-v3.json`)
   - `package.json` → `"version"`
2. `make` — runs `npm run build` and packages
   `FireFox.zip` / `Chrome.zip` / `Edge.zip` at the repo root.
3. Verify both generated manifests **and the zips themselves** report the
   new version (older zips from a pre-bump `make` will otherwise be
   uploaded and rejected by the store):
   ```
   grep '"version"' extension/manifest.json extension/manifest-v3.json
   unzip -p FireFox.zip manifest.json | grep '"version"'
   unzip -p Chrome.zip  manifest.json | grep '"version"'
   ```
4. `npm test` — 67 tests must stay green.
5. Commit: `Bump version to X.Y.Z`. Tag: `git tag vX.Y.Z`.
6. Push `main` and the tag: `git push origin main vX.Y.Z`.
7. Upload the three zips to the three store dashboards (see
   `HOWTO-RELEASE` for login URLs and account bindings).
