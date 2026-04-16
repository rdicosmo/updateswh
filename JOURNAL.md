# Journal — AI + human collaboration on updateswh

A record of how Roberto (the human) and Claude (the AI assistant) work together
on this project, and what each party can learn from it. Append-only, dated,
terse. Lessons over narration.

---

## 2026-04-14 — Session 1: planning the lean rewrite

**What happened.** Fresh conversation on the `refactor` branch. Roberto asked
for a `CLAUDE.md`, then asked the AI to explore the branch landscape and report
the state of the refactor. The refactor turned out to be a structural rework
that didn't address the real problems (SPA navigation on GitHub, wasteful
MutationObserver + locks + polling). Roberto asked for a "clean, efficient,
maintainable and elegant" plan, starting from `main`. The AI proposed a
concrete plan with five named open decisions. Roberto answered each directly.
The AI started cutting the `lean` branch.

**What went well.**
- The AI produced a single plan with named decision points instead of
  implementing speculatively. Roberto answered them individually ("drop
  jquery, ok for gitignore, keep MV2 for older browsers, delete orphan
  branches, give me more context for integration tests"). Clean handoff.
- The exploration of the branch history surfaced actionable findings: the
  observer bug in `observer.js:74` (check order), the SPA-navigation gap
  (no `popstate`/`turbo:load` handling), and the dead `extension-2/` /
  `extension-3/` directories.
- One decision ("integration tests: keep or drop?") got the right
  treatment: the AI opened the placeholder file, discovered it was 22 lines
  of `expect(true).toBe(true)` with a broken webServer config, reported that
  honestly, and recommended deferral. Roberto agreed and asked for the
  deferral to be noted in the plan. Small example of "look before recommending."

**What the AI should do more of.**
- Confirm design before cutting code on anything multi-file. This session
  worked because the plan was reviewed; on smaller tasks the same instinct
  can shortcut.
- Be specific with file:line references. Roberto reads them.

**What the AI should do less of.**
- The initial `CLAUDE.md` was ~60 lines of architecture prose. Borderline
  for this project — could have been half the length.
- Tendency to generate .md files (the refactor branch had six planning docs).
  Roberto flagged the sprawl. Two tracking files (plan + journal) is the
  target, not ten.

**What Roberto could do to help the AI.**
- Keep confirming design points explicitly. The "answer five questions" style
  works well; it scales to future decision points in later sessions.
- Pointing out when a recommendation lands (as he did on the flat forge
  table vs. class hierarchy choice) helps the AI calibrate between
  over-engineering and under-engineering for this codebase.

**Lessons.**
1. On an abandoned-but-large refactor, the right move is often a fresh branch
   that cherry-picks the handful of genuinely useful pieces, not a "finish
   the refactor" effort. Identify the pieces by their actual contribution to
   the real goal, not by their position in the old plan.
2. A SPA navigation bug is rarely fixed by a bigger observer. Usually the
   answer is fewer events, of the right kind (`popstate`, framework-native
   like `turbo:load`, or a cheap 500 ms URL-change poll).
3. "Integration test placeholder" files are a liability unless they run. An
   honest "drop it, defer it, here's what real tests would look like" is
   worth more than scaffolding that lies green.

---

## 2026-04-14 — Session 2: Phase A scaffold

**What happened.** Resumed on `lean` at `f155297`. Executed Phase A in one
pass. A.1: `git checkout refactor -- <files>` pulled manifest generator,
vite/jest/babel configs, and the two unit tests; wrote a fresh
`package.json` dropping `@playwright/test` and the `test:integration`
script (per the deferral decision); added a conservative `.gitignore`.
A.2 turned out to be a no-op — every file on the Hygiene delete list
lives on `refactor`, not on `lean`. Since `lean` was cut from `main@ef40348`,
not from `refactor`, there was nothing to remove. A.3: `npm install` was
already satisfied (node_modules carried over); `npm test` failed exactly
as predicted because the tests import `src/utils/dateUtils.js` and
`src/forges/*.js` which come in later phases.

**Lessons.**
1. Writing the Hygiene list against the wrong branch was a small planning
   miss — the list described `refactor`'s tree, but Phase A.2 executes on
   `lean`, which doesn't have those files. Harmless here, but worth noting:
   when a plan says "delete X", confirm X actually exists on the branch
   the phase runs against.
2. Conservative `.gitignore` at scaffold time is better than aspirational.
   I initially listed `extension/updateswh.js` and `extension/manifest.json`
   — both currently tracked on `lean`. Listing tracked files in
   `.gitignore` causes confusion (git keeps tracking them) without benefit.
   Better: gitignore them only at the moment we delete the committed
   copies and switch to build-output workflow. Kept `.gitignore` to just
   node_modules, zips, HOWTORESUME, editor backups, package-lock.
3. Checkpoints are cheap. Three commits for Phase A (one real, two
   implicit) keeps the history honest about what was done vs. what was
   a no-op, and gives the next session a clean rewind point.

---

## 2026-04-14 — Session 2 cont.: Phases B and C

**What happened.** Phase B ported `extension/background.js` with the
FETCH_SWH_API proxy, and while at it fixed a latent bug in main
(`data.type = "createtab"` was an assignment, not a comparison — the
original handler was triggering on every message that reached it, and
only the later short-circuit saved it).

Phase C was where the lean/refactor design conflict surfaced concretely:
`tests/unit/forgeHandlers.test.js` was written against the refactor's
class hierarchy (`new GitHub()`, `toBeInstanceOf(GitHub)`). I paused
before writing `src/forges.js` and surfaced the conflict to Roberto with
two explicit options. He picked rewriting the test against the flat
table (option A). Good exchange — it would have been wasteful to keep
the class tests green on top of a non-class implementation.

Implementation: `src/forges.js` as a `DEFAULT_FORGES` array plus
`matches`, `findMatchingForge`, `setupForge`, `gitlabInstanceHandler`,
`giteaInstanceHandler`, and `buildForges({gitlabs, giteas})`. 19/19
tests pass after one test-authoring bug — I used the literal username
`user` in Gitea URLs, which collided with the `/(user|explore)/` reject
prefix inherited from main.

**Lessons.**
1. Surface design conflicts at the phase boundary, not after writing
   code. The test file conflict was visible the moment I re-read its
   imports; stopping to ask beats writing a class-hierarchy-compatible
   shim just to keep green.
2. Regex reject rules inherited from main have subtle assumptions about
   likely usernames. The `/user/` prefix treats path position 1 = "user"
   as a profile page. Real usernames don't collide; test fixtures did.
   Noted the assumption rather than "fixing" the regex — changing
   published patterns risks introducing real-world regressions.
3. Rewriting tests to match a design decision is not test deletion.
   The scope and coverage stayed equivalent; only the API surface
   changed.

---

## 2026-04-14 — Session 2 cont.: smoke test on GitHub, red-button fix

**What happened.** After completing Phases A–I and running `npm run
build`, Roberto loaded the extension. GitLab instances worked; GitHub
showed a red button on every project page. Console screenshots
(`/tmp/console-gh-problem*.png`) contained only GitHub's own errors —
none from the extension — which narrowed the failure to a silent
permission denial.

Root cause: Phase H implemented "declare optional host permissions for
forge APIs" literally by moving `<all_urls>` from required
`host_permissions` to `optional_permissions`. But the runtime prompt
that asks the user to grant those permissions was always in *Future
work*, not in this PR. End state: content script can't fetch
api.github.com, the fetch catch returns `FORGE_API_ERROR`, the button
is red. Fixed by restoring `<all_urls>` to required permissions.

**Lesson.** The plan treated "optional host permissions" as a
single-line Phase H item. It isn't — it's a two-part story (manifest
declaration + runtime grant UI), and shipping only part one leaves
the extension broken. When a plan line could plausibly be split
across phases, either do both parts together or keep the old
behaviour until the second part lands. Halfway is worse than either
end.

---

## 2026-04-16 — Session: scoping runtime host permissions

**Context.** After 0.7.1 ships, the only remaining *Future work* item
that directly affects users is the long-deferred runtime-permission
story: remove `<all_urls>` and ask per origin. Previous session
(2026-04-14 session 2) learned the hard way that this is a two-part
change (manifest + runtime grant UI); shipping only part one broke
the extension. Cut a new branch `feature/runtime-host-permissions`
from `main` to do both parts together.

**Decisions (Roberto, 2026-04-16).** Scope: both MV2 and MV3. UX:
lazy grants with an install-time batch prompt for the five built-in
forges. Missing-permission button: distinct shape + distinct
tooltip (not a reused colour code). Options page: extend the
existing one. Custom-forge flow: request the origin at options
save-time.

**Non-obvious finding while scoping.** `<all_urls>` lives in *two*
places: `host_permissions` (network) and `content_scripts.matches`
(script injection). Only the first was in my mental model at first.
Both have to move for the store to stop flagging broad access.
Matches list for the five built-ins is static (generated once from
`DEFAULT_FORGES`); user-added Gitea/GitLab domains need dynamic
registration via `chrome.scripting.registerContentScripts` (MV3)
or `browser.contentScripts.register` (MV2 Firefox) — same shim
module.

**Plan.** Seven phases RP-A … RP-G documented in
`LEAN_REWRITE_PLAN.md` under "Runtime host permissions". Per the
2026-04-14 lesson, no phase is considered shippable in isolation —
the whole branch lands together.

---

## 2026-04-16 — Session cont.: Firefox smoke test

**What happened.** Implemented RP-A through RP-G, then hit six bugs
during Firefox ESR smoke testing that required iterative fixes:

1. `chrome.permissions` not available in content scripts — proxied
   `hasOrigins` through background via `CHECK_PERMISSION` message.
   Grant button opens options page instead of calling
   `permissions.request` inline.
2. `permissions.request` fails in embedded options page
   (`chrome_style: true`) — switched to `open_in_tab: true`.
3. `permissions.request` can only grant origins declared in the
   manifest's `optional_permissions` — added `<all_urls>` to
   `optional_host_permissions` (stores flag required, not optional).
4. Firefox normalizes `*://` match patterns into separate `http://`
   and `https://` entries in `getAll()` — replaced with
   `permissions.contains` per origin.
5. `browser = chrome` at top of extension pages shadows the native
   Firefox `browser` global — `chrome.contentScripts` is undefined,
   `contentScripts.register` silently fails.
6. Even after the `globalThis.browser` fix,
   `contentScripts.register` returns `undefined` on Firefox ESR —
   replaced with `tabs.onUpdated` + `tabs.executeScript` in the
   background script. Reliable across all Firefox versions.

**Lesson.** The gap between "works in unit tests with stubs" and
"works in Firefox ESR" is wide for WebExtension permission APIs.
The `chrome` compatibility shim in Firefox is incomplete
(`contentScripts`, `scripting` missing), and embedded extension
pages (`about:addons`) have restricted API access.  Future work
should test on a real Firefox ESR early rather than after all
phases are coded.
