# CONTEXT — dsh-Skill2CN

## Glossary

- **Skill2CN**: 本插件——把 deepseek-harness (DSH) 的 skill 描述翻译成中文，并支持一键还原。
- **Skill 描述 (description)**: `SKILL.md` frontmatter 中的 `description` 字段。本插件唯一翻译的内容；`name` 与 skill 正文（instructions）不译。
- **翻译 (Translate)**: 调用 DSH 已配置的 LLM，把某 skill 的英文描述替换为中文译文，并把英文原文写入备份清单。
- **还原 (Restore)**: 把备份清单中的英文原文写回 `SKILL.md`，并删除该条备份记录；该 skill 回到「未翻译」。
- **备份清单 (Manifest)**: 插件数据目录下的集中 JSON 存储（skill → 英文原文及元信息），是「已翻译 / 未翻译」状态的唯一判定依据（不猜测文件语言）。
- **已翻译 (Translated)**: 备份清单中存在记录的 skill。
- **未翻译 (Untranslated)**: 备份清单中无记录的 skill。
- **Skill 来源**: skill 的安装位置分类——**工作区**（项目 `.dsh/skills`、`.agents/skills`）/ **全局**（用户级 `~/.dsh/skills`、`~/.agents/skills`）/ **插件包**（profile `node_modules` 内 npm 包自带的 skills）。管理面板按此三分法分组展示，三类全部纳入管理范围。_Avoid_: 内置 (built-in)——DSH 核心不附带任何内置 skill，该分类在现实中为空。
- **写盘改写 (Write-to-disk)**: 翻译的实现架构（ADR-0001）——直接改写磁盘上 SKILL.md 的 description 行；对立的落选方案是「覆盖层 provider」（注册高优先级 skill provider 仅在运行时覆盖描述、不动磁盘）。
- **无需翻译**: 描述本身已是中文（或无英文可翻）的 skill（如 mattpocock-skills-dsh-zh 包内的 skill）；批量翻译时跳过。
- **包覆盖警告**: 「插件包」来源的 skill 文件会在 npm 包升级/重装时被覆盖；卡片徽章附带 ⚠️ 提示，覆盖后由升级对账兜底。
- **管理面板 (Management Panel)**: DSH 设置界面中由本插件提供的面板，含「已翻译」「未翻译」两个标签页；每个 skill 以小卡片展示，标签页首行居中分别是「全部还原」「全部翻译」按钮。
- **插件形态**: 独立插件项目（本工作区即其仓库），按 DSH 插件规范开发，不写入 DSH 主仓库。
- **翻译 LLM 路由 (Translation Route)**: 插件执行翻译所用的 LLM 配置；默认跟随 DSH 当前会话路由，可在「设置LLM」标签页中覆盖。
- **设置LLM 标签页**: 管理面板的第三个标签页，用于选择翻译 LLM 路由，并提供「测试」功能。
- **测试 LLM (Test)**: 用当前选定的翻译路由执行一次真实的小型翻译调用，展示返回内容与耗时，验证该路由可用且译文质量达标。
- **插件标识**: 插件 id 为 `skill2cn`（包名 `dsh-plugin-skill2cn`），设置界面显示名「Skill2CN · 技能汉化」。
- **目标语言**: 翻译目标固定为**简体中文**；不做繁体/多语言切换。
- **入口**: 唯一入口是设置界面的管理面板；v1 不提供 slash command 或 agent 工具。
- **升级对账 (Reconcile)**: 打开管理面板时校验备份清单与磁盘文件的一致性——文件被升级覆盖回英文且与备份原文一致 → 静默清除记录并归入「未翻译」；文件英文与备份原文不一致（上游改了描述）→ 标记「已过期」，保留原文备份并提供「重新翻译」。
