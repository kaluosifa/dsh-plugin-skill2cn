# Skill2CN · 产品规格（SPEC）

> 本文是 grilling 共识的固化快照，与 `CONTEXT.md`（词汇表）、 `docs/adr/0001-write-to-disk-translation.md`（架构决策）配套。术语以 CONTEXT.md 为准；本文若与 CONTEXT.md 冲突，先修术语再改本文。

## 1. 产品定义

独立 DSH 插件（Cordis 插件形态）：

- **插件 id**: `skill2cn`；**包名**: `dsh-plugin-skill2cn`
- **显示名**: 「Skill2CN · 技能汉化」
- **功能**: 把 skill 的英文 `description` 翻译成**简体中文**，并可一键还原
- **唯一入口**: DSH 设置界面的独立分区页（`settings.section` slot）
- **形态**: 独立插件项目（本仓库），不写入 DSH 主仓库；通过 `dsh plugin add` 安装进 profile

### 翻译粒度

- 只译 `SKILL.md` frontmatter 的 `description` 字段
- `name` 保持英文（它是调用标识符）
- skill 正文（instructions）不译
- 目标语言固定**简体中文**，不做多语言

## 2. 管理面板（设置分区页，3 个标签页）

### 2.1 「未翻译」标签页

- 每个 skill 一张小卡片，卡片含「**翻译**」按钮
- 第 1 行居中：「**全部翻译**」按钮
- 标签页内按 **Skill 来源** 分小节展示（工作区 / 全局 / 插件包），组标题 + 组内卡片网格

### 2.2 「已翻译」标签页

- 每个 skill 一张小卡片，卡片含「**还原**」按钮
- 第 1 行居中：「**全部还原**」按钮
- 卡片带「**查看原文**」切换：从备份清单读取英文原文做对照
- 同样按来源分小节

### 2.3 「设置LLM」标签页

- 选择翻译 LLM 路由：
  - 默认项「**跟随 DSH 当前会话路由**」
  - 下拉列出 DSH 已配置的 provider/model（复用 harness 凭证）
  - 「高级」折叠区：自定义 OpenAI 兼容端点（base URL + API key + model 名）
- 「**测试**」按钮：用当前选定路由执行一次真实小翻译（如 "Use when debugging tricky failures." → 中文），就地显示**译文 + 耗时 + 实际模型名**

### 2.4 卡片规格

- 内容：skill 名 + 来源徽章 + 描述（截断 3 行，点击展开全文）
- 来源徽章：工作区 / 全局 / 插件包；「插件包」徽章附带 ⚠️（提示"包升级会覆盖译文"）
- 状态：翻译中（spinner）/ 成功 / 失败（错误标识 + 「重试」按钮）
- 不显示翻译时间（v1 从简）

## 3. 核心机制

### 3.1 翻译（写盘改写，ADR-0001）

1. 读取目标 `SKILL.md`，解析 frontmatter 提取英文 description
2. 写入备份清单（manifest）：skill 文件路径 → 英文原文 + 元信息
3. 调用翻译 LLM 路由翻译（固定内置 prompt）
4. 改写 `SKILL.md` 的 `description:` 行为中文译文（frontmatter 其余部分与正文不动）

**翻译 prompt 规则**（内置固定，v1 不开放自定义）：

- 标识符、`/slash-command`、文件路径、产品名（DeepSeek、DSH、API 等）不译
- "Use when…" 等触发句式统一译为「当……时使用」
- 保留原文 markdown 结构

### 3.2 备份清单（Manifest）

- 集中 JSON 存储，位于插件数据目录
- 是「已翻译 / 未翻译」状态的**唯一判定依据**（不猜测文件语言）
- 记录：skill 文件路径、英文原文、必要元信息

### 3.3 还原

- 写回 manifest 中的英文原文到 `SKILL.md`，**删除**该条备份记录
- 卡片回到「未翻译」——两个标签页互斥，无第三态

### 3.4 升级对账（Reconcile）

面板打开时自动校验 manifest 与磁盘文件一致性：

- 文件已变回英文且与备份原文**一致**（包升级覆盖）→ 静默清除备份记录，归入「未翻译」
- 文件英文与备份原文**不一致**（上游改了描述）→ 标记「**已过期**」，保留原文备份供查看，提供「重新翻译」
- 描述本身已是中文（无英文可翻，如 mattpocock-skills-dsh-zh）→ 「无需翻译」，批量时跳过

### 3.5 执行模型

- 单个/批量翻译均为**异步任务**，面板保持可操作
- 批量并发上限 **3**，顶部/底部显示总进度（如 3/12）
- 失败处理：卡片标错误态 + 「重试」；批量跳过失败项继续，结束汇总「成功 N / 失败 M」

### 3.6 LLM 配置存储

- 存 `ctx.settings` 命名空间 `skill2cn`（免费获得 schema 校验 + API key 脱敏）
- 备份清单存插件数据目录（它是数据不是配置）
- 配置全局一份，所有 profile/会话共用

### 3.7 生效时机

- 写盘后 DSH 热刷新自动生效：chokidar watch → `skills/change` → 下一个 model step catalog 更新
- **无需重启**

## 4. Skill 来源分类（事实基础）

| 分类 | 位置 | rank |
|---|---|---|
| 工作区 | `<项目>/.dsh/skills`、`<项目>/.agents/skills` | 100/200 |
| 全局 | `~/.dsh/skills`、`~/.agents/skills` | 400/500 |
| 插件包 | profile `node_modules` 内包自带 skills | provider 自带（如 550） |

注意：DSH 核心**无内置 skill**（见 CONTEXT.md「Skill 来源」）。custom dirs（rank 300）与 bundled dir（rank 600）若存在，按实际位置归入「全局」或「工作区」组。

## 5. 技术挂点（调研结论）

- **插件形态**: Cordis 插件，包导出 `{ name, inject, apply }`；`package.json` 声明 `dsh.bundle.patch: "./cordis.patch.yml"` + `dsh.client: { inject: [...], platform: "web" }`；`exports["./client"]` 指向构建产物
- **UI**: `ctx.slots.inject("settings.section", ...)` 注册独立分区页；文案经 `ctx.locale.register`（zh/en 字典）
- **服务端**: Typert `@Remote` 服务（浏览器 `ctx.remote.skill2cn.*` 调用）：列出 skills 及来源、翻译、还原、批量、对账、测试 LLM
- **LLM**: `ctx.llm.listProviders()` / `listModels(provider)` 列路由；`ctx.llm.stream(GenerateOptions)` 发起翻译调用；当前路由范式参考 `session-title-llm`
- **Skill 解析**: 参照 `packages/skill/skill-filesystem/src/index.ts` 的 `parseSkillFile`/`parseFrontmatter`（`---` 围栏 + js-yaml）
- **参考样例**: `dsh-plugin`（settings.section + server/client 双源树）、 `@nanmicoder/dsh-agent-teams`（server+client）、 `mattpocock-skills-dsh-zh`（skill provider）
- **民间先例**: `~/.dsh/skills-i18n/apply-i18n.mjs`（改写磁盘 + 时间戳 JSON 备份，已验证可行）

## 6. 排除项（Non-goals, v1）

- 不翻 skill 正文与 `name`
- 不做繁体/多语言切换
- 不开放用户自定义翻译 prompt
- 不做聊天内入口（slash command / agent 工具）
- 不做覆盖层 provider 架构（未来演进方向，见 ADR-0001）
- 不做组级批量按钮（来源小节的"翻译本组/还原本组"）
- 不显示翻译时间

## 7. 验收标准

1. 设置界面出现「Skill2CN · 技能汉化」分区页，含 3 个标签页
2. 「未翻译」页卡片按来源分组，点「翻译」后卡片异步进入翻译中，成功后移到「已翻译」
3. 「全部翻译」3 并发执行，有总进度与成功/失败汇总；失败卡片可单独重试
4. 「已翻译」页点「还原」后卡片回到「未翻译」，SKILL.md 恢复英文原文，manifest 记录删除；「全部还原」同理
5. 已翻译卡片可「查看原文」对照
6. 翻译后当前会话下一个 model step 的 skill catalog 即为中文，无需重启
7. 「设置LLM」可切换路由（跟随默认 / 已配置 / 自定义端点），「测试」显示译文+耗时+模型名；API key 在设置存储中脱敏
8. 面板打开时自动对账：被包升级覆盖的条目正确归类（静默清除 / 标已过期）
9. 已是中文的 skill 标记「无需翻译」且批量跳过
