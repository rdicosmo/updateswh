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
