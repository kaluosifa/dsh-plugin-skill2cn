# Skill2CN implementation acceptance record

> **Open-source edition note.** This is the acceptance record for the initial
> implementation, published with machine-specific details removed. Absolute paths to
> the developer's local DSH checkout have been replaced with `<dsh-checkout>`, and
> paths into the local (non-published) acceptance harness with `<stub-endpoint>` and
> `<local-fixtures>`. References of the form `packages/...:line` point into DSH's own
> source tree, not into this repository. Short commit hashes (`f1fa1c5`, `6b2ff05`, …)
> refer to the pre-release development history of the author's private working tree;
> the public repository starts from a single initial commit, so those hashes will not
> resolve here.

- **Date**: 2026-09-17
- **Conclusion**: all nine SPEC §7 acceptance criteria **pass** (items 7 and 9 with
  boundary notes). Four cases were found during implementation where a planning
  assumption diverged from the actual DSH API; each was corrected in place and is
  recorded below. Doing so exposed and fixed six defects, two of them high-risk
  (they could destroy user files or state).

## Environment

- Windows + Git Bash + pnpm; DSH checkout `<dsh-checkout>` (`0.1.2-alpha.3`), left
  **unmodified** (tracked modifications were 22 files both before and after
  acceptance, none of them skills).
- The plugin was installed into the `web` profile with `link:` (that profile already
  contains `@deepseek-ai/dsh-web-app`; the `dev` profile has no web app, so
  `dsh web --profile dev` is not usable).
- Launch: `cd <plugin-repo> && pnpm --dir <dsh-checkout> dsh web --no-open`. Note that
  `pnpm --dir` sets the process cwd to the DSH checkout, so the **workspace group
  becomes the DSH checkout's own project skills** (a known limitation of the initial
  plan, later retired — see R6 below).

### Controlled LLM endpoint (fixture, not published)

`Translate All` overwrites **every** untranslated skill on the panel (55 on the test
machine, 49 of which belonged to the user environment or the DSH checkout). To avoid
rewriting anything out of bounds, acceptance used a local stub endpoint
(`<stub-endpoint>`, OpenAI-compatible, returning 503 for anything that is not a
fixture):

- Only 6 fixture descriptions could obtain a translation → the success path performed
  real disk writes;
- every other skill threw before `writeFile` → **zero disk changes**, while also
  exercising the §3.5 failure card, the retry action and the "success N / failure M"
  summary;
- the server recorded the peak in-flight count, giving objective evidence for the
  concurrency cap of 3.

Proof of no out-of-bounds writes: before and after the batch, **188 non-fixture
`SKILL.md` files** were hashed with md5 one by one; the only differences were on the
6 fixtures.

## SPEC §7, item by item

| # | Criterion | Result | Measured evidence |
|---|---|---|---|
| 1 | A section page with 3 tabs appears in the settings UI | ✅ | "Skill2CN · 技能汉化" appeared in the settings sidebar; in-page tabs `未翻译 / 已翻译 / 设置LLM` |
| 2 | The Untranslated page groups by source; clicking `Translate` moves the skill into a translating state asynchronously and then into Translated | ✅ | All 3 groups present: workspace 12 / global 106 / plugin package 47 (165→170 total); `demo-en` (global) left the Untranslated page after `Translate`; `SKILL.md` description became Chinese; `manifest.json` gained a record with `original/translated/translatedAt` |
| 3 | `Translate All` runs 3-concurrent with overall progress and a success/failure summary; failed cards can be retried individually | ✅ | Progress measured at `12/55 → 27/55 → 48/55`; **spinners in flight = 3**, stub server `peakInFlight = 3`; summary `success 6 / failed 49 / skipped 115` (matching the 6 disk fixtures exactly); 49 failure cards with error `skill2cn/llm-http — HTTP 503` plus a `Retry` button; clicking `Retry` on one re-issued the request and failed again (stub refused-count incremented) |
| 4 | Restore returns the card to Untranslated, the file back to its English original, and deletes the ledger record; `Restore All` likewise | ✅ | Single restore: Translated 6→5 cards, file **md5-identical** to the original fixture, ledger 6→5 entries. Restore All: `success 6 / failure 0`, all 6 fixtures byte-identical, ledger back to zero |
| 5 | A translated card can show the original via `View original` | ✅ | Card expanded the English original `Use when debugging tricky failures. Supports /slash-cmd and paths like src/a.ts.`, and the button toggled to `Collapse original` |
| 6 | After translating, the next model step's skill catalog is already Chinese, with no restart | ✅ | After translating `demo-en`, one message was sent in a session; `~/.dsh/sessions/**/session.jsonl.zstd` (multi-frame zstd, must be decoded frame by frame) contained `` - `demo-en`: 当调试棘手故障时使用。``, with the `available_skills` block present |
| 7 | All three routes are switchable and `Test` shows translation + latency + model name; the API key is masked | ✅ (with notes) | **Follow session**: `译文：当调试棘手的故障时使用。（943ms · vision-toolkit-deepseek-official/deepseek-flash）`. **Configured route**: the dropdown listed 43 providers, and `Discover models` returned `deepseek-v4-flash / deepseek-v4-pro` for `deepseek`, filling the datalist. **Custom endpoint**: `译文：当调试棘手故障时使用。（276ms · custom/stub-model）`. Storage: `settings.yaml` persisted `routeMode/customBaseURL/customModel`; `customApiKey` used `.role('secret')` and the UI password field rendered empty after saving. See notes 1 and 2 under "Leftovers" |
| 8 | Opening the panel reconciles automatically: entries overwritten by a package upgrade are classified correctly | ✅ | (a) `demo-en` was hand-edited back to English **exactly matching the backup** → reopening the panel **silently cleared** the record, the card returned to Untranslated, ledger 1→0. (b) After translating again, it was changed to a **different** English sentence → the card was marked `stale`, offering `View original` (showing the backed-up old original), `Re-translate` (re-translated successfully, record updated to the new original + new translation), and `Remove record` |
| 9 | Skills already in Chinese are marked "no translation needed" and skipped in batch runs | ✅ (with boundary) | The `demo-zh` card was marked `no translation needed` with no `Translate` button; the batch summary reported `skipped 115`. Boundary in note 3 |

## Where planning assumptions diverged from the real DSH API

| # | Assumption | Actual DSH behaviour | Evidence | Resolution |
|---|---|---|---|---|
| D11 | Declaring client `inject = ['slots','locale','remote','settingsScope']` is enough to read `ctx.remote.skill2cn.*` | cordis rewrites `ctx.remote.<ns>` into `Reflect.get(ctx,'remote.<ns>')`, and the inject guard matches on **dotted literal names**; but a mounter that declares its own namespace at the top level **self-deactivates** | `docs/api-gateway.md:58`; `packages/client/ui-settings-models/src/client/index.ts:65-68`; `packages/experimental/client-ui-agent-team/src/client/mount.ts:88-89` | The top level now declares only `remote` (plus `slots/locale/settingsScope`); after mounting it calls `await ctx.inject(['remote.skill2cn','remote.llm',...], registerSection)` to derive a child fiber before registering UI. **Before the fix the panel only displayed `cannot get property "remote.skill2cn" without inject`** |
| D12 | `ctx.skills.list({ cwd })` covers the project and user directories | The web app bundle **disables the host `skill-filesystem` line**, so local discovery belongs to an agent preset's standing mount; a host read without a scope only gets the global layer | `packages/bundle/web-app/cordis.patch.yml:355-364`; `packages/preset/agent-presets/src/index.ts:741` (`standingKeyFor`, explicitly "for a host reader with no agent"); `packages/skill/tool-skill/src/index.ts:222` (precedent for `{cwd, scope}`) | The scanner gained an optional `scope`, and the service obtains the preset standing scope key via `agentPresets.standingKeyFor()` and passes it in (falling back to the global layer if the service is missing or the composition is unavailable). **Before the fix only 47 of 163 skills were scanned and the global and workspace groups were permanently empty** |
| D13 | `ctx.settingsScope.bind(...).getSnapshot()` returns the settings object | It returns a **synchronous state wrapper** `{status, value, user, writable, mode, revision}`; the effective value is in `.value` and whether a secret is set is in `.user` | `packages/client/ui-settings/src/client/settings-contract.ts:8-34, 54-89`; consumer precedent `packages/client/ui-settings-plugins/src/client/card-form.ts:169-198, 304-328` | `LlmSettings.tsx` now reads `.status/.value/.user`; `set()` returns a Promise. **Before the fix the dropdown was stuck on the schema default `follow` and could not read persisted configuration** |
| D14 | `ctx.llm.stream` text deltas are in `chunk.delta`, and failures show up as `chunk.reason === 'error'` | `text-delta` carries `text`; `finish.reason` is an **object** `FinishReason` (`{kind:'stop'}` / `{kind:'error', failure}`); `messages` requires `Message[]` (built with `createUserMessage`); `purpose` accepts only `'compaction' \| 'session-title'` | `packages/llm/llm/src/types.ts:355-375, 393-438`; `packages/session/session-title-llm/src/index.ts:247-267` | `translator.ts` now reads `text`, judges failure by `reason.kind` and surfaces `failure.message`; the host assembly point builds messages with `createUserMessage`. **Before the fix an empty result was silently swallowed as "the model produced no text", and real errors (such as `no adapter registered for provider "deepseek"`) were invisible** |

## Defects found and fixed during implementation

| # | Defect | Impact | Fix | Regression test |
|---|---|---|---|---|
| B1 | `list()` used the registry's **stale** description as the reconciliation oracle. A Chinese description just written to disk read back as "the file reverted to English", falsely triggering `clear-record` and **silently deleting the manifest record** | High: after a successful translation the record erased itself, the card fell back to Untranslated and could no longer be restored | Reconciliation now compares against **disk** (SPEC §3.4, "manifest and disk file consistency") via `diskDescription()` | Acceptance §7-4 byte comparison + ledger counts |
| B2 | `ManifestStore.save()` used a fixed temp name `.tmp` plus rename. With 3 batch lanes concurrently calling `set()`, the renames trampled each other (ENOENT) | High: successes counted as failures, and records could be lost | Serialized writes (promise chain) plus unique temp names | `tests/manifest.spec.ts` "survives concurrent writes from parallel lanes" (24 concurrent `set()`, 24 entries after reload) |
| B3 | `rewriteDescription` used yaml's default 80-column wrapping | A long description was **not** byte-identical to the original after `Restore` (violating §3.3) | `doc.toString({ lineWidth: 0 })` | `tests/frontmatter.spec.ts` "does not fold a description longer than the default line width" (RED first) |
| B4 | The service never returned `state:'failed'`, so failure cards had no error state and no `Retry` | Violated §2.4 / §3.5 / §7-3 | The service records a `failures` Map; `viewOf` returns `failed + error` on the untranslated/stale branches | Acceptance §7-3, 49 failure cards with retry measured |
| B5 | After a client batch finished, `stopPolling()` could still observe an in-flight `status()` reporting `running:true`, leaving `busy` permanently true | The batch button stayed disabled forever and the progress bar froze (a second batch could not be started) | `runBatch` calls `setProgress(undefined)` after returning | Acceptance §7-3 / §7-4, two consecutive batch runs |
| B6 | `restoreAll` included `failed` in its targets, but failure cards have no backup record → `not-translated` | Phantom failures on batch restore | Targets narrowed to `translated \| stale` | Acceptance §7-4, `success 6 / failure 0` |
| B7 | The stylesheet guessed non-existent prefixes `--color-bg` / `--color-border`; in the dark theme buttons fell back to `#fff` while text inherited the theme's light colour → **white text on white background, invisible button labels** | High: an entire row of buttons was unreadable in the dark theme | Everything now uses DSH's real design tokens `--dsw-alias-*` (`bg-layer-2` / `border-l2` / `button-ghost-active-fill` / `state-error-primary` / `state-warn-primary`); text no longer carries a self-assigned background, and borders fall back to `currentColor` | Measured computed styles: dark `bg rgb(67,69,74)/color rgb(249,250,251)`, light `bg rgb(235,238,242)/color rgb(15,17,21)`; screenshots in both themes |
| B8 | The LLM settings page wrapped `<select>` inside `<label>`, so the accessible name concatenated every option's text; mode explanations and the effective-route hint were missing; the secret "already set" marker read the mirror `user` unreliably | Medium: users could not tell which mode to pick or which route was in effect | Separated `label htmlFor` from the control `id`; added an explanation line per mode; added a "currently effective route" summary line; the key marker now appears only after a successful write | Settings-page DOM structure assertion (label text is only "翻译路由") + screenshots in both themes |

## User-reported fixes (appended 2026-09-17)

After trying it, the user reported that "the buttons and hint text on the UI are
invisible" and "the LLM settings are awkward to use" — the former is B7 above, the
latter B8; both were fixed in `f1fa1c5` and verified in both themes. Leftover 1 (the
configured-route dropdown containing providers with no registered adapter) remains the
main source of "awkward": this round mitigated it with an explanation line, but a real
fix requires switching to an enumeration API over registered adapters.

### Tab assignment change (requested by the user; `SUPERSEDES` the implied grouping in SPEC §3.3)

The user asked that "no translation needed" stop piling up in the Untranslated tab.
Measured: 115 of the 119 cards on that page were "no translation needed"
(descriptions already in Chinese, no buttons at all), which genuinely buried the work.
After the change:

- **Untranslated** = only what needs action (`untranslated` / `failed` / `translating`),
  with an "N to translate" count;
- **Translated** = `translated` / `stale` / **`no-need`**, with an "N with backup
  records · M needing no translation" count and an explanatory line.

`no-need` cards correctly have **no** `Restore` and **no** `View original`: the ledger
holds no backup for them (their Chinese *is* the original), so there is no English to
restore or compare against. `Restore All` still targets `translated | stale` and does
not touch them. Batch skip logic is unchanged (`translateAll` takes only `untranslated`).

Measured: Untranslated 4 (all needing action) / Translated 161 (46 with backups + 115
needing no translation).

### Second round of user feedback (`6b2ff05`)

| # | Feedback | Resolution |
|---|---|---|
| B9 | Many Chinese descriptions (with some English mixed in) were not classified as "no translation needed" | `isChineseDescription` relaxed from "more CJK than Latin letters" to "CJK ≥ 4 and CJK × 2 ≥ Latin letters". **Verified against real data** (164 descriptions): no-translation-needed went 118 → 130, and all 12 flipped entries were Chinese-with-identifiers (`钉钉*`, `domain model(领域模型)`, `spec/tickets`, `tracer-bullet ticket`, `Shadcn/ui utility-first`, `UX/UI GSAP`…), with not one English description misjudged; the original 6 pinned cases and a new "English containing a stray Chinese word" case all remained translatable. Panel measured: no-translation-needed 115 → 127, to-translate 38 → 24 |
| B10 | Cards took too much room; wanted more skills per screen | Card grid (2 per row, ~120px each) → dense single-column rows (name · badge · state · one-line truncated description, expandable on click · actions right-aligned, **34px** row height), roughly 3.5× more entries on screen; section headers gained counts; added a name/description filter box and an empty state for no matches. At equal height, screenshots went from 5 cards to 17 rows |

Incidentally: `demo-en` and `using-git-worktrees` were translated by the user while
testing and were kept (their `Restore` and `View original` both work).

### Third batch: new-skill prompt card (new user requirement)

**Requirement**: after a new skill appears, ask "translate it?" in a popup; do not
prompt if the description is already Chinese.

**`SUPERSEDES` SPEC §1 ("the single entry point is the settings section page")**: this
feature lets the user trigger a translation without going through the panel (SPEC §6
excludes "slash commands / agent tools", and a prompt card is neither). Product
choices (made by the user): **prompt for existing skills too, once**; place the card
in a **bottom-right global overlay**; drive the signal by **lightweight 5-second
polling**.

Implementation notes and the evidence behind them:

| Topic | Conclusion | Evidence |
|---|---|---|
| Detecting additions | Subscribe to the registry's `skills/change` (no payload, no filtering, receivable at the root listener) to mark dirty, then recompute with `snapshot()` when `pending()` is called; on `complete:false` keep the previous result and retry next round | `packages/skill/skill/src/index.ts:290-299,651,477-490` |
| Where to render | `shell.overlay` (framework-level overlay, click-through, zero space, additive) | `packages/client/ui-layout/src/client/index.ts:82-86` |
| Why polling | `skills/change` is **not** in DSH's hardcoded forwarding allowlist, so a third party cannot push the event to the browser | `packages/api/remotes/src/remote-events.ts:16-35` |
| Predicate | Pure: not already asked (`prompted.json`) + no translation (manifest) + description not Chinese | `src/core/pending.ts` |
| Throttling | The seen set is keyed by frontmatter `name` (a skill's identity is its name, not its path); recorded on successful translation, on ignore, and on restore | `packages/skill/skill/src/index.ts:564` |

Integration measurements (controlled endpoint + real DSH):

| # | Check | Result |
|---|---|---|
| 1 | First run prompts for existing skills | Card read "found 25 untranslated skills", listed 8 plus "and 17 more"; `inShellOverlay: true`, `position: fixed` bottom-right, correct colours in both themes (screenshot-confirmed) |
| 2 | Consistent with the panel | The card's 25 entries == the panel's 25 Untranslated entries (global 3 + plugin package 22), with no Chinese mixed in |
| 3 | Chinese descriptions are not prompted | Created `demo-new-zh` (Chinese description); it never appeared in the list and never prompted |
| 4 | New skills prompt while running | Created a `demo-late` file and the card appeared **within 2 seconds**, listing only that entry |
| 5 | Card `Translate` | Clicked → `translating 0/1` with a spinner and disabled button; the `demo-new` file became Chinese, the manifest gained a record, `prompted.json` recorded it, and the list went 25 → 24. Controlled endpoint: `ok:1 / refused:24 / peak:3` (everything non-fixture failed with **zero disk writes**, concurrency still ≤ 3) |
| 6 | `Ignore` is permanent | After ignoring 24 entries the card disappeared; `prompted.json` had 26 entries; **after restarting DSH the card did not reappear** (those skills were still untranslated) |
| 7 | Restoring counts as a decision | After restoring `using-git-worktrees` from the panel, the card still listed 24 and did not include it (without the seen-set record it would have become promptable again) |
| 8 | No out-of-bounds regression | The DSH checkout still reported `22 files changed` with 0 changes under `skills/` |

Tests: added three strict-TDD modules (`json-file` / `prompted` / `pending`, RED before
GREEN) and migrated `ManifestStore` onto the shared `JsonFile` (its public API and
existing tests unchanged). Full suite: **12 files / 86 tests** passing.

**Defects found and fixed while testing**:

| # | Defect | Impact | Fix |
|---|---|---|---|
| B11 | With no active session yet after a restart, `activeCwd()` fell back to `process.cwd()` (= the DSH checkout), so the workspace axis pulled DSH's own project skills into the prompt list (the first build listed 37 entries including `demo-ws` / `dsh-*`) | High: it recreated the conditions for the earlier "accidentally rewrote the DSH checkout" incident | When there is no session workspace, **do not pass `cwd`** at all: the registry's project axis ceases to exist (the provider only scans a project root when `cwd !== undefined`), so it lists nothing rather than guessing. Measured: the list returned to 25 entries containing no DSH skill |
| B12 | When a batch from the card failed entirely, it stayed silently in place and the user had no idea what happened | Medium: no failure feedback | `translateMany` now reports "success N / failure M; retry failures from the panel" inline whenever `failed > 0` |

### Eighth batch: clearer separation between the source groups (user feedback)

**Requirement**: add separators between source categories on the list page so the
boundaries are more obvious.

**Two root causes**: (1) groups were separated only by a 12px block gap and a small
(12px / opacity .8) heading, with **no divider line at all**; (2) the subtler one — the
row separator was written as
`border-bottom: 1px solid var(--dsw-alias-border-subtle, transparent)`, and
**`--dsw-alias-border-subtle` is not defined in DSH**, so it always fell back to
`transparent` and **the row separator had never once been visible**. This is the same
class of trap as "B7 invisible buttons" (guessing a token that does not exist); at the
time only the `Test` result box was fixed and the row separator was missed. Both were
fixed this round, and a warning about the two undefined tokens (`-subtle` and
`separator-primary`) was written into the stylesheet comments.

**Changes** (only `src/client/styles.ts`; the DOM from `cards.tsx` was sufficient):
group headings strengthened (600 weight, opacity .9, top margin zeroed); a
`border-top: 1px solid var(--dsw-alias-border-l2)` plus `padding-top: 16px` and
`margin-top: 8px` added between adjacent groups (via the `+` adjacent selector, so the
**first group gets no line**, avoiding a stray line against the filter box); the row
separator switched to `--dsw-alias-border-l1`, with **no trailing line on the last row**
of each group.

**Measured (checked via computed styles, not just screenshots)**:

| Item | Measured value |
|---|---|
| Group separator (2nd group `borderTopWidth` / `borderTopColor`) | `0.571429px` / `rgba(255, 255, 255, 0.12)` → **genuinely visible** |
| First group `borderTopWidth` | `0px` (correctly no line) |
| Row separator (first row in a group `borderBottomWidth`) | `0.571429px`, colour `rgba(255,255,255,0.06)` (fainter than the group line — correct hierarchy) |
| Last row in a group `borderBottomWidth` | `0px` (no trailing line) |
| Group heading `font-weight` | `600` |
| Groups | global 109 / plugin package 47, spacing `padding-top: 16px` |

**Appended (the user asked for the alternative scheme too)**: the group heading is also
a **banded, sticky** element — `background: var(--dsw-alias-bg-layer-1, transparent)`,
`padding: 4px 8px`, `border-radius: 6px`, `position: sticky; top: 0; z-index: 1` — so you
always know which category you are in while scrolling a long list.

Additional measurements:

| Item | Measured value |
|---|---|
| Band background | `rgb(35, 35, 36)` — **opaque** (`hasAlpha: false`, so rows do not show through when stuck; if the token is undefined it falls back to `transparent`, degrading to a plain text heading rather than becoming white-on-white) |
| Sticky | After setting the scroll container to `scrollTop = 600`, the heading's viewport top and the container top were both `104` → `stuck: true` (still stuck to the top in a screenshot at `scrollTop = 4055`) |
| Heading box model | `position: sticky`, `top: 0px`, `z-index: 1`, `padding: 4px 8px`, `border-radius: 6px` |

Screenshots confirmed how the row separator, group separator and banded sticky heading
look together; the full suite of 12 files / 94 tests, typecheck and build all passed.

### Seventh batch: an intro line on the section page + renaming "设置LLM" to "模型设置" (user feedback)

**Requirement**: (1) add a line of plugin description below the "技能汉化" title and
above the tabs; (2) rename the tab `设置LLM` → `模型设置`.

Wording (given by the user, finalised after two revisions):
`把技能的英文描述翻译成中文，可一键还原成原文；安装新技能时，也能及时提醒。`
(with a semantically equivalent English translation). Measured: it fits on a single
line within the 560px column.

**`SUPERSEDES` the tab name in SPEC §2.3**: `docs/SPEC.md` §2.3's heading and §7.7's
acceptance item, plus the glossary entry in `CONTEXT.md`, still use the old name. Per
the user's instruction not to change the SPEC unilaterally, they were left alone this
round and the divergence is recorded only here.

**An inconsistency found and fixed along the way**: the host's `src/core/route.ts`
no-route message still named the old tab, but **the client replaces
`skill2cn/no-route` with its own `llm.noRoute` copy** (both `LlmSettings.runTest` and
`Section.act` do this), so the host's wording is never seen by a user and changing it
has no effect. The copy that actually needed changing was the client's, and it
previously said "or switch to an explicit route" without saying where — now
"…or switch to an explicit route in 模型设置", which is actionable. The host's wording
and two comments were synchronised too.

**Changes**: `client/locales.ts` (renamed `tab.llm`, added `intro`, made `llm.noRoute`
name the tab), `client/Section.tsx` (title row and description row merged into a
vertical header), `client/styles.ts` (`.skill2cn-head` switched to column plus a new
`.skill2cn-intro`), `core/route.ts` + `service.ts` + `shared/wire.ts` (copy and comments
using the old name), `README.md` (two places).

**Measured**: title → description → tabs vertical spacing measured at
`116/134→4px/154/168` (title→description 4px, description→tab 14px); description at
12px, opacity .75; the three tabs `未翻译 / 已翻译 / 模型设置`; with no route, the `Test`
detail showed "…or switch to an explicit route in **模型设置**" (measured
`namesNewTab: true, namesOldTab: false`). Screenshot-confirmed. The full suite of 12
files / 94 tests, typecheck and build all passed.

### Sixth batch: the custom endpoint supports the Anthropic-compatible protocol (user feedback)

**Requirement**: the "custom" translation route should no longer be limited to
OpenAI-compatible; after choosing "custom", a protocol selector with two options —
OpenAI-compatible / Anthropic-compatible — should appear **below the Base URL** under
advanced configuration.

**Shape derived from**: DSH has **no** hand-written anthropic adapter (the
`anthropic-messages` protocol goes through the pi-ai SDK), but it does have one
hand-written Anthropic `fetch` — `packages/web/web-search-deepseek/src/provider.ts:207-267`.
This implementation follows it: `{base}/messages` (base includes `/v1`), both
`x-api-key` **and** `Authorization: Bearer` (that file's comment notes that official
endpoints want `x-api-key` while proxies may only accept Bearer, so both are sent),
`anthropic-version: 2023-06-01`, a top-level `system`, and a required `max_tokens`
(an Anthropic hard requirement, set to 1024); the body walks `content[]` and
concatenates every text block (rather than assuming `content[0]`).

**Improvement along the way**: error messages went from "status code only" to "status
code + the server's detail, best-effort" — `{error:{message}}`, `{error:"…"}`,
`{message:"…"}` and plain text are all handled, degrading gracefully when none match;
both protocol paths benefit (a bare `401` is not actionable).

**Protocol values**: stored as `'openai' | 'anthropic'`, with unknown values normalised
to `openai` (defensive against old configuration). The corresponding adapter protocol
names in DSH are `openai-completions` / `anthropic-messages`.

**Changes**: `core/route.ts` (`CustomProtocol` + `RouteSettings.customProtocol` + a
custom variant of `ResolvedRoute` carrying `protocol` + normalisation),
`core/translator.ts` (two-protocol branch + `errorDetail` / `anthropicText` /
`openAiText`), `src/index.ts` (schema gains `customProtocol`, default `openai`),
`client/LlmSettings.tsx` (protocol selector directly below Base URL, placeholder
switching with the protocol, effective-route summary including the protocol),
`client/locales.ts` (new `llm.custom.protocol{,.openai,.anthropic}` keys;
`llm.mode.custom` changed from "custom OpenAI-compatible endpoint" to "custom endpoint";
`llm.hint.custom` explains both paths and the Base URL convention).

**Tests** (strict TDD, RED before GREEN): `tests/translator.spec.ts` gained 6 Anthropic
cases (URL / headers / required `max_tokens` / multi-block concatenation / ignoring
non-text blocks / three error-detail shapes + empty-body degradation) and the existing
OpenAI cases gained the `protocol` field; `tests/route.spec.ts` gained a
`customProtocol` fixture plus 3 cases (openai / anthropic / unknown-value
normalisation). Full suite: **12 files / 94 tests** passing.

**Measured (controlled endpoint, two layers of evidence)**:

| Item | Result |
|---|---|
| Selector position | DOM field order `翻译路由 → Base URL → 协议 → API key → Model 名`; options `OpenAI 兼容` / `Anthropic 兼容`; the placeholder switches between `…/v1` and `https://api.anthropic.com/v1` with the protocol |
| Anthropic success | UI showed green "configuration succeeded" plus the translation/latency/model detail; **the endpoint side confirmed the received request**: `url=/v1/messages`, `x-api-key=stub-key`, `authorization=Bearer stub-key`, `anthropic-version=2023-06-01`, a non-empty top-level `system`, `max_tokens=1024`, `messages[0].content[0].type=text` |
| The protocol really switches path | After switching to OpenAI-compatible the endpoint counters read `chatCalls=1 / messagesCalls=1` (each path used only its own route, `ok=2`) |
| Reverse check | With the endpoint's messages branch disabled and the protocol set to Anthropic → red "configuration failed" with `skill2cn/llm-http — HTTP 404: stub: anthropic path disabled` (proving both paths are not hitting the same branch, and that the detail came from the JSON error body) |

Screenshots confirmed the protocol selector and the success/failure states.

### Fifth batch: `Test` becomes a confirmation-style result, and a new sample sentence (user feedback)

**Requirement**: the test result should be phrased "toward telling the user the
configuration succeeded"; the sample sentence should change too.

**Not contrary to SPEC**: all three items SPEC §2.3/§7.7 requires (translation +
latency + actual model name) are retained (demoted to the detail line); the SPEC itself
writes the sample as "**such as** \"Use when debugging tricky failures.\"", i.e. an
example.

**Style derived from research**: DSH has **no** test/verify/validate-style settings
action anywhere, so there is no direct precedent; but it has a consistent success
house style to follow — verdict first, short, no exclamation mark; identity and
cost demoted to a second line; Chinese verdict phrases without a full stop (precedents:
`ui-primitives/src/ConnectionIndicator.tsx:52-61` "连接成功" and
`ui-settings-models/src/client/ModelsSection.tsx:313-318` "已保存 {provider}。").
The success colour uses the **documented** `--dsw-alias-state-success-primary`
(`ui-theme/src/client/index.ts:132-143`), as text colour only.

**Changes**: the sample in `src/service.ts:337` →
`Use when translating skill descriptions into Simplified Chinese.`; `llm.test.done` in
`locales.ts` split into `llm.test.ok` / `llm.test.okDetail` / `llm.test.failed`;
`LlmSettings.tsx`'s `testResult: string` became `TestOutcome { ok, verdict, detail }`
rendered as a verdict line plus a detail line with `role="status" aria-live="polite"`;
the verdict line takes its colour from `data-kind` in `styles.ts`, and the container's
`white-space` changed from `pre-wrap` to `normal` (structured child elements plus
`pre-wrap` rendered the whitespace between JSX tags as visible blank lines), while the
detail line keeps `pre-wrap` itself.

**An existing defect fixed along the way**: the result container's border used
`--dsw-alias-border-subtle`, which is **undefined** in DSH (so it had always fallen back
to `transparent` and the border had never been visible); it now uses the real
`--dsw-alias-border-l2`. Also, success and failure previously shared one `div` and one
style, so **a failure looked exactly like a success**; they are now coloured separately
by `data-kind`.

**Measured (controlled endpoint + real DSH)**:

| Branch | Measured result |
|---|---|
| Success | `data-kind="ok"`, `role="status"`, verdict "配置成功" in green `rgb(34,197,94)` at weight 600; detail "试译：当需要把 **skill** 描述翻译成简体中文时使用。（261ms · custom/stub-model）" — new sample translation, latency and model name all present, two lines with no blank line between |
| Failure | `data-kind="failed"`, verdict "配置失败" in red `rgb(242,90,90)`; the detail was the host's original reason `skill2cn/llm-error — no adapter registered for provider "deepseek"` (no longer wrapped in an "operation failed:" prefix, since the verdict line already says it failed) |
| No route | Verdict "配置失败" plus an actionable detail: "尚未捕获到会话路由：请先在任一会话发一条消息，或改选显式路由。" |

Three screenshots confirmed the appearance matches DSH's success/error text colours.

### Fourth batch: section page title and icon (user feedback)

**`SUPERSEDES` the display name in SPEC §1**: originally "Skill2CN · 技能汉化" → finally
**"技能汉化"** (en: `Skill Localization`).

The rename was not just about brevity: that row in the settings sidebar used to be
truncated by an ellipsis to "Skill2CN · 技能…", measured as
`scrollWidth > clientWidth`; now all 10 rows measure `truncated: false` (this row
112/112).

An experiment prefixing the title with a `文↔A` pictographic marker as an icon slot was
tried; after seeing it the user judged that "the title should be simple", so it was
reverted and the icon moved into pixels the plugin actually owns (below).

**Why the icon cannot be changed (evidence)**: the settings sidebar icon is decided by
**DSH core**; a plugin has no way to supply it.

- The slot registration options project only `{ id, order, label }`
  (`SettingsSectionRow`, `label: string`) — there is no `icon` field in the slot
  registration options — `packages/client/ui-settings-general/src/client/shell-contract.ts:20-24`.
- The icon is chosen by `navIcon(id)`, and **only `models` / `agent-presets` /
  `plugins` have dedicated glyphs**; everything else falls through to a gear
  (`SettingsRoot.tsx:27-32`).
- Measured DOM: **7 of the 10 rows share the same gear** (`通用设置` / `手机访问` /
  `技能` / `MCP` / `视觉工具` / `插件市场` / `技能汉化`, all with SVG `innerHTML` length
  4116 and identical path signatures); only `模型` / `插件` / `Agent 预设` differ.
  **DSH's own "技能" page is also a gear**, so this is not a defect of this plugin.
- All three ids with dedicated icons are already taken by official sections, so
  impersonating one would cause an id collision and a broken selected state.

Conclusion: the only thing a plugin can influence on that row is the `label` text, not
the icon. DSH's icon set also has **no** translation/language glyph (of its 74 icons,
the closest is `IconGlobeOutline14`, a globe).

Final approach: the title stays the simple "技能汉化", and the icon is drawn **where the
plugin owns the pixels** — a new `src/client/icons.tsx` supplies its own 16px globe
(`currentColor` stroke, theme-aware, consistent with DSH's monochrome stroke style),
rendered in (1) the section page header "🌐 技能汉化" and (2) ahead of the overlay card's
title. Screenshots confirmed both render correctly, with `stroke: rgb(249,250,251)` in
the dark theme.

The reason for shipping a self-contained SVG rather than importing `IconGlobeOutline14`
from `ui-primitives`: decision D8 in the plan states that the client must not depend on
`ui-primitives`' API surface, and a self-contained SVG has zero runtime dependencies, so
a change in the host's module table cannot take down the whole client half.

**Still unsolved**: the icon next to the gear on that sidebar row. Two paths: (1) inject
CSS that hides this row's gear and overlays a hand-drawn icon
(`nav button:last-of-type > svg`) — **not recommended**, since it depends on row order
and DOM structure, and will misfire or misplace as soon as another plugin sorts after
this one or DSH changes its layout; (2) submit a PR to DSH adding an icon channel to the
`settings.section` registration options and reading it in `navIcon` (touches the main
repository, out of scope for this task).

## Leftovers (not blocking §7; known boundaries)

1. **The "configured route" dropdown lists DSH's provider catalog (43 entries), which is
   not the set of providers with a registered adapter on the local machine.** Choosing
   an unregistered provider makes `Test` report
   `no adapter registered for provider "..."` (the error is surfaced verbatim). The
   locally usable one was `vision-toolkit-deepseek-official`, which appears only under
   "follow session route". Narrowing the dropdown would require switching to an
   enumeration API over registered adapters (the `llm.listProviders` mentioned in the
   plan's baseline); this plan only declared `listConfigurableProviders`.
2. **Model discovery varies by provider**: `ark` reports "pi-ai ships no catalog for
   provider \"ark\"…set a baseURL", which is DSH's own behaviour; the UI correctly falls
   back to "you can enter it by hand" per §2.3.
3. **The "no translation needed" heuristic is conservative for "Chinese plus dense
   English identifiers"**: for example `钉钉群聊与消息。Use when 发消息…dingtalk-misc…dws chat。`
   is judged untranslated, so the 55 to-translate at the time included about 40
   descriptions that **were already Chinese**. Running `Translate All` with a real LLM
   route would retranslate them (overwriting good Chinese). The rule and its test
   (`'Use when the user says 汉化 or…'` → false) were pinned in advance, so it was
   **not changed unilaterally**; relaxing the threshold needs a product decision (for
   example `cjk >= 4 && cjk * 2 >= latin`) — which was subsequently made, see B9.
4. ~~**The workspace group used `process.cwd()`'s projectRoot**~~ **Fixed** (`f2d8ec7`).
   The trigger was a real incident: when DSH was started from the DSH checkout directory,
   the cwd *was* the checkout, so the workspace group treated the checkout's own 11
   `.agents/skills` as translation targets, and the user's `Translate All` rewrote them
   (they were restored byte-for-byte with `Restore All`, `success 46 / failure 0`, and
   the checkout's tracked changes returned to 22 files). It now uses the session
   workspace (`session.header.cwd`, with a `ctx.sessions.list()` fallback), and the
   DSH project skills no longer appear on the panel. **The plan's R6 limitation is
   retired as a result.**
5. **An acceptance fixture was left inside the DSH checkout** at
   `deepseek-harness/.dsh/skills/demo-ws/SKILL.md` (untracked, not created by this
   session — left over from an earlier one). It is the only writable fixture for the
   workspace group; **cleaning it up is recommended** (deleting that directory returns
   the DSH workspace group to the checkout's own project skills).

## Reproduction commands

```bash
# toolchain
pnpm test && pnpm typecheck && pnpm build

# controlled endpoint + fixtures (part of the local, unpublished harness)
node <stub-endpoint>                      # e.g. http://127.0.0.1:8799/v1
# fixtures: ~/.dsh/skills/demo-en (English), demo-zh (Chinese); batch fixtures demo-b1..b5
# are described in <local-fixtures>

# integration
cd <plugin-repo> && pnpm --dir <dsh-checkout> dsh web --no-open
# "模型设置" (formerly "设置LLM"): custom endpoint http://127.0.0.1:8799/v1 + any key + any model → Test
```
