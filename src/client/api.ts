import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { BatchSummary, PendingSkillView, ProgressView, SkillEntryView, TestRouteResult } from '../shared/wire.ts'

export interface Skill2CnApi {
  list(): Promise<RemoteResult<SkillEntryView[]>>
  translate(path: string): Promise<RemoteResult<SkillEntryView>>
  restore(path: string): Promise<RemoteResult<{ ok: true }>>
  translateAll(): Promise<RemoteResult<BatchSummary>>
  restoreAll(): Promise<RemoteResult<BatchSummary>>
  status(): Promise<RemoteResult<ProgressView>>
  testRoute(): Promise<RemoteResult<TestRouteResult>>
  /** 还没被问过、也没有译文的 skill（浮层提示用；目录没变时宿主回内存缓存） */
  pending(): Promise<RemoteResult<PendingSkillView[]>>
  dismissNewcomers(names: string[]): Promise<RemoteResult<{ ok: true }>>
  translateMany(paths: string[]): Promise<RemoteResult<BatchSummary>>
}

export function skill2cnApi(ctx: ClientContext): Skill2CnApi {
  return (ctx.remote as unknown as { skill2cn: Skill2CnApi }).skill2cn
}

/** 本地最小结构类型（对应 llm types.ts L204-216 / L233-250 的字段子集，避免运行时依赖） */
export interface ConfigurableProvider {
  readonly provider: string
  readonly displayName: string
  readonly settingsNs: string
}

export interface DiscoveredModel {
  readonly id: string
  readonly name?: string
}

export interface LlmRemoteApi {
  listConfigurableProviders(): Promise<RemoteResult<ConfigurableProvider[]>>
  discoverModels(settingsNs: string, request: { provider?: string }): Promise<RemoteResult<DiscoveredModel[]>>
}

export function llmApi(ctx: ClientContext): LlmRemoteApi {
  return (ctx.remote as unknown as { llm: LlmRemoteApi }).llm
}
