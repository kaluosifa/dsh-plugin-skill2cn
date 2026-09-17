import type { Skill2CnApi, LlmRemoteApi } from './api.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    locale: {
      register(ns: string, dicts: Record<string, Record<string, string>>): void
      bind(ns: string): (key: string, params?: Record<string, string | number>) => string
    }
    remote: {
      $mount(contribution: unknown): Promise<() => Promise<void>>
      skill2cn: Skill2CnApi
      llm: LlmRemoteApi
    }
    settingsScope: {
      /** `bind` 返回的镜像视图：`getSnapshot()` 是同步状态包装，不是设置对象本身（诊断修正 D13） */
      bind(options: { namespace: string }): {
        getSnapshot(): {
          status: 'loading' | 'ready' | 'unavailable'
          value?: unknown
          user?: Record<string, unknown>
          writable: boolean
        }
        subscribe(cb: () => void): () => void
        set(field: string, value: unknown): Promise<unknown>
      }
      describe(): unknown
    }
    slots: {
      inject(slot: string, factory: () => void): void
      register(meta: unknown, factory: () => unknown): unknown
    }
    /** 派生子 fiber：deps 全部就绪后执行 callback（cordis registry.d.ts L111/L185） */
    inject(deps: readonly string[], callback: (ctx: Context) => void): PromiseLike<unknown> & { dispose(): Promise<void> }
  }
}
