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
    /** 0.1.7 起的设置表单服务（`@deepseek-ai/dsh-client-ui-settings/client` 的 ConfigForms，已组合进 web-app bundle） */
    configForms: {
      get<T>(entryId: string): {
        getSnapshot(): {
          status: 'loading' | 'ready' | 'unavailable'
          value?: T
          base?: Record<string, unknown>
          user?: Record<string, unknown>
          revision?: number
          writable: boolean
          mode: 'host' | 'memory'
        }
        subscribe(cb: () => void): () => void
        set(field: string, value: unknown): Promise<boolean>
        unset(field: string): Promise<boolean>
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
