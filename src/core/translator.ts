import type { CustomProtocol, LlmRoute } from './route.ts'

/** SPEC §3.1：内置固定 prompt，v1 不开放自定义 */
export const TRANSLATE_SYSTEM_PROMPT = [
  '你是软件工程文档翻译器。把用户给出的英文 skill 描述（description）翻译成简体中文。',
  '规则：',
  '1. 标识符、/slash-command、文件路径、产品名（DeepSeek、DSH、API、SKILL.md 等）不译，保持原形。',
  '2. "Use when…" 等触发句式统一译为「当……时使用」。',
  '3. 保留原文 markdown 结构。',
  '4. 只输出译文本身，不要引号、解释或前后缀。',
].join('\n')

export function buildTranslateUserPrompt(description: string): string {
  return `把下面的 skill 描述翻译成简体中文：\n\n${description}`
}

/** 决策 D7 */
export function cleanTranslation(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).trim()
  return trimmed
}

/* ---- DSH LLM 通路（Host 内 ctx.llm.stream；结构化类型便于测试与解耦） ---- */

/**
 * 真实 `StreamChunk` 的最小子集（`<DSH>/packages/llm/llm/src/types.ts` L355-375）：
 * 正文在 `text-delta.text`（不是 `delta`），`reasoning-delta` 是思考过程，必须忽略。
 */
export interface StreamChunkLike {
  readonly type: string
  readonly index?: number
  readonly text?: string
  /** `finish` 块携带的 `FinishReason`：对象形状（`{kind, failure?}`），不是字符串 */
  readonly reason?: unknown
}

/** 终止原因：`stop` 之外都算失败，底层原因取 `failure.message` */
function finishFailure(reason: unknown): string | undefined {
  if (typeof reason !== 'object' || reason === null) {
    return reason === undefined || reason === 'stop' ? undefined : `stream finished with reason=${String(reason)}`
  }
  const { kind, failure } = reason as { kind?: string; failure?: { message?: string } }
  if (kind === undefined || kind === 'stop') return undefined
  return failure?.message ?? `stream finished with reason=${kind}`
}

export interface DshStreamOptions {
  readonly provider: string
  readonly model: string
  readonly system: string
  /** 真实通路要求 `Message[]`（由宿主用 `createUserMessage` 构造），故此处不预设形状 */
  readonly messages: readonly unknown[]
  readonly maxTokens: number
}

export interface DshLlmStream {
  stream(options: DshStreamOptions): AsyncIterable<StreamChunkLike>
}

export async function translateWithDshLlm(llm: DshLlmStream, route: LlmRoute, description: string): Promise<string> {
  let text = ''
  let failed: string | undefined
  for await (const chunk of llm.stream({
    provider: route.provider,
    model: route.model,
    system: TRANSLATE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildTranslateUserPrompt(description) }] }],
    maxTokens: 1024,
  })) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk.type === 'finish') failed = finishFailure(chunk.reason)
  }
  if (failed !== undefined) throw new Error(`skill2cn/llm-error — ${failed}`)
  const cleaned = cleanTranslation(text)
  if (cleaned.length === 0) throw new Error('skill2cn/empty-translation — 模型未产出文本')
  return cleaned
}

/* ---- 自定义端点通路（决策 D6：裸 fetch，非流式；协议可选 OpenAI 兼容 / Anthropic 兼容） ---- */

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

export interface CustomEndpointRoute {
  readonly baseURL: string
  readonly apiKey: string
  readonly model: string
  readonly protocol: CustomProtocol
}

/** Anthropic Messages API 的固定版本头（DSH 自己的手写实现用同一个值） */
const ANTHROPIC_VERSION = '2023-06-01'
/** Anthropic 的 `max_tokens` 是必填项；描述翻译远用不到这么多，与 DSH 通路保持一致 */
const CUSTOM_MAX_TOKENS = 1024

export async function translateWithCustomEndpoint(
  route: CustomEndpointRoute,
  description: string,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const base = route.baseURL.replace(/\/+$/, '')
  const response = route.protocol === 'anthropic'
    ? await fetcher(`${base}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          // 官方 Anthropic 认 x-api-key，不少中转只认 Authorization: Bearer —— 两个都带，
          // 任一种即可通过（DSH 自己的手写实现同样如此，见 web-search-deepseek/src/provider.ts）
          'x-api-key': route.apiKey,
          authorization: `Bearer ${route.apiKey}`,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: route.model,
          max_tokens: CUSTOM_MAX_TOKENS,
          system: TRANSLATE_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [{ type: 'text', text: buildTranslateUserPrompt(description) }],
          }],
        }),
      })
    : await fetcher(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${route.apiKey}` },
        body: JSON.stringify({
          model: route.model,
          stream: false,
          messages: [
            { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
            { role: 'user', content: buildTranslateUserPrompt(description) },
          ],
        }),
      })
  if (!response.ok) {
    throw new Error(`skill2cn/llm-http — HTTP ${response.status}${await errorDetail(response)}`)
  }
  const text = route.protocol === 'anthropic' ? await anthropicText(response) : await openAiText(response)
  const cleaned = cleanTranslation(text)
  if (cleaned.length === 0) throw new Error('skill2cn/empty-translation — 端点未产出文本')
  return cleaned
}

/**
 * 失败原因：状态码永远由调用方给出，这里**尽力**再取一份服务端 detail
 * （`{error:{message}}` / `{error:"…"}` / `{message:"…"}` / 纯文本），
 * 取不到就返回空串优雅降级——绝不让「读错误体」本身把失败盖掉。
 */
async function errorDetail(response: Response): Promise<string> {
  try {
    const raw = await response.text()
    if (raw.length === 0) return ''
    let detail = raw
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown }
      const fromError = typeof parsed.error === 'object' && parsed.error !== null
        ? (parsed.error as { message?: unknown }).message
        : parsed.error
      if (typeof fromError === 'string' && fromError.length > 0) detail = fromError
      else if (typeof parsed.message === 'string' && parsed.message.length > 0) detail = parsed.message
    } catch {
      // 非 JSON：原文即 detail
    }
    return `: ${detail.slice(0, 200)}`
  } catch {
    return ''
  }
}

/** Anthropic：正文可能分散在多个 text 块里，逐块取 text 再拼接（不假定 content[0]，DSH 同款做法） */
async function anthropicText(response: Response): Promise<string> {
  const data = (await response.json()) as { content?: { type?: unknown; text?: unknown }[] }
  return (data.content ?? [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
}

/** OpenAI 兼容：choices[0].message.content */
async function openAiText(response: Response): Promise<string> {
  const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('skill2cn/empty-translation — 端点响应缺少 choices[0].message.content')
  return content
}
