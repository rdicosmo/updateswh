# Repository guide for Claude Code

Browser extension that shows the archival state of the current repository in
Software Heritage and offers one-click re-archival.

## Ground rules

- This codebase deliberately stays small. Prefer flat data and small functions
  over class hierarchies. Two earlier attempts (`refactor` branch with a
  `ForgeHandler` class tree; a heavy MutationObserver + `navigator.locks` +
  sleep stack) were abandoned for being over-engineered and ineffective on
  GitHub's SPA. See `JOURNAL.md` for the history.
- No jQuery. Vanilla DOM + `fetch` only.
- Two tracking docs (`LEAN_REWRITE_PLAN.md`, `JOURNAL.md`) — don't spawn more.
  Keep decisions in the plan, retrospectives in the journal.
- `extension/updateswh.js`, `extension/manifest.json`,
  `extension/manifest-v3.json` are gitignored build artefacts. Run
  `npm run build` (or `make`) before loading the extension unpacked.

## Architecture

Content script pipeline: navigation detection → URL → forge record →
permission check → parallel forge + SWH fetch → colour result → vanilla
DOM button. When host permission is missing, a distinct dashed-outline
grant button is shown instead.

- `src/content/navigation.js` — `onNavigation(cb)` from `popstate`,
  `turbo:load`, `turbo:render`, and a 500 ms `location.href` poll. No
  MutationObserver.
- `src/content/main.js` — orchestration. `buildForges({gitlabs, giteas})`
  assembles default + user-defined records; `memoizeWithTTL` gives
  inflight-dedup + TTL cache; `Promise.all` fans out forge + SWH.
  Before fetching, checks `hasOrigins` for the current domain; if
  missing, renders the grant button via `ui.js`.
- `src/forges.js` — flat table of `{name, pattern, reject, setup}` records +
  helpers (`matches`, `findMatchingForge`, `setupForge`). Also exports
  `BUILTIN_FORGE_DOMAINS` — the 13 known domains used in manifest
  match patterns and optional host permissions. This file is the
  contract documented in `CONTRIBUTING.md`; treat changes to its shape
  seriously.
- `src/permissions.js` — thin wrappers over `chrome.permissions` and
  `chrome.scripting` / `browser.contentScripts` for runtime host-permission
  management. Handles MV2 (Firefox) and MV3 (Chrome/Edge) paths.
  Exports: `hasOrigins`, `requestOrigins`, `removeOrigins`,
  `listGrantedOrigins`, `originPattern`, `domainPatterns`,
  `registerContentScript`, `unregisterContentScript`.
- `src/api/forge.js` — direct `fetch` (forges allow CORS). Maps HTTP status to
  an errorType from `COLOR_CODES`.
- `src/api/swh.js` — `sendMessageWithTimeout({type:"FETCH_SWH_API", ...})`;
  SWH does not serve CORS, so the request goes via the background script.
  Timeout (15 s) guards against MV3 Chrome service-worker suspension
  dropping the response. `kind: "challenge"` / `kind: "timeout"` envelopes
  signal SWH-unreachable states.
- `src/api/swhResponse.js` — pure `shapeSwhResponse(response)` helper that
  converts a fetch Response to the `{success, data|error, status, kind?}`
  envelope. Mirrored inline in `extension/background.js` (which is not an
  ES module); `swhResponse.test.js` is the canonical coverage.
- `src/content/ui.js` — fixed-position button appended to `<body>`, per-colour
  tooltip + click/right-click handlers, save-flow wrapping the button in an
  `<a>` on success. Also renders the dashed-outline grant button
  (`insertGrantButton`) when host permission is missing; clicking it
  calls `chrome.permissions.request` from the user gesture. Blue
  `SWH_UNREACHABLE` state links to `archive.softwareheritage.org` so
  users can refresh a bot-challenge cookie.
- `extension/background.js` — `FETCH_SWH_API` message handler (checks
  `Content-Type` to detect bot-challenge pages), `createtab`,
  `onInstalled` welcome page + options-page opener.  On startup,
  re-registers dynamic content scripts for custom forge domains.
- `extension/options.js` — settings page. "Grant access to all built-in
  forges" batch button reads `optional_host_permissions` from the
  manifest at runtime. "Save custom forge domains" button diffs
  domain lists, requests/revokes permissions, and registers/unregisters
  dynamic content scripts per domain.

## Build and test

```
npm install
npm test                # jest + jsdom; 88 tests across cache, navigation,
                        #   forges, dateUtils, permissions, UI,
                        #   swhResponse, swhApi
npm run build           # vite + manifest-generator
make                    # build + zip for Firefox / Chrome / Edge
```

`src/manifest-base.json` is the single source of truth for both MV2 and MV3.
`build/manifest-generator.js` emits `extension/manifest.json` (MV2) and
`extension/manifest-v3.json` (MV3).

## Permissions model

Forge host permissions are **optional** — the extension requests them at
runtime rather than demanding `<all_urls>` at install.

- `host_permissions` (required): only `https://archive.softwareheritage.org/*`
  (SWH API proxy in the background script).
- `optional_host_permissions` (MV3) / `optional_permissions` (MV2): the 13
  built-in forge page domains + 2 API-only domains (`api.github.com`,
  `api.bitbucket.org`). Listed explicitly in `src/manifest-base.json`.
- `content_scripts.matches`: the 13 built-in page domains. The content
  script only injects on these pages (plus dynamically registered custom
  forge domains).
- Custom Gitea/GitLab instances added via the options page get per-domain
  permission requests at save time, and dynamic content-script registration
  via `chrome.scripting.registerContentScripts` (MV3) /
  `browser.contentScripts.register` (MV2 Firefox).
- Wildcard forge entries (`gitlab.*.*`, `gitea.*.*`) remain in
  `DEFAULT_FORGES` for URL matching but cannot be expressed as Chrome
  match patterns. Users must add specific instances via the options page.
- The `BUILTIN_FORGE_DOMAINS` export in `src/forges.js` is the canonical
  list of built-in domains. When adding a new built-in forge, update this
  array AND the `content_scripts.matches` + `optional_host_permissions`
  lists in `src/manifest-base.json`.

## Gotchas documented in-flight

- The `/(user|explore)/` reject regex on Gitea instances intentionally
  rejects URLs whose path starts with `/user/` or `/explore/` (profile and
  directory pages). A repository literally owned by user `user` would be
  misclassified; no known real-world case.
- SWH deployed Anubis in front of `archive.softwareheritage.org`, which
  returns a 200 + HTML JS-challenge page to unauthenticated API callers.
  v0.9.0 detects that (non-JSON body on an
  ok response) and surfaces a blue `SWH_UNREACHABLE` state with a
  tooltip asking the user to visit the archive once. The real fix is
  server-side: exclude `/api/*` from Anubis. See `JOURNAL.md`
  2026-04-23.
