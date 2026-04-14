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

- [x] **A. Scaffold.** Create branch, bring in the four items from `refactor`,
      delete the scratch/planning files listed under *Hygiene*. _Done
      2026-04-14 session 2._
- [x] **B. Background script.** Port the `FETCH_SWH_API` proxy (minus the
      `fix/cors-proxy` cruft), wire `createtab` + `onInstalled`. _Done
      2026-04-14 session 2 (`fefc7ea`). Also fixed latent `data.type =
      "createtab"` assignment bug inherited from main._
- [x] **C. Forges + constants.** Flat table, regex pattern/reject/setup per
      forge, `updategitlabhandlers` / `updategiteahandlers` for custom
      instances. No class hierarchy. _Done 2026-04-14 session 2
      (`9f1e5c3`). 19/19 tests pass. Also rewrote forgeHandlers.test.js
      against the flat-table API (the refactor-era version assumed
      classes)._
- [x] **D. API clients.** `src/api/forge.js` (direct fetch, status→errorType)
      and `src/api/swh.js` (background-proxy, same error shape). _Done
      2026-04-14 session 2 (`8445092`)._
- [x] **E. UI.** Vanilla-DOM button + tooltip + click handler, ported from
      main's `insertSaveIcon`. No jQuery. _Done 2026-04-14 session 2
      (`58ef010`). Extended `src/api/swh.js` with `requestSwhSave` while
      here._
- [x] **F. Navigation detector.** `src/content/navigation.js` as described.
      _Done 2026-04-14 session 2 (`af72dff`)._
- [x] **G. Orchestration.** `src/content/main.js` ties it together:
      `Promise.all` for forge + SWH, inflight-dedup Map, cache with TTL,
      navigation callback. _Done 2026-04-14 session 2 (`5cd6a82`). Also
      vendored `src/utils/dateUtils.js` from refactor; 29/29 unit tests
      pass._
- [x] **H. Manifests.** Update `src/manifest-base.json`: drop jQuery from
      `content_scripts.js` list, declare optional host permissions for forge
      APIs, keep SWH as required. _Done 2026-04-14 session 2 (`7876065`).
      Also untracked build artifacts (`extension/updateswh.js`,
      `extension/manifest*.json`) and deleted jquery shim._
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

- 2026-04-14 — branch `lean` created from `main@ef40348`; plan + journal
  committed (`f155297`). No phases started yet.
- 2026-04-14 (session 2) — Phase A complete (`0cbc55d`). A.1 vendored
  build/test infra (manifest generator, vite/jest/babel configs, unit
  tests, package.json, .gitignore); dropped Playwright from package.json.
  A.2 was a no-op (lean was cut clean from main — no scratch files to
  delete). A.3 baseline: `npm test` fails as expected because tests
  import `src/utils/dateUtils.js` and `src/forges/*.js` which land in
  Phases C–E. **Next: Phase B (background.js with SWH proxy).**
- 2026-04-14 (session 2 cont.) — Phase B complete (`fefc7ea`). Rewrote
  `extension/background.js` with FETCH_SWH_API proxy, fixed the
  `data.type = "createtab"` assignment bug from main.
- 2026-04-14 (session 2 cont.) — Phase C complete (`9f1e5c3`). Flat
  `src/forges.js` table + `src/constants.js`. Rewrote
  `tests/unit/forgeHandlers.test.js` against the flat-table API; 19/19
  pass.
- 2026-04-14 (session 2 cont.) — Phase D complete (`8445092`).
  `src/api/forge.js` and `src/api/swh.js` with uniform
  `{ok, data|errorType, status}` shape.
- 2026-04-14 (session 2 cont.) — Phase E complete (`58ef010`). Vanilla
  DOM `insertSaveIcon` in `src/content/ui.js`; `requestSwhSave` added
  to the SWH client.
- 2026-04-14 (session 2 cont.) — Phase F complete (`af72dff`).
  `src/content/navigation.js`: popstate + turbo:load + turbo:render +
  500ms poll.
- 2026-04-14 (session 2 cont.) — Phase G complete (`5cd6a82`).
  Orchestration in `src/content/main.js`; dateUtils vendored; 29/29
  tests pass.
- 2026-04-14 (session 2 cont.) — Phase H complete (`7876065`).
  Manifests drop jQuery; build artifacts untracked. Bundle size:
  18.74 KB (vs. ~85 KB jQuery + 20 KB old monolith). **Next: Phase I
  (unit tests for inflight-dedup cache and navigation detector).**

## Session handoff — 2026-04-14

**Git state**
- Current branch: `lean` @ `f155297` (contains only `LEAN_REWRITE_PLAN.md` +
  `JOURNAL.md` on top of `main@ef40348`).
- Working tree clean; untracked: `Chrome.zip`, `Edge.zip`, `FireFox.zip`,
  `node_modules/` (build artifacts, ignore).
- Stash `stash@{0}` = "On refactor: untracked-from-refactor" contains the
  loose files that were untracked while exploring `refactor`
  (`CLAUDE.md`, `CODEBASE_SUMMARY.md`, `REFACTOR_LOG.md`,
  `TESTING_GUIDE.md`, `MANUAL_TESTING_CHECKLIST.md`, `PACKAGE_READY.md`,
  `.eslintrc.js[~]`, `.eslintrc.yml`, `package-lock.json`,
  `src/utils/sleep.js`, `tmp/`, `extension/0001-*.patch`,
  `extension/TODO`, `extension/popup.new.js`, `extension-2/`,
  `extension-3/`, `todo`, `.#known-instances`). All of this is on the
  **delete list** of Phase A except `CLAUDE.md` and `package-lock.json`.
  Simplest next-session action: **do not restore this stash**; instead copy
  just the two useful files (`CLAUDE.md`, `package-lock.json`) from the
  `refactor` branch when needed, then drop the stash.

**How to resume cleanly next session**
```bash
cd /home/dicosmo/code/updateswh
git checkout lean                     # should already be here
git status                            # confirm clean
cat LEAN_REWRITE_PLAN.md              # decisions + phase list
cat JOURNAL.md                        # lessons from session 1
```

Then start Phase A. Concrete first commits planned:

1. **Phase A.1** — copy from `refactor`: `build/manifest-generator.js`,
   `src/manifest-base.json`, `vite.config.js`, `jest.config.js`,
   `babel.config.js`, the `tests/unit/*.test.js` files, and the relevant
   additions to `package.json` (`scripts.build`, `dev`, `test`, `lint`;
   devDeps `vite`, `jest`, `@babel/preset-env`, `babel-jest`). Leave
   `package-lock.json` alone for now. Commit: "Phase A.1: vendor build and
   test infra from refactor".

2. **Phase A.2** — delete the scratch files listed under *Hygiene* in this
   plan. Commit: "Phase A.2: remove refactor-era scratch and planning docs".

3. **Phase A.3** — run `npm install`, `npm test`, confirm unit tests pass
   before any rewrite begins (they'll likely fail or need trivial adaptation
   because they import from `src/utils/dateUtils.js` and `src/forges/*.js`
   which don't exist yet on `lean`). If they fail, temporarily skip — we'll
   re-enable them as the matching modules come in during Phases C–E.

**Memory system state**
Saved at `/home/dicosmo/.claude/projects/-home-dicosmo-code-updateswh/memory/`:
- `user_role.md` — Roberto's profile
- `feedback_collaboration.md` — four rules (plan-before-code, keep
  progress+journal, avoid .md sprawl, prefer flat over layered)
- `project_lean_rewrite.md` — full context for this rewrite initiative
- `MEMORY.md` — index pointing to the above

**Key facts worth re-reading first thing next session**
- GitHub SPA navigation needs `popstate` + `turbo:load`/`turbo:render` +
  a 500 ms `location.href` poll. **Not** a MutationObserver subtree.
- Forge APIs allow CORS; only SWH needs the background proxy.
- `updategitlabhandlers` / `updategiteahandlers` from main's `updateswh.js`
  must be preserved in the flat forge table — they handle user-defined
  custom instances from `settings.gitlabs` / `settings.giteas`.
- The `isComplete` polling loop in `main`'s `updateswh.js` (line ~333) has a
  latent cache bug: `lastresults` is written synchronously before the async
  chain completes, so a second call on the same URL returns an
  still-in-flight result. The inflight-dedup Map in the rewrite fixes this.
