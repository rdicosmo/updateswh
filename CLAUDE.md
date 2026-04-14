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

Content script pipeline: navigation detection → URL → forge record → parallel
forge + SWH fetch → colour result → vanilla DOM button.

- `src/content/navigation.js` — `onNavigation(cb)` from `popstate`,
  `turbo:load`, `turbo:render`, and a 500 ms `location.href` poll. No
  MutationObserver.
- `src/content/main.js` — orchestration. `buildForges({gitlabs, giteas})`
  assembles default + user-defined records; `memoizeWithTTL` gives
  inflight-dedup + TTL cache; `Promise.all` fans out forge + SWH.
- `src/forges.js` — flat table of `{name, pattern, reject, setup}` records +
  helpers (`matches`, `findMatchingForge`, `setupForge`). This file is the
  contract documented in `CONTRIBUTING.md`; treat changes to its shape
  seriously.
- `src/api/forge.js` — direct `fetch` (forges allow CORS). Maps HTTP status to
  an errorType from `COLOR_CODES`.
- `src/api/swh.js` — `chrome.runtime.sendMessage({type:"FETCH_SWH_API", ...})`;
  SWH does not serve CORS, so the request goes via the background script.
- `src/content/ui.js` — fixed-position button appended to `<body>`, per-colour
  tooltip + click/right-click handlers, save-flow wrapping the button in an
  `<a>` on success.
- `extension/background.js` — `FETCH_SWH_API` message handler, `createtab`,
  `onInstalled` welcome page.

## Build and test

```
npm install
npm test                # jest + jsdom; 42 tests across cache, navigation,
                        #   forges, dateUtils
npm run build           # vite + manifest-generator
make                    # build + zip for Firefox / Chrome / Edge
```

`src/manifest-base.json` is the single source of truth for both MV2 and MV3.
`build/manifest-generator.js` emits `extension/manifest.json` (MV2) and
`extension/manifest-v3.json` (MV3).

## Gotchas documented in-flight

- `<all_urls>` is a required host permission (not optional). The runtime
  permission-grant UI that would make it optional is listed as *Future work*
  in `LEAN_REWRITE_PLAN.md`; until that ships, shipping only the manifest
  change leaves the extension unable to reach forge APIs. See `JOURNAL.md`
  2026-04-14 session 2.
- The `/(user|explore)/` reject regex on Gitea instances intentionally
  rejects URLs whose path starts with `/user/` or `/explore/` (profile and
  directory pages). A repository literally owned by user `user` would be
  misclassified; no known real-world case.
