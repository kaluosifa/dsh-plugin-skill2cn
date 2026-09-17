import '@deepseek-ai/dsh-llm'
import '@deepseek-ai/dsh-session'
import '@deepseek-ai/dsh-settings'
import '@deepseek-ai/dsh-skill'
import type { Context } from '@deepseek-ai/cordis'
import Schema from 'schemastery'
import { Skill2CnService, type Skill2CnConfig } from './service.ts'

export const name = 'skill2cn'

export const inject = ['skills', 'llm', 'settings', 'sessions']

export const Config: Schema<Skill2CnConfig> = Schema.object({
  /** 插件数据目录（cordis.patch.yml 以 !!js dshHomePath('skill2cn') 注入；目录由 ManifestStore 首存自建） */
  dataDir: Schema.string().required(),
})

export function apply(ctx: Context, config: Skill2CnConfig): void {
  // SPEC §3.6：LLM 配置存 ctx.settings 命名空间 skill2cn；apiKey 标 secret 获得脱敏
  ctx.settings.register(
    'skill2cn',
    Schema.object({
      routeMode: Schema.string().default('follow'), // 'follow' | 'preset' | 'custom'
      provider: Schema.string().default(''),
      model: Schema.string().default(''),
      customBaseURL: Schema.string().default(''),
      customApiKey: Schema.string().role('secret').default(''),
      customModel: Schema.string().default(''),
      // 自定义端点的兼容协议：'openai'（chat/completions）| 'anthropic'（messages）
      customProtocol: Schema.string().default('openai'),
    }),
  )

  ctx.plugin(Skill2CnService, { dataDir: config.dataDir } satisfies Skill2CnConfig)
}
