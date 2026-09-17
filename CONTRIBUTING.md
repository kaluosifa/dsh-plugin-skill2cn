# Contributing / 贡献指南

English | [简体中文](#简体中文)

Thanks for your interest in Skill2CN. This document covers both languages; the
Chinese section follows the English one.

## Repository status: published snapshot

This repository is a **published snapshot** of the plugin, not the primary
development tree. Development happens in a private working tree, and the files
here are re-synced on each release.

In practice this means:

- Issues and bug reports are very welcome — they are the most useful thing you can send.
- A pull request may be **re-applied onto the private tree** rather than merged
  as-is. Your authorship is preserved in the commit, but the change may land with
  a different commit hash and history.
- If you are planning anything beyond a small fix, please open an issue first so
  we can agree on the approach before you invest time.

## Requirements

| Tool | Version |
|---|---|
| Node | ≥ 20 (CI runs 20 and 22) |
| pnpm | ≥ 9 |

The dependency `@deepseek-ai/*` is published on the public npm registry, so no
special registry configuration is needed. If your environment is behind a mirror,
make sure the mirror carries `@deepseek-ai/*@0.1.2-alpha.3` and
`@deepseek-ai/cordis@4.0.2`.

## Setup and commands

```bash
pnpm install
pnpm typecheck    # tsc over both tsconfig.json (host) and tsconfig.client.json (client)
pnpm test         # vitest run — tests/**/*.spec.ts
pnpm build        # tsc -p tsconfig.build.json && tsdown
pnpm dev          # same as build, with tsdown --watch
```

`lib-tsc/` and `lib/` are build output and are not tracked.

### Two-half build pipeline

The `@Remote` decorator requires TypeScript's standard-decorator transpilation,
which esbuild/tsdown does not do. So `build` is two steps: `tsc` emits `lib-tsc/`,
then tsdown bundles `lib-tsc/index.js` into `lib/index.js` (host, ESM) and
`src/client/index.tsx` into `lib/client.js` (client, browser closure-factory CJS).
If you change build configuration, verify both halves still load in a real DSH
instance — a passing `pnpm build` does not prove the client half registers.

## Tests

- **Any change under `src/core/` must come with unit tests.** `src/core/**` is the
  pure, dependency-free layer; it is covered by `tests/**/*.spec.ts` and is where
  strict TDD is expected (write the failing test first).
- `src/service.ts`, `src/index.ts` and `src/client/**` are integration layers
  against DSH APIs. They are not fully unit-testable here; describe in your PR how
  you verified them (and against which DSH version).

Run the full suite before opening a PR. A green `pnpm install && pnpm typecheck &&
pnpm test && pnpm build` in a clean checkout is the bar.

## Commits

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

- Types in use: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`
- Scopes in use: `core`, `host`, `client`
- Subject in the imperative mood, lower case, no trailing period
- Examples: `fix(host): project root from the session workspace, not process.cwd()`,
  `feat(client): group 无需翻译 into the 已翻译 tab; add per-tab counts`

## Branch and PR flow

1. Fork the repository and branch off `main`, e.g. `fix/stale-reconcile` or `feat/anthropic-route`.
2. Make your change. Keep it focused — one concern per PR.
3. Run `pnpm typecheck && pnpm test && pnpm build`.
4. Open a PR and fill in the PR template: what changed, which issue it closes, and
   which checks you ran.
5. If your change alters user-visible behaviour, update the docs in the same PR:
   `README.md` / `README.zh-CN.md`, `docs/SPEC.md`, and `CHANGELOG.md` under
   `Unreleased`.

## Code style

- TypeScript, `strict` and `exactOptionalPropertyTypes` are on for both tsconfigs;
  do not add `any` or `@ts-ignore` to get around them.
- Match the surrounding code's idiom, comment density and naming.
- Comments should state constraints the code cannot express on its own. Do not
  narrate what the next line does.
- The client half has no build-time access to DSH design tokens. Use the documented
  `--dsw-alias-*` tokens only; inventing a token name silently falls back to a
  transparent or default value (this has caused real "white text on white
  background" bugs — see `docs/ACCEPTANCE.md` defects B7 and B8).

## Reporting bugs

Use the bug report template. The two fields that matter most are your **DSH version**
and your **plugin version** — most breakage so far has come from DSH API drift
rather than from plugin logic.

For security issues, do not open a public issue; see [SECURITY](#security) below.

## Security

Please report suspected vulnerabilities privately to the maintainer's email in
`package.json` rather than in a public issue. Note that this plugin stores an
optional custom-endpoint API key in DSH settings (declared as a `secret` field, so
it is masked in the settings view and never returned in plaintext), and it rewrites
files on disk — a bug that writes to the wrong path is a security-relevant bug, so
such reports are treated as high priority.

---

## 简体中文

感谢你对 Skill2CN 的兴趣。本文上半部分是英文，中文从这一节开始。

### 仓库状态：发布快照

本仓库是插件的**发布快照**，不是主开发树。开发在另一个私有工作树中进行，本仓库文件在每次发版时同步。

这意味着：

- Issue 与缺陷报告非常欢迎 —— 这是你能提供的最有用的东西。
- Pull Request 可能会被**重新应用到私有工作树**，而不是直接合并。你的署名会在 commit 中保留，但落地时的 commit hash 与历史可能不同。
- 如果你打算做的不只是小修补，请先开 issue 对齐方案，避免白做。

### 环境要求

| 工具 | 版本 |
|---|---|
| Node | ≥ 20（CI 跑 20 与 22） |
| pnpm | ≥ 9 |

依赖 `@deepseek-ai/*` 已发布在公共 npm，无需特殊 registry 配置。若你处于镜像环境，请确认镜像收录了 `@deepseek-ai/*@0.1.2-alpha.3` 与 `@deepseek-ai/cordis@4.0.2`。

### 安装与命令

```bash
pnpm install
pnpm typecheck    # host（tsconfig.json）+ client（tsconfig.client.json）两套 tsc
pnpm test         # vitest run —— tests/**/*.spec.ts
pnpm build        # tsc -p tsconfig.build.json && tsdown
pnpm dev          # 同上，tsdown --watch
```

`lib-tsc/` 与 `lib/` 是构建产物，不入库。

#### 两段式构建管线

`@Remote` 装饰器需要 TypeScript 的标准装饰器转译，esbuild/tsdown 不做。所以 `build` 分两步：`tsc` 产出 `lib-tsc/`，再由 tsdown 把 `lib-tsc/index.js` 打包成 `lib/index.js`（host，ESM）、把 `src/client/index.tsx` 打包成 `lib/client.js`（client，浏览器 closure-factory CJS）。若你改了构建配置，请在真实 DSH 实例里确认两半都能加载 —— `pnpm build` 通过并不证明 client 半身注册成功。

### 测试要求

- **改 `src/core/` 必须配单测。** `src/core/**` 是无依赖的纯逻辑层，由 `tests/**/*.spec.ts` 覆盖，这里按 strict TDD 要求（先写失败测试）。
- `src/service.ts`、`src/index.ts`、`src/client/**` 是对 DSH API 的集成层，本地无法完整单测；请在 PR 中说明你的验证方式与所依据的 DSH 版本。

开 PR 前请跑全量。基线是干净检出下 `pnpm install && pnpm typecheck && pnpm test && pnpm build` 全绿。

### 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>
```

- 已用 type：`feat`、`fix`、`docs`、`chore`、`test`、`refactor`
- 已用 scope：`core`、`host`、`client`
- subject 用祈使句、小写、结尾不加句号
- 示例：`fix(host): project root from the session workspace, not process.cwd()`

### 分支与 PR 流程

1. Fork 后从 `main` 切分支，如 `fix/stale-reconcile`、`feat/anthropic-route`。
2. 改动保持聚焦 —— 一个 PR 只解决一件事。
3. 跑 `pnpm typecheck && pnpm test && pnpm build`。
4. 开 PR 并按模板填写：改了什么、关闭哪个 issue、跑了哪些检查。
5. 若改动了用户可见行为，请在同一个 PR 里同步文档：`README.md` / `README.zh-CN.md`、`docs/SPEC.md`，以及 `CHANGELOG.md` 的 `Unreleased` 段。

### 代码风格

- TypeScript，两套 tsconfig 都开了 `strict` 与 `exactOptionalPropertyTypes`；不要用 `any` 或 `@ts-ignore` 绕过。
- 与周边代码保持一致的写法、注释密度与命名。
- 注释只写代码本身表达不出的约束，不要复述下一行在做什么。
- client 半身在构建期拿不到 DSH 设计 token。只用**已文档化**的 `--dsw-alias-*`；臆造 token 名会静默回落成透明或默认值（这曾造成真实的「白底白字」缺陷，见 `docs/ACCEPTANCE.md` 的 B7、B8）。

### 报告缺陷

请用 bug report 模板。最重要的两个字段是 **DSH 版本**与**插件版本** —— 目前绝大多数故障来自 DSH API 漂移，而非插件自身逻辑。

安全类问题请勿开公开 issue，改以私下邮件联系（地址见 `package.json`）。注意本插件会把可选的自定义端点 API key 存在 DSH 设置里（声明为 `secret` 字段，设置视图脱敏、不回传明文），并且它会改写磁盘文件 —— 「写错路径」属于安全相关缺陷，按高优先级处理。
