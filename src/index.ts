import '@deepseek-ai/dsh-llm'
import '@deepseek-ai/dsh-session'
import '@deepseek-ai/dsh-settings'
import '@deepseek-ai/dsh-skill'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Skill2CnService, type Skill2CnConfig } from './service.ts'

export const name = 'skill2cn'

export const inject = ['skills', 'llm', 'sessions']

/**
 * SPEC §3.6：LLM 路由配置。0.1.7 起 `settings.register` 已移除，设置描述符改由
 * Config 的 `.volatile()` 字段派生；volatile 字段运行时是活引用（`.get()` 读当前值，
 * 写入原地更新不重挂载），apiKey 标 secret 获得脱敏。
 */
export const Config = Schema.object({
  /** 插件数据目录（cordis.patch.yml 以 !!js dshHomePath('skill2cn') 注入；目录由 ManifestStore 首存自建） */
  dataDir: Schema.string().required(),
  routeMode: Schema.string().default('follow').volatile(), // 'follow' | 'preset' | 'custom'
  provider: Schema.string().default('').volatile(),
  model: Schema.string().default('').volatile(),
  customBaseURL: Schema.string().default('').volatile(),
  customApiKey: Schema.string().role('secret').default('').volatile(),
  customModel: Schema.string().default('').volatile(),
  // 自定义端点的兼容协议：'openai'（chat/completions）| 'anthropic'（messages）
  customProtocol: Schema.string().default('openai').volatile(),
})

export function apply(ctx: Context, config: Skill2CnConfig): void {
  // 官方范式（先例 agent-default-model）：登记 settings owner；auto:false 不自动生成 UI 段
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })

  ctx.plugin(Skill2CnService, config)
}
