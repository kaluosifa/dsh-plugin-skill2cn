import { describe, expect, it } from 'vitest'
import { isChineseDescription } from '../src/core/language.ts'

describe('isChineseDescription', () => {
  it('treats plain English as translatable', () => {
    expect(isChineseDescription('Use when debugging tricky failures.')).toBe(false)
  })

  it('treats English with identifiers as translatable', () => {
    expect(isChineseDescription('Use when editing SKILL.md or /slash-command paths like src/a.ts via the DSH API.')).toBe(false)
  })

  it('treats Chinese as no-need', () => {
    expect(isChineseDescription('当调试棘手故障时使用。')).toBe(true)
  })

  it('treats predominantly-Chinese mixed text as no-need', () => {
    expect(isChineseDescription('当需要解析 PDF 文件并提取表格时使用，支持批量处理。')).toBe(true)
  })

  it('treats predominantly-English mixed text as translatable', () => {
    expect(isChineseDescription('Use when the user says 汉化 or asks for Chinese output.')).toBe(false)
  })

  it('treats tiny CJK noise as translatable', () => {
    expect(isChineseDescription('Use when debugging. 备注')).toBe(false)
  })

  // 用户实测反馈：中文描述里夹带标识符/产品名时被误判成「未翻译」，
  // 于是「全部翻译」会把这些已经很好的中文重译改写
  it('treats identifier-dense Chinese as no-need', () => {
    expect(isChineseDescription(
      '钉钉群聊与消息。Use when 发消息、单聊/群聊、建群、群设置/成员、搜索/回复、机器人/Webhook、消息文件。DING 和班级群走 dingtalk-misc；邮件走 dingtalk-mail。前缀 dws chat。',
    )).toBe(true)
    expect(isChineseDescription('Shadcn/ui 风格设计：极简干净的组件、单色配色与 utility-first 模式。')).toBe(true)
    expect(isChineseDescription('根据 spec 或一组 tickets 实现一项工作。')).toBe(true)
    expect(isChineseDescription('沿两个轴审查自某个固定点(fixed point,commit、分支、tag 或 merge-base)以来的变更 — Standards(代码是否符合本仓库文档化的 coding standards?)和 Spec(代码是否实现了原始 issue/spec 所要求的内容?)。')).toBe(true)
  })

  it('still treats English with a few Chinese words as translatable', () => {
    expect(isChineseDescription('Use when the user asks for 汉化 or 中文输出 of a skill description.')).toBe(false)
    expect(isChineseDescription('Use when generating a Word document from 会议记录 and 待办事项.')).toBe(false)
    expect(isChineseDescription('Design, review, and diagnose DeepSeek 官方 skills。')).toBe(false)
  })
})
