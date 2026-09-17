# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-09-18

First open-source release. This version is the initial public snapshot of the
plugin; the entries below summarise the development work that it contains.

### Added

- **Core** (`src/core/`) — the pure, dependency-free layer:
  - `frontmatter` — locate/read/rewrite the `description` line of a `SKILL.md`
    while preserving the rest of the YAML document (including comments and key
    order) via a yaml `Document`.
  - `manifest` — the backup ledger with atomic writes; it is the single source of
    truth for translated vs. untranslated.
  - `language` — a CJK heuristic that classifies a description as
    "no translation needed"; plus a bounded async pool (concurrency cap 3).
  - `scanner` — skill discovery and classification by source
    (workspace / global / plugin package), scope-aware.
  - `reconcile` — the state machine that compares the ledger against the files on
    disk (translated / stale / silently cleared).
  - `route` — the translation-route resolver (follow session / configured
    provider / custom endpoint).
  - `translator` — the LLM call, for both the built-in route and custom endpoints.
  - `prompted` / `pending` / `json-file` — the new-skill prompt throttle and its
    shared JSON store.
- **Host** (`src/service.ts`, `src/index.ts`) — a Typert remote service exposing
  list / translate / restore / batch / reconcile / test, a `skill2cn` settings
  namespace, and session-route capture.
- **Client** (`src/client/`) — the settings section page with three tabs, a
  hand-written Typert contribution, a dense-row list layout with a name/description
  filter, and a self-drawn globe icon.
- **New-skill prompt** — a `shell.overlay` card in the bottom-right corner asking
  whether to translate newly discovered skills, with a permanent "ignore" throttle.
- **Custom endpoint, both protocols** — the Model Settings tab can target an
  OpenAI-compatible or an Anthropic-compatible endpoint, with the protocol selected
  under Advanced.
- **`Test` verdict UX** — the test result now leads with a success/failure verdict
  and puts the translation, latency and actual model name on a second line.
- **Docs** — bilingual README, CONTRIBUTING, this changelog, the code of conduct,
  ADR-0001 (write-to-disk rather than an overlay provider), the SPEC, the glossary,
  and the measured acceptance record.

### Changed

- Settings section renamed to **技能汉化** (from `Skill2CN · 技能汉化`), with an
  introductory line under the title; the third tab renamed to **模型设置**
  (from `设置LLM`).
- The "no translation needed" heuristic relaxed from "more CJK than Latin" to
  "≥ 4 CJK ideographs and at least half as many CJK as Latin letters", so Chinese
  descriptions carrying identifiers are no longer misclassified (real-data check:
  12 descriptions flipped, all of them Chinese-with-identifiers, none wrongly).
- The "no translation needed" group moved out of the Untranslated tab into the
  Translated tab, so the Untranslated tab lists only work that actually needs doing.
- The skill card grid replaced with dense single-column rows (~34px each) plus a
  filter box, roughly 3.5× more entries per screen.
- Skill source groups given clearer separation: a bolder group header, a separator
  line between groups, and per-group trailing-line suppression; the header is also
  a banded, sticky element so it stays visible while scrolling.

### Fixed

- **Disk-truth reconcile** — reconciliation previously used the registry's stale
  description as its oracle, so a freshly written Chinese description read back as
  "the file reverted to English" and silently deleted the ledger record. It now
  compares against the file on disk.
- **Serialized manifest writes** — `save()` used a fixed temp filename plus rename,
  so three concurrent batch lanes trampled each other's rename (ENOENT), counting
  successes as failures and risking lost records. Writes are now serialized with a
  promise chain and unique temp names.
- **No YAML line folding** — rewriting used yaml's default 80-column wrapping, so
  restoring a long description did not reproduce the original. Rewrites now pass
  `lineWidth: 0`.
- **Failed-state cards** — the service never returned `state: 'failed'`, so failed
  cards had no error state and no Retry button.
- **Batch button permanently disabled** — `stopPolling()` could still observe an
  in-flight `status()` reporting `running: true`, leaving `busy` true forever. The
  progress state is now cleared when the batch returns.
- **Phantom restore failures** — `restoreAll` included failed entries, which have
  no backup record, producing false `not-translated` errors. Targets narrowed to
  `translated | stale`.
- **Dark-theme unreadable buttons** — the stylesheet guessed non-existent tokens
  (`--color-bg`, `--color-border`, `--dsw-alias-border-subtle`), which fell back to
  transparent and produced white-on-white text. All uses now go through real
  `--dsw-alias-*` tokens, and the row separator line (which had never actually been
  visible) now uses `--dsw-alias-border-l1`.
- **Dotted remote injection** — the client half declared `remote.skill2cn` at the
  top level, which self-deactivates; the panel could only report
  `cannot get property "remote.skill2cn" without inject`. It now declares `remote`
  and derives a child fiber after mounting.
- **Scope-aware scan** — the web app disables the host `skill-filesystem` line, so
  a scope-less read returned only the global layer and the panel saw 47 of 163
  skills with both other groups permanently empty. The scanner now takes an
  optional `scope`, resolved through the agent-preset standing scope key.
- **Settings mirror contract** — `settingsScope.bind(...).getSnapshot()` returns a
  synchronous state wrapper, not the settings object; the dropdown was stuck on the
  schema default `follow` and could not read persisted config. It now reads
  `.status` / `.value` / `.user`.
- **Real LLM stream contract** — text deltas arrive as `text` (not `chunk.delta`)
  and `finish.reason` is an object (`{kind: 'stop'}` / `{kind: 'error', failure}`),
  so empty results were silently swallowed as "the model produced no text" and real
  errors were invisible. Messages must also be built with `createUserMessage`.
- **Session workspace over process cwd** — the workspace group used
  `process.cwd()`, so starting DSH from inside a checkout pulled that checkout's own
  project skills in as translation targets (this caused a real incident in which
  they were rewritten and had to be restored). It now uses `session.header.cwd`, and
  when there is no session workspace it passes no `cwd` at all rather than
  guessing.
- **New-skill prompt feedback** — a batch that failed entirely left the card
  silently in place; it now reports success/failure counts inline.

### Known limitations

See the "Known limitations" section of the [README](README.md). The most notable
one: the "configured route" dropdown lists DSH's provider catalog, which is not the
same as the set of providers with a registered adapter on the local machine.

[Unreleased]: https://github.com/kaluosifa/dsh-plugin-skill2cn/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kaluosifa/dsh-plugin-skill2cn/releases/tag/v0.1.0
