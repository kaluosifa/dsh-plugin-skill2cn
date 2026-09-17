# ADR-0001: 翻译采用写盘改写，而非覆盖层 provider

- **Status**: Accepted
- **Date**: 2026-09-14

> 格式说明：domain-modeling skill 引用的 ADR-FORMAT.md 未随本机中文包分发，本文采用标准 Nygard ADR 结构（Context / Decision / Consequences）。

## Context

Skill2CN 要把 DSH skill 的英文 description 翻成中文并支持还原。调研发现两条可行路径：

1. **写盘改写**：直接修改磁盘上 `SKILL.md` 的 frontmatter `description:` 行，原文存入集中 manifest；还原 = 写回原文并删除记录。
2. **覆盖层 provider**：不改任何文件；插件通过 `ctx.skills.registerProvider` 注册高优先级覆盖层，仅在运行时 catalog 中用中文描述覆盖显示；还原 = 删除覆盖记录。

权衡：

- 覆盖层磁盘零改写、卸载即复原、无升级覆盖问题，但实现复杂度高（需正确处理 skill registry 的 rank/同名覆盖/正文转发语义），且翻译只在 DSH 运行时生效——任何直接读文件的流程仍看到英文。
- 写盘改写会真实修改用户文件，且「插件包」来源的 skill 会在 npm 包升级时被覆盖（需要升级对账兜底）；但本机已有民间先例（`~/.dsh/skills-i18n/apply-i18n.mjs`）验证可行，热刷新免费获得（chokidar watch，下一个 model step 生效），且翻译对一切读文件的消费方生效。
- 项目此前已确认的全部机制（manifest 备份、还原语义、升级对账）均围绕写盘改写设计；选覆盖层等于推翻这些共识重新设计。

## Decision

采用**写盘改写**：翻译直接改写 SKILL.md 的 description 行，英文原文集中存入插件数据目录的备份清单（manifest）；还原写回原文并删除记录。「插件包」来源的 skill 附带 ⚠️ 覆盖警告，升级对账在面板打开时自动执行。

## Consequences

- 正面：实现简单、有先例验证；无需重启即生效；翻译对 DSH 内外所有文件消费方一致可见。
- 负面：用户文件被真实修改（git diff 可见）；插件卸载不会自动复原（需先执行全部还原）；包升级会丢译文（由升级对账 + 重新翻译缓解）。
- 后续：覆盖层 provider 作为未来架构演进方向保留；若 registry 覆盖语义 tooling 成熟，可记新 ADR supersede 本文。
