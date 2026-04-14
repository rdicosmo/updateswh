# Runtime host-permissions plan

Branch: `runtime-host-permissions` (cut from `main` after lean-rewrite merge,
v0.7.0).

## Goal

Remove the install-time "Read and change all your data on all websites"
prompt. Ask for each forge host only when the user opts in from the options
page.

## Why this matters

Current behaviour (as of `main` v0.7.0):

- `host_permissions` includes `<all_urls>` → install prompt shows the broadest
  possible access warning.
- Users with security hygiene decline or uninstall.
- The extension only needs five-to-ten specific origins.

Moving `<all_urls>` to optional and driving per-host grants from the options
page turns the prompt into "Access to archive.softwareheritage.org" at install
time, and a targeted per-site prompt on user click afterwards.

## Non-goals for this PR

- Per-repo (path-level) permissions. Host-level is fine.
- Cloud-synced permission state.
- Migration UX to downgrade an existing install's `<all_urls>` grant.
- Re-prompting if the user revokes mid-session.

## Phases

- [ ] **1.** Manifest source: move `<all_urls>` back to
      `optional_permissions` (MV2) / `optional_host_permissions` (MV3).
      Keep SWH required. Regenerate.
- [ ] **2.** `src/permissions.js` helper: thin wrapper over
      `chrome.permissions.request` / `.remove` / `.contains` / `.onAdded` /
      `.onRemoved` that normalises the MV2 object shape
      (`{permissions, origins}`) across Firefox and Chrome.
- [ ] **3.** Origin map: `src/forges.js` exports the required origin
      patterns per default forge (page host + API host). Custom instances
      derive their pattern from the user-entered domain.
- [ ] **4.** Options page UI: toggle list for default forges; existing text
      areas for user-defined GitLab/Gitea instances now trigger a
      per-domain grant prompt on add, `permissions.remove` on removal.
- [ ] **5.** Content-script short-circuit: `src/content/main.js` checks
      `permissions.contains` for the current origin; returns silently if
      not granted.
- [ ] **6.** Tests: unit tests for the permissions helper (mock
      `chrome.permissions`), origin-map coverage for each default forge.
- [ ] **7.** Docs: update `CONTRIBUTING.md` §Architecture and
      §Adding support for a new forge (origin patterns now required);
      update `README.md` on what users will see at install time vs. later.
- [ ] **8.** Manual smoke: install fresh in Firefox + Chrome, verify the
      install prompt is minimal, toggle each forge on in options, verify
      the per-site prompt appears once, verify revoke silences the button.

## Decision points

### D1 — Granularity of the default-forges toggle list

- **D1a. One toggle per default forge** (GitHub, GitLab.com, Bitbucket,
  Codeberg, … seven rows from `DEFAULT_FORGES`).
  + **Pros.** Users see exactly what they're authorising; easy to disable a
    forge they never visit; maps 1:1 to rows in `src/forges.js`.
  - **Cons.** Seven toggles is a long list; the "GitLab instance" / "Gitea
    instance" rows cover regex-matched hosts (`gitlab.*.*`) that can't be
    pre-enumerated, so those toggles would have to be labelled awkwardly.
- **D1b. Grouped toggles** (GitHub, GitLab.com + GitLab heuristic, Bitbucket,
  Gitea hosts + Gitea heuristic) → four rows.
  + **Pros.** Fewer rows; groups the regex heuristics under a single label.
  - **Cons.** Enabling a group requests permission for a regex that can't be
    expressed in `origins` — we'd have to materialise the known-list hosts
    and leave heuristic hosts ungrantable without user-defined entry.
- **D1c. No toggle list, all-off by default.** Users add forges only via the
  user-defined instances text boxes.
  + **Pros.** Minimal UI; single code path.
  - **Cons.** Much worse first-run UX — the extension does nothing until
    the user types `github.com` into a text box.

Recommendation: **D1a**, with the two heuristic rows (`gitlab.*.*`,
`gitea.*.*`) kept *off the toggle list* and handled via the existing
user-defined text boxes. That's 5 toggles (GitHub, GitLab.com, Bitbucket,
known GitLab instances, known Gitea instances) and reflects what the
underlying origin patterns can actually express.

### D2 — Default state on fresh install

- **D2a. All toggles off.** User enables only what they use.
  + **Pros.** Most conservative; matches the "minimal install prompt" goal.
  - **Cons.** Clicks-to-first-green for a typical GitHub user goes from 0 to
    3 (install → open options → toggle GitHub → grant prompt → back to
    repo). Retention risk.
- **D2b. GitHub toggle on by default**, asking for permission at first run.
  + **Pros.** Matches what ~80% of users actually want; still one explicit
    prompt but at the right moment.
  - **Cons.** We'd be asking for github.com host permission at first browser
    restart, which loses the "no nasty prompts" benefit of the rewrite.
- **D2c. First-run page.** Welcome tab that explains and offers toggles.
  + **Pros.** Educates on what the extension does; lets the user opt in
    explicitly; lets us ask for permissions only after user sees context.
  - **Cons.** More code (welcome page, `onInstalled` tab open — the latter
    is already wired via `background.js`).

Recommendation: **D2a + extend the existing welcome page** (already opened
by `onInstalled`) with a prominent "Enable forges you use" call-to-action
linking to the options page. That lets us keep all toggles off by default
without losing the first-run discoverability.

### D3 — Content-script behaviour when permission is missing

- **D3a. Silent no-op.** No button rendered.
  + **Pros.** Matches the principle of least surprise if the user has
    consciously not granted the forge.
  - **Cons.** On pages the user forgot to enable, there's no cue — the
    feature looks broken. Support burden.
- **D3b. Muted grey "click to enable" button.** Clicking opens options.
  + **Pros.** Discoverability; users who *didn't realise* they needed to
    enable find the path.
  - **Cons.** Noise. Users who consciously disabled a forge still see the
    button.
- **D3c. First-visit only nudge.** Remember per-host in `settings` that the
  user has seen the prompt; after that, silent.
  + **Pros.** Best of both.
  - **Cons.** Most state to manage; more code.

Recommendation: **D3b for v1**, with a per-host "don't show on this site"
option wired to dismiss state in `chrome.storage.local`. Upgrade to D3c
later if support feedback warrants it.

### D4 — Custom-instance grant flow

- **D4a. Prompt on add.** When the user adds `gitea.example.org` to the
  Gitea text box, immediately `permissions.request({origins: [
  "https://gitea.example.org/*"]})`.
  + **Pros.** Explicit, happens right next to the user action.
  - **Cons.** A typo in the text box → unnecessary prompt.
- **D4b. Prompt on first visit.** Add to settings silently, let the
  content-script detect missing permission and show the muted button.
  + **Pros.** No wasted prompts.
  - **Cons.** Indirect; user has to navigate to the instance to get the
    prompt, which may not happen immediately after editing settings.

Recommendation: **D4a**. The options-page flow is already synchronous user
attention; a spurious prompt from a typo is cheaper than an invisible
no-op.

### D5 — Handling revoke

If the user revokes a permission via the browser's extension-manager page
(out-of-band from our options UI), what happens?

- **D5a. Do nothing; rely on the next page-load short-circuit.**
  + **Pros.** Zero code.
  - **Cons.** A stale button stays rendered on a page loaded before the
    revoke.
- **D5b. Listen to `chrome.permissions.onRemoved` and refresh.**
  Re-run the content-script's permission check on the active tab and
  remove the icon if necessary.
  + **Pros.** Correct.
  - **Cons.** Requires a tab-query and script-injection dance from the
    background script.

Recommendation: **D5b**, ~15 lines in `background.js`. Revoke is rare but
the correctness cost is low.

### D6 — MV2/MV3 cross-browser shape

Firefox MV2 uses one `optional_permissions` list that mixes API and host
entries. Chrome MV3 splits into `optional_permissions` (API only) and
`optional_host_permissions` (origins). The generator already handles this
(Phase H), but we should verify:

- **D6a. Single list in base JSON** (as implemented in Phase H), generator
  routes it to the right MV3 key.
  + **Pros.** Single source of truth.
  - **Cons.** Requires maintainers to understand the generator mapping.
- **D6b. Split lists in base JSON** (e.g. `optional_host_permissions` vs.
  `optional_permissions`) matched literally.
  + **Pros.** Transparent in the source.
  - **Cons.** More boilerplate; MV2 has to collapse them.

Recommendation: **D6a** — the generator is already the right layer for
cross-version mapping.

## Open questions to confirm with Roberto before coding

1. **D1** — 5-toggle list (GitHub, GitLab.com, Bitbucket, known GitLab
   instances, known Gitea instances), or grouped differently?
2. **D2** — All toggles off + welcome-page nudge?
3. **D3** — Muted "click to enable" button when permission missing (with
   per-host dismiss)?
4. **D4** — Prompt immediately when a custom instance is added?
5. **D5** — Listen to `onRemoved` and refresh?
6. **Scope add-on:** should the welcome page at
   <https://softwareheritage.org/browser-extension> be updated in
   parallel, or is that out of this PR's scope?

## Target layout

```
src/
  permissions.js           ~30 lines; request/remove/contains helpers
  forges.js                +origins: ["...page", "...api"] per record
  content/main.js          +short-circuit when not permitted
extension/
  options.html             +<fieldset> of toggles + <div> for dismiss list
  options.js               ~150 lines; toggle handlers + custom-instance flow
  background.js            +onRemoved listener that refreshes icons
tests/unit/
  permissions.test.js      ~80 lines
  forges.test.js           +origin-map cases
```

## Progress log

_(kept empty until implementation starts — mirror LEAN_REWRITE_PLAN.md style)_
