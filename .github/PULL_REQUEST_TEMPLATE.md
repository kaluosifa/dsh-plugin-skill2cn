## What this changes

<!-- A short description of the change and the problem it solves. -->

## Related issue

<!-- e.g. Closes #12. Write "none" if there is no issue. -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation only
- [ ] Build / CI / tooling

## How it was verified

<!--
This repository is a published snapshot: `src/service.ts`, `src/index.ts` and
`src/client/**` are integration layers against DSH APIs that cannot be fully unit
tested here. Describe what you actually ran/observed, and against which DSH version.
-->

- DSH version used:
- What I observed:

## Checks

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes, and both halves were loaded in a real DSH instance
      (a green build alone does not prove the client half registers)
- [ ] New or changed behaviour under `src/core/` comes with unit tests
- [ ] For an LLM-route change: `Test` on the Model Settings tab returns a green verdict
- [ ] For a UI change: checked in **both** the light and dark themes

## Documentation

- [ ] `CHANGELOG.md` updated under `Unreleased`
- [ ] `README.md` and `README.zh-CN.md` updated (keep the two in sync)
- [ ] `docs/SPEC.md` updated, or a `SUPERSEDES` note added to
      `docs/ACCEPTANCE.md` if this deliberately departs from the spec
- [ ] Not needed

## Checklist

- [ ] This change is focused on one concern
- [ ] No API keys, tokens, private skill descriptions or machine-specific absolute
      paths are included in the diff
- [ ] Commit messages follow Conventional Commits
