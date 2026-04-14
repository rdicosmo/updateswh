# Lean rewrite — plan and progress

Branch: `lean` (cut from `main` at `ef40348`).
Started: 2026-04-14.

## Goal

A small, fast, maintainable content script that correctly detects repository
navigation on SPA forges (especially GitHub), without jQuery, without a
subtree-wide MutationObserver, without `navigator.locks`, and without
`setInterval`-based completion polling.

## Why not continue on `refactor`?

- `refactor` did structural work (split into `src/*`, added manifest generator,
  added caching/permissions modules) but kept the fundamentally wrong
  architecture for SPA navigation: a MutationObserver on `<html>` subtree,
  serialized by `navigator.locks`, with 300 ms debounce and a 350 ms trailing
  sleep. It does not work correctly on GitHub (tested).
- It also introduced a `ForgeHandler` class hierarchy (one subclass per forge)
  that replaces the flat, five-row forge table documented in `CONTRIBUTING.md`.
  Over-engineered for the problem.

## What carries over from `refactor`

| Item                                                       | Reason                                   |
| ---------------------------------------------------------- | ---------------------------------------- |
| `build/manifest-generator.js` + `src/manifest-base.json`   | Single source for MV2 + MV3 manifests    |
| `vite.config.js`, `jest.config.js`, `babel.config.js`      | Build + test infra                       |
| `package.json` npm scripts (`build`, `dev`, `test`, `lint`)| Already-wired toolchain                  |
| `extension/background.js` — SWH proxy via `FETCH_SWH_API`  | Only way past SWH's CORS                 |
| `tests/unit/dateUtils.test.js`, `forgeHandlers.test.js`    | Keep green through the rewrite           |

Everything else from `refactor` is discarded.

## Design decisions (confirmed 2026-04-14)

1. **Drop jQuery entirely.** ~80 KB of dependency for ~15 vanilla lines.
2. **Gitignore `extension/updateswh.js`.** It's a Vite build artifact; the
   `Makefile` runs `npm run build` before zipping, so the release process is
   unaffected. Main commits it; we won't.
3. **Keep MV2 for Firefox.** Dual-manifest generator stays.
4. **Delete orphan experimental branches** after `lean` merges:
   `checkevents`, `popstate`, `debugtriggers`, `skipredundant-drops`,
   `weblocks`, `lock`, `csrf`, `help`, `replacebutton`, `esling`, `eslint`,
   `barais-main`, `chrome-v3`, `fix/cors-proxy`, `refactor`.
5. **Playwright integration tests: deferred.** Current
   `tests/integration/extension.test.js` is a 22-line placeholder — drop it
   now, add real tests in a follow-up PR (see *Future work* below).

## The five changes that matter

1. **No jQuery.** Vanilla DOM + `fetch`.
2. **Kill the MutationObserver + locks + sleep stack.** Replace with a ~25-line
   navigation detector: `popstate` + `turbo:load` + `turbo:render` +
   `setInterval(check, 500)` polling `location.href`. Cheap and cross-browser.
3. **`Promise.all` + inflight-dedup Map** instead of the `setInterval`/`isComplete`
   polling loop from main.
4. **Flat forge table** (back to main's `forgehandlers` array style, one file,
   ~90 lines). No base class, no subclasses. This restores the contract
   documented in `CONTRIBUTING.md`.
5. **Split API paths by CORS reality.** Forges (GitHub/GitLab/Bitbucket/Gitea)
   allow CORS → direct `fetch` from content script. SWH does not → proxied
   via background `FETCH_SWH_API` message.

## Target layout

```
extension/
  background.js        ~40 lines  (SWH proxy + createtab + onInstalled)
  popup.html           unchanged from main
  popup.js             unchanged from main
  options.html         unchanged from main
  options.js           unchanged from main
  css/  img/           unchanged
  updateswh.js         (Vite build output, gitignored)
src/
  manifest-base.json
  constants.js         COLOR_CODES, DRIFT_MS, CACHE_TTL_MS
  forges.js            flat table (~90 lines)
  content/
    main.js            ~70 lines  (orchestration)
    navigation.js      ~25 lines  (locationchange detector)
    ui.js              ~130 lines (vanilla-DOM button, click, tooltip)
  api/
    forge.js           ~25 lines  (fetch + status→errorType mapping)
    swh.js             ~40 lines  (background-proxy client)
build/
  manifest-generator.js
tests/unit/            kept from refactor
```

Target total: ~500 lines of new source replacing 640 lines of monolith.

## Phases

- [ ] **A. Scaffold.** Create branch, bring in the four items from `refactor`,
      delete the scratch/planning files listed under *Hygiene*.
- [ ] **B. Background script.** Port the `FETCH_SWH_API` proxy (minus the
      `fix/cors-proxy` cruft), wire `createtab` + `onInstalled`.
- [ ] **C. Forges + constants.** Flat table, regex pattern/reject/setup per
      forge, `updategitlabhandlers` / `updategiteahandlers` for custom
      instances. No class hierarchy.
- [ ] **D. API clients.** `src/api/forge.js` (direct fetch, status→errorType)
      and `src/api/swh.js` (background-proxy, same error shape).
- [ ] **E. UI.** Vanilla-DOM button + tooltip + click handler, ported from
      main's `insertSaveIcon`. No jQuery.
- [ ] **F. Navigation detector.** `src/content/navigation.js` as described.
- [ ] **G. Orchestration.** `src/content/main.js` ties it together:
      `Promise.all` for forge + SWH, inflight-dedup Map, cache with TTL,
      navigation callback.
- [ ] **H. Manifests.** Update `src/manifest-base.json`: drop jQuery from
      `content_scripts.js` list, declare optional host permissions for forge
      APIs, keep SWH as required.
- [ ] **I. Tests.** Run `npm test` — both unit test files must pass as-is.
      Add tests for inflight-dedup cache and navigation detector.
- [ ] **J. Manual smoke.** Load unpacked in Firefox + Chrome, walk through
      GitHub SPA navigation, GitLab, Bitbucket, Codeberg, custom Gitea
      instance. Log icon states.
- [ ] **K. Docs.** Rewrite `CONTRIBUTING.md` to match the flat-table style (it
      still describes the old API). Update `README.md` developer section.
      Update `CLAUDE.md`.
- [ ] **L. Merge to main, delete orphan branches** (the 15 listed above).

## Hygiene — files to delete in Phase A

- `extension-2/`, `extension-3/`, `tmp/`
- `todo`, `extension/TODO`, `extension/popup.new.js`,
  `extension/0001-Add-support-for-POST-queries-to-forges.patch`
- `REFACTOR_LOG.md`, `CODEBASE_SUMMARY.md`, `TESTING_GUIDE.md`,
  `MANUAL_TESTING_CHECKLIST.md`, `PACKAGE_READY.md`, `CORS_FIX_README.md`
- `tests/integration/`, `playwright.config.js`
- `.eslintrc.js~`, `.#known-instances`
- Committed build artifacts (`Chrome.zip`, `Edge.zip`, `FireFox.zip`) if any

Kept at root: `README.md`, `CONTRIBUTING.md` (rewritten), `HOWTO-RELEASE`,
`LICENSE`, `LEAN_REWRITE_PLAN.md`, `JOURNAL.md`, `CLAUDE.md`.

## Future work (post-merge)

- **Real Playwright integration tests.** Scope: launch Chromium with the
  unpacked extension via `launchPersistentContext` + `--load-extension`, mount
  static HTML fixtures that mimic forge repo pages, use `page.route()` to stub
  forge + SWH responses deterministically for each colour code, drive SPA
  navigation with `history.pushState`, assert button state. Expected size:
  200–400 lines including fixtures and CI wiring. Own branch / own PR.
- **Navigation API** (`window.navigation.addEventListener('navigate', …)`).
  Chrome 102+ has it natively; Firefox doesn't yet. Once Firefox ships,
  it can replace the 500 ms polling tick entirely.
- **Options page: add/remove custom forge instances with per-domain runtime
  permission prompt.** Ties in with the MV3 optional-host-permission story.

## Progress log

_Append one line per meaningful change. Keep terse._

- 2026-04-14 — branch `lean` created from `main@ef40348`; plan committed.
