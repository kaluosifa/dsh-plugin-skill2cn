export interface LlmRoute {
  readonly provider: string
  readonly model: string
}

/**
 * 自定义端点的兼容协议。
 * `openai` = OpenAI 兼容（`{base}/chat/completions`）；`anthropic` = Anthropic 兼容（`{base}/messages`）。
 * DSH 里对应的适配器协议名是 `openai-completions` / `anthropic-messages`。
 */
export type CustomProtocol = 'openai' | 'anthropic'

/** 设置命名空间 skill2cn 的存储形状（host apply 注册的 schema 与此一一对应） */
export interface RouteSettings {
  readonly routeMode: string // 'follow' | 'preset' | 'custom'
  readonly provider: string
  readonly model: string
  readonly customBaseURL: string
  readonly customApiKey: string
  readonly customModel: string
  /** 'openai' | 'anthropic'；未知值一律按 openai 处理（防御旧配置） */
  readonly customProtocol: string
}

export type ResolvedRoute =
  | { readonly kind: 'dsh'; readonly provider: string; readonly model: string }
  | {
    readonly kind: 'custom'
    readonly baseURL: string
    readonly apiKey: string
    readonly model: string
    readonly protocol: CustomProtocol
  }

/** 决策/调研修正 5：「跟随当前会话路由」= 根层订阅 session/event 的 request/header 缓存最近路由 */
export class RouteResolver {
  private lastSessionRoute: LlmRoute | undefined

  observeSessionRoute(route: LlmRoute): void {
    this.lastSessionRoute = route
  }

  resolve(settings: RouteSettings): ResolvedRoute {
    if (settings.routeMode === 'preset') {
      if (!settings.provider || !settings.model) {
        throw new Error('skill2cn/route-incomplete — 已配置路由需要 provider 与 model 成对填写')
      }
      return { kind: 'dsh', provider: settings.provider, model: settings.model }
    }
    if (settings.routeMode === 'custom') {
      if (!settings.customBaseURL || !settings.customApiKey || !settings.customModel) {
        throw new Error('skill2cn/route-incomplete — 自定义端点需要 base URL、API key、model 三项齐全')
      }
      return {
        kind: 'custom',
        baseURL: settings.customBaseURL,
        apiKey: settings.customApiKey,
        model: settings.customModel,
        protocol: settings.customProtocol === 'anthropic' ? 'anthropic' : 'openai',
      }
    }
    if (this.lastSessionRoute === undefined) {
      throw new Error('skill2cn/no-route — 尚未捕获到会话路由；请先在任一会话发一条消息，或在「模型设置」改选显式路由')
    }
    return { kind: 'dsh', ...this.lastSessionRoute }
  }
}
