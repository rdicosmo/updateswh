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
