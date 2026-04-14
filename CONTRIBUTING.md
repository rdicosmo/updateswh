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

### Developer-facing

- Adding support for a new forge must be a small, local change.

## Architecture at a glance

The extension is a small content script (plus a thin background script) that:

1. Listens for SPA navigation (`popstate`, `turbo:load`, `turbo:render`, and a
   500 ms `location.href` poll as a safety net).
2. Matches the current URL against a flat table of forge records.
3. Calls the forge API directly (CORS-allowed) and the Software Heritage API
   via the background script (not CORS-allowed).
4. Renders a fixed-position button whose colour reflects the archival state.

### Source layout

```
extension/
  background.js         SWH CORS proxy + createtab + onInstalled welcome
  popup.{html,js}       browser action popup
  options.{html,js}     options page
  css/  img/            styles + icons
  updateswh.js          Vite bundle output (gitignored; produced by `npm run build`)
src/
  constants.js          COLOR_CODES, CACHE_TTL_MS, NAV_POLL_MS
  forges.js             flat forge table + matches/findMatchingForge/setupForge
  manifest-base.json    single source for MV2 + MV3 manifests
  api/
    forge.js            direct fetch; maps HTTP status to an errorType
    swh.js              chrome.runtime.sendMessage → background proxy
  content/
    main.js             orchestration (Promise.all, cache, nav wiring)
    navigation.js       onNavigation(callback)
    ui.js               vanilla-DOM save button
  utils/
    cache.js            memoizeWithTTL (inflight-dedup + TTL)
    dateUtils.js        isArchiveUpToDate, parseDate
build/
  manifest-generator.js MV2 + MV3 manifests from src/manifest-base.json
tests/unit/             jest tests (jsdom)
```

## Colour codes

| Colour | Meaning                                                     |
| ------ | ----------------------------------------------------------- |
| green  | archive is up to date                                       |
| yellow | archived but out of date — click to trigger an update       |
| grey   | not yet archived — click to trigger archival                |
| brown  | last archival visit did not complete — click to retry       |
| orange | SWH rate limit hit — an access token may help               |
| red    | forge API request failed (private repo? wrong URL?)         |

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
or newline-separated domain lists). At startup, `buildForges({gitlabs, giteas})`
appends `gitlabInstanceHandler(...)` / `giteaInstanceHandler(...)` records to
the default table.

### Tests

Unit tests live in `tests/unit/`. For a new forge, add matching/rejection and
setup cases to `forgeHandlers.test.js`.

## Build and test

```
npm install
npm test                    # jest (jsdom)
npm run build               # produces extension/updateswh.js + manifests
make                        # build + package Firefox.zip / Chrome.zip / Edge.zip
```

The Vite bundle is ~19 KB (no jQuery). `extension/updateswh.js`,
`extension/manifest.json`, and `extension/manifest-v3.json` are build artefacts
and are gitignored; run `npm run build` (or `make`) before loading the
extension unpacked.

## Submitting your contribution

Once tested on your new forge and on the existing ones, please open a pull
request at <https://github.com/rdicosmo/updateswh/>.

Thank you!
