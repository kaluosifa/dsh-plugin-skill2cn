import { z } from 'zod'

export const GROUPS = ['workspace', 'global', 'package'] as const
export type Group = (typeof GROUPS)[number]

export const STATES = ['untranslated', 'no-need', 'translating', 'translated', 'failed', 'stale'] as const
export type EntryState = (typeof STATES)[number]

/** 面板卡片视图（SPEC §2.4：名称/来源徽章/描述/状态/查看原文/错误+重试） */
export const skillEntryView = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string(),
  group: z.enum(GROUPS),
  state: z.enum(STATES),
  /** 已翻译/已过期卡片的英文原文（查看原文对照） */
  original: z.string().optional(),
  error: z.string().optional(),
  staleReason: z.enum(['upstream-changed', 'missing']).optional(),
})
export type SkillEntryView = z.infer<typeof skillEntryView>

export const progressView = z.object({
  running: z.boolean(),
  total: z.number(),
  completed: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  /** 翻译中的卡片 path 集合（spinner 用） */
  busyPaths: z.array(z.string()),
})
export type ProgressView = z.infer<typeof progressView>

export const batchSummary = z.object({
  succeeded: z.number(),
  failed: z.number(),
  skipped: z.number(),
})
export type BatchSummary = z.infer<typeof batchSummary>

/** 浮层提示卡片里的一条：还没被问过、也没有译文的 skill */
export const pendingSkillView = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string(),
  group: z.enum(GROUPS),
})
export type PendingSkillView = z.infer<typeof pendingSkillView>

export const testRouteResult = z.object({
  translation: z.string(),
  durationMs: z.number(),
  provider: z.string(),
  model: z.string(),
})
export type TestRouteResult = z.infer<typeof testRouteResult>

/** 「模型设置」标签页读给 UI 的当前配置视图（secret 永远不回传，只有 set 标记） */
export const llmSettingsView = z.object({
  routeMode: z.enum(['follow', 'preset', 'custom']),
  provider: z.string(),
  model: z.string(),
  customBaseURL: z.string(),
  customModel: z.string(),
  customApiKeySet: z.boolean(),
})
export type LlmSettingsView = z.infer<typeof llmSettingsView>
