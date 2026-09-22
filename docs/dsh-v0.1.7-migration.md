# DSH 0.1.7 破坏性变更迁移说明

本文档记录 DeepSeek Harness（DSH）从 `0.1.2-alpha.3` → `dsh-v0.1.7-alpha.1` 之间，
对本插件造成破坏的 4 个变更点，以及插件 `0.2.0` 版本采取的修复方式。

排查基准：宿主最新 release `dsh-v0.1.7-alpha.1`（2026-09-22，npm dist-tag `alpha`）；
本地安装的运行时为 `0.1.6-alpha.2`。

## 兼容矩阵（先看这个）

| 宿主版本 | 插件 ≤ 0.1.2 | 插件 0.2.0 |
| --- | --- | --- |
| ≤ `0.1.6-alpha.1`（含 npm `next` = `0.1.5-rc.3`） | ✅ 可用 | ❌ 用了 0.1.7 才有的 configForms / configure / acquireScope |
| `0.1.6-alpha.2` ~ `0.1.6.x` | ❌ 破坏点 ① | ❌ 破坏点 ②③④ 的 API 在 0.1.6 尚不存在 |
| ≥ `0.1.7-alpha.1` | ❌ 全部 4 个 | ✅ 本版本的目标环境 |

即：宿主在 `0.1.6-alpha.2` ～ `0.1.6.x` 区间没有可用组合，需要回退宿主
（≤ `0.1.6-alpha.1`）或升级到 `0.1.7-alpha.1`。

**权宜方案（不改插件时）**：把宿主钉在 ≤ `0.1.6-alpha.1`，或安装 npm `next`
tag 的 `0.1.5-rc.3`（已用 tarball 核对：仍是 `codec.schema.parse`，不含
`create() factory` 校验）。

## 四个破坏点

### ① strict codec 形状：`{ schema }` → `{ create: () => schema }`

- **版本边界**：`0.1.6-alpha.2+` 引入（commit `e459e32637`，2026-09-15）；
  `0.1.6-alpha.1` 及更早不受影响。宿主侧本地安装的 `0.1.6-alpha.2` 已命中。
- **影响文件**：`src/client/contribution.ts` 的 `strict()` 助手（覆盖全部 10 个
  `result` codec 及所有参数 codec）。
- **机制**：`TypertCodec` 的 strict 形态从携带 `schema` 改为携带工厂
  `create: () => TypertSchema`（zod 结构上满足 `TypertSchema`，即 `parse` 方法）。
  三个校验点同时收紧：
  - registry `validateInvocation`（`packages/typert/registry/src/service.ts`）：
    `typeof codec.create !== 'function'` 直接抛
    `typert: <id> strict codec has no create() factory`；
  - 客户端 `installMethods` → `requireStrictCodec`
    （`packages/api/gateway/src/client/index.ts`，挂载期即校验）；
  - 宿主网关 `decode()`（`packages/api/gateway/src/index.ts`）：
    `codec.mode === 'strict'` 时执行 `codec.create().parse(value)`。
- **症状**：客户端 `ctx.remote.$mount(skill2cnRemote)` 挂载期即被
  `requireStrictCodec` 拒绝；即使漏过，网关解码时抛 `codec.create is not a
  function`，被包成 `gateway/input-invalid`。面板所有 Remote API（列表 /
  翻译 / 测试路由 …）全部失败。
- **修复**（一处助手改动，覆盖全部 codec）：

  ```ts
  // 修复前
  const strict = (typeSymbol: string, schema: z.ZodType) =>
    ({ mode: 'strict', typeSymbol, schema }) as const
  // 修复后
  const strict = (typeSymbol: string, schema: z.ZodType) =>
    ({ mode: 'strict', typeSymbol, create: () => schema }) as const
  ```

- **回归防线**：新增 `tests/contribution.spec.ts`，断言每个 descriptor 的
  `result` 与参数 codec 都暴露 `create()` 工厂且可 `parse`。

### ② settings 体系重写：`settingsScope` / `settings.register` / `settings.get` 全部移除

- **版本边界**：仅 `0.1.7-alpha.1`（commit `601d6761e4` settings overhaul）。
- **影响文件**：
  - `src/client/index.tsx` — `inject` 与 `UI_INJECT` 声明了 `settingsScope`；
  - `src/client/cordis-ext.d.ts` — 手写的 `settingsScope` 声明块；
  - `src/client/LlmSettings.tsx` — `ctx.settingsScope.bind({ namespace: 'skill2cn' })`
    读写镜像；
  - `src/index.ts` — `ctx.settings.register('skill2cn', Schema…)` 注册描述符；
  - `src/service.ts` — `readSettings()` 用 `this.ctx.settings.get(SETTINGS_NS)` 读值。
- **机制**：
  - 客户端：`settingsScope` 服务被移除，取而代之是 `ctx.configForms`
    （`ConfigForms`，来自 `@deepseek-ai/dsh-client-ui-settings/client`，已组合进
    web-app bundle）。写路径变为 `configForms.get(entryId)` 返回的
    `ConfigForm<T>`：`getSnapshot() → { status, value, base, user, revision,
    writable, mode }`、`subscribe`、`set/unset/mutate`（写经
    `remote.settings.mutate` 走 profile patch）。
  - 宿主：`settings.register/get` 不复存在；设置描述符改为从插件
    `static Config` 的 **`.volatile()` 字段**派生，经
    `SettingsForms`（服务名 `'settings'`）`configure({ auto }, owner)` 登记；
    值以「活引用」形式存在——`.volatile()` 字段解析为 `Volatile<T>`（有
    `.get()`），运行中原地更新（`loader/volatile-update`），不重挂载。
  - 设置命名空间键 = profile entry 的 `options.id`，即 `cordis.patch.yml` 里的
    `id: skill2cn` —— `configForms.get('skill2cn')` 与写入查找都以它为键，
    故键保持 `'skill2cn'` 不变。
- **症状**：宿主侧 `ctx.settings.register is not a function`（apply 即崩）；
  `readSettings` 读不到值。客户端侧声明了不存在的服务 `settingsScope`，
  cordis 注入守卫使面板 fiber 永不激活（设置分区不渲染）。
- **修复**：
  - `Config` 改为 fork 版 schemastery（`@deepseek-ai/schemastery`，3.18.3 起带
    `.volatile()`；上游 `schemastery` 没有）的 schema，全部 LLM 字段
    `.volatile()`，`customApiKey` 保留 `.role('secret')` 脱敏：

    ```ts
    export const Config: Schema<Skill2CnConfig> = Schema.object({
      dataDir: Schema.string().required(),
      routeMode: Schema.string().default('follow').volatile(),
      // … provider / model / customBaseURL / customModel 同型 …
      customApiKey: Schema.string().role('secret').default('').volatile(),
      customProtocol: Schema.string().default('openai').volatile(),
    })
    ```

  - `apply()` 按官方范式（先例 `agent-default-model`）登记：
    `ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)))`，
    并把**整份 config**（含 volatile 字段）传给 `Skill2CnService`；
  - 服务构造函数保存 config，`readSettings()` 逐字段 `.get()` 组装
    `RouteSettings`（每次读取都是最新值）；
  - 客户端 `inject` 移除 `settingsScope`、`UI_INJECT` 增加 `configForms`；
    `LlmSettings` 改为 `ctx.configForms.get<SettingsValue>('skill2cn')`；
    `cordis-ext.d.ts` 手工声明 `configForms` 的结构类型（沿用本文件
    「无运行时依赖、只声明结构」的既有风格）。
  - 静态注入列表同时移除 `settings`（服务可能缺席时不阻塞插件加载，
    `configure` 走 `ctx.inject` 派生 fiber，与官方先例一致）。

### ③ 消息 source 形态：`kind: 'plugin'` 移除，一次性消息改用普通 `RequestUserInput`

- **版本边界**：仅 `0.1.7-alpha.1`（commit `fb79a944f5`）。
- **影响文件**：`src/service.ts` 的 `dshLlm()` —— 旧代码把 translator 产出的
  user 消息重新包一层 `createUserMessage({ …, source: { kind: 'plugin', plugin:
  'dsh-plugin-skill2cn' } })`。
- **机制**：`MessageSourceMap` 的 plugin source 形态被移除，带
  `source: { kind: 'plugin' }` 的构造不再是合法入参。0.1.7 同时新增了
  **无身份**的一次性用户消息 `RequestUserInput = { role: 'user', content,
  id?: never, source?: never }`——一次性请求本就不该携带会话内身份。
- **症状**：类型层面 `createUserMessage` 入参不再匹配；运行时 llm 对非法
  source 的消息拒绝或产生错误注入，翻译调用失败。
- **修复**：**整段映射删除，`messages` 原样透传**。translator 已经构造普通
  user 消息对象，正是 0.1.7 的 `RequestUserInput` 形态：

  ```ts
  // 修复前：map + createUserMessage({ …, source: { kind: 'plugin', … } })
  // 修复后：
  stream: (options) => llm.stream({ ...options }) as AsyncIterable<never>,
  ```

### ④ standing scope：`standingKeyFor()` → `acquireScope()` 租约

- **版本边界**：仅 `0.1.7-alpha.1`（commit `d1e22a7e24`）。
- **影响文件**：`src/service.ts` 的 `standingScope()`（被 `list()` 与
  `recomputePending()` 调用）。
- **机制**：`AgentPresetRegistry.standingKeyFor()` 被移除，替代 API 是
  `acquireScope(id?): Promise<{ key: ScopeKey } & AsyncDisposable>` —— 返回的是
  **租约**：`key` 即原来直接拿到的 scope key，用完必须
  `[Symbol.asyncDispose]()` 释放，否则 standing mount 不回收（泄漏）。
- **症状**：`presets.standingKeyFor is not a function` —— `list()` /
  `pending()` 抛错，面板列表与「新增 skill」浮层失效。
- **修复**：

  ```ts
  private async acquireStandingScope(): Promise<({ key: unknown } & AsyncDisposable) | undefined> {
    const presets = (this.ctx as unknown as {
      agentPresets?: { acquireScope(id?: string): Promise<{ key: unknown } & AsyncDisposable> }
    }).agentPresets
    if (presets === undefined) return undefined          // 服务缺席：退化为全局层，不阻断面板
    try { return await presets.acquireScope() } catch { return undefined }
  }
  ```

  两个调用方改为 `const lease = await this.acquireStandingScope()` 后
  `const scope = lease?.key`，`finally { await lease?.[Symbol.asyncDispose]() }`
  保证释放（沿用 skill-catalog 的「可选 + try/catch 降级」先例）。
- **配套**：`tsconfig.json` 的 `lib` 增加 `"ESNext.Disposable"`（`AsyncDisposable`
  / `Symbol.asyncDispose` 的类型来源）；服务静态注入移除 `agentPresets`
  （可选依赖，不再声明强依赖以免缺席时停用插件）。

## 依赖与构建配置变更

| 项 | 旧 | 新 |
| --- | --- | --- |
| `dependencies` | `schemastery@^3.14.0` | `@deepseek-ai/schemastery@3.18.3`（带 `.volatile()`） |
| `dependencies` | `dsh-typert-protocol` / `dsh-home-paths` `0.1.2-alpha.3` | `0.1.7-alpha.1` |
| `devDependencies` | `dsh-llm` / `dsh-session` / `dsh-settings` / `dsh-skill` `0.1.2-alpha.3` | `0.1.7-alpha.1` |
| `version` | `0.1.2` | `0.2.0`（破坏性兼容切换，递增 minor） |
| `tsconfig.json` | `lib: ["ES2022"]` | `lib: ["ES2022", "ESNext.Disposable"]` |
| `tsdown.config.ts` | `HOST_EXTERNALS` 含 `'schemastery'` | 改为 `'@deepseek-ai/schemastery'`（宿主外置清单跟随 import） |

未变（已逐项核对 0.1.7 源码）：`RemoteError` 线上形状与 `@Remote` 原型标记、
`session/event` + `request/header` + `header.cwd`、`skills.snapshot/list/get`
的 `{ scope, cwd, signal }` 参数与 `skills/change`、服务名
`sessions|llm|skills|settings|agentPresets`、`sessions.list()`、
`listConfigurableProviders/discoverModels`、`resolveDshHome`、cordis 4.0.2
peer、`settings.section` 槽位标签契约、`package.json` 打包字段。

## 验证清单（0.2.0 发布前执行）

- [x] `pnpm install` 后确认 `@deepseek-ai/schemastery` 含 `.volatile()`
- [x] `pnpm typecheck`（host + client 两套 tsconfig）
- [x] `pnpm test`（含新增 `tests/contribution.spec.ts` 回归防线）
- [x] `pnpm build`（tsc + tsdown 双产物）+ `lib/` 导入冒烟
- [x] `npm pack --dry-run` 核对 tarball 文件清单
- [x] 提交并推送 GitHub、`npm publish`（0.2.0）

## 参考

- 宿主源码：`deepseek-harness@dsh-v0.1.7-alpha.1`
  - codec 工厂：`packages/typert/registry/src/service.ts`（validateInvocation）、
    `packages/api/gateway/src/index.ts`（decode）、
    `packages/api/gateway/src/client/index.ts`（requireStrictCodec）
  - settings：`packages/settings/settings/src/index.ts`、
    `packages/client/ui-settings/src/client/config-form*.ts`、
    `packages/core/agent-default-model/src/index.ts`（configure + `.get()` 范式）
  - 消息：`packages/llm/llm/src/types.ts`（`RequestUserInput`）
  - 租约：`packages/preset/agent-preset-registry/src/index.ts`（`acquireScope`）、
    `packages/api/session-controller/src/skill-catalog.ts`（降级先例）
