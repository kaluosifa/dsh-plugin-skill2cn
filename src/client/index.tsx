import React from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { skill2cnRemote } from './contribution.ts'
import { en, zh } from './locales.ts'
import { NewSkillPrompt } from './NewSkillPrompt.tsx'
import { Skill2CnSection } from './Section.tsx'
import { injectStyles } from './styles.ts'

const NS = 'skill2cn'

/** 挂载方只声明 `remote`；声明自己的命名空间会让插件等自己而永久停用（诊断修正 D11）。 */
export const inject = ['slots', 'locale', 'remote']

/**
 * 读 Remote 命名空间的 fiber 必须声明分段字面名：cordis 的 traceable 代理把
 * `ctx.remote.<ns>` 改写为 `Reflect.get(ctx, 'remote.<ns>')`，注入守卫按字面名匹配
 * （`<DSH>/docs/api-gateway.md` L58；先例 `ui-settings-models/src/client/index.ts` L65-68）。
 */
const UI_INJECT = ['slots', 'locale', 'configForms', 'remote.skill2cn', 'remote.llm']

function registerUi(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'skill2cn', order: 100, label: () => t('nav'), locale: NS },
      // 闭包把带注入的 ctx 与 t 传入组件（组件不得拿到无 remote.<ns> 注入的上层 ctx）
      () => <Skill2CnSection ctx={ctx} t={t} />,
    ))
  // 框架级浮层：新增 skill 时右下角问「要不要翻译」。`shell.overlay` 是 DSH 专为此预留的
  // 加法式槽位（层本身点击穿透，条目自己 opt-in 指针事件），不遮对话、任何页面可见。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'skill2cn-new-prompt', order: 100, label: () => t('prompt.label'), locale: NS },
      () => <NewSkillPrompt ctx={ctx} t={t} />,
    ))
}

export async function apply(ctx: ClientContext): Promise<void> {
  ctx.locale.register(NS, { zh, en })
  await ctx.remote.$mount(skill2cnRemote)
  injectStyles()
  await ctx.inject(UI_INJECT, registerUi)
}
