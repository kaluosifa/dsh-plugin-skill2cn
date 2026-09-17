import { describe, expect, it } from 'vitest'
import {
  buildTranslateUserPrompt, cleanTranslation, translateWithCustomEndpoint, translateWithDshLlm,
  TRANSLATE_SYSTEM_PROMPT, type DshLlmStream, type StreamChunkLike,
} from '../src/core/translator.ts'

describe('内置 prompt（SPEC §3.1）', () => {
  it('包含全部固定规则', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('简体中文')
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('当……时使用')
    expect(TRANSLATE_SYSTEM_PROMPT).toMatch(/标识符|identifier/i)
    expect(buildTranslateUserPrompt('Use when X.')).toContain('Use when X.')
  })
})

function fakeLlm(chunks: StreamChunkLike[]): DshLlmStream {
  return { stream: async function* () { for (const c of chunks) yield c } }
}

describe('translateWithDshLlm', () => {
  // 真实 StreamChunk（<DSH>/packages/llm/llm/src/types.ts L366）：文本在 `text` 上，
  // 终止块是 `{ type:'finish', reason: FinishReason }`，而 FinishReason 是**对象**
  // （`{kind:'stop'}` / `{kind:'error', failure}`），不是字符串
  it('拼接 text-delta 并 trim', async () => {
    const text = await translateWithDshLlm(fakeLlm([
      { type: 'block-start', index: 0 }, { type: 'text-delta', index: 0, text: '当调试' }, { type: 'text-delta', index: 0, text: '棘手故障时使用。' }, { type: 'finish', reason: { kind: 'stop' } },
    ]), { provider: 'deepseek', model: 'deepseek-chat' }, 'Use when debugging tricky failures.')
    expect(text).toBe('当调试棘手故障时使用。')
  })

  it('忽略 reasoning-delta，只取正文', async () => {
    const text = await translateWithDshLlm(fakeLlm([
      { type: 'reasoning-delta', index: 0, text: '思考中' }, { type: 'text-delta', index: 0, text: '译文。' }, { type: 'finish', reason: { kind: 'stop' } },
    ]), { provider: 'p', model: 'm' }, 'x')
    expect(text).toBe('译文。')
  })

  it('finish kind=error 视为失败并带上底层原因', async () => {
    await expect(translateWithDshLlm(fakeLlm([
      { type: 'finish', reason: { kind: 'error', failure: { message: 'provider not registered' } } },
    ]), { provider: 'p', model: 'm' }, 'x')).rejects.toThrowError(/skill2cn\/llm-error — provider not registered/)
  })

  it('finish kind=aborted 视为失败', async () => {
    await expect(translateWithDshLlm(fakeLlm([{ type: 'finish', reason: { kind: 'aborted', failure: { message: 'aborted' } } }]), { provider: 'p', model: 'm' }, 'x'))
      .rejects.toThrowError(/skill2cn\/llm-error/)
  })

  it('空结果视为失败', async () => {
    await expect(translateWithDshLlm(fakeLlm([{ type: 'finish', reason: { kind: 'stop' } }]), { provider: 'p', model: 'm' }, 'x'))
      .rejects.toThrowError(/skill2cn\/empty-translation/)
  })
})

describe('translateWithCustomEndpoint — OpenAI 兼容', () => {
  it('POST chat/completions 并取 choices[0].message.content', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init: init! })
      return new Response(JSON.stringify({ choices: [{ message: { content: '当调试棘手故障时使用。' } }] }), { status: 200 })
    }
    const text = await translateWithCustomEndpoint(
      { baseURL: 'http://localhost:8317/v1', apiKey: 'k', model: 'qwen', protocol: 'openai' }, 'Use when debugging tricky failures.', fetcher)
    expect(text).toBe('当调试棘手故障时使用。')
    expect(calls[0]!.url).toBe('http://localhost:8317/v1/chat/completions')
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer k' })
    expect(JSON.parse(String(calls[0]!.init.body)).model).toBe('qwen')
  })

  it('HTTP 非 2xx 视为失败，并带上服务端给的原因', async () => {
    const fetcher = async () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 })
    await expect(translateWithCustomEndpoint({ baseURL: 'http://x/v1', apiKey: 'k', model: 'm', protocol: 'openai' }, 'x', fetcher))
      .rejects.toThrowError(/skill2cn\/llm-http — HTTP 401: invalid api key/)
  })
})

// 形状照 DSH 自己的手写实现（packages/web/web-search-deepseek/src/provider.ts:207-267）：
// base 含 /v1，追加 /messages；x-api-key + authorization 都带；max_tokens 必填；正文遍历 content 数组
describe('translateWithCustomEndpoint — Anthropic 兼容', () => {
  const ANTHROPIC_REPLY = (content: unknown) => new Response(JSON.stringify({ content }), { status: 200 })

  it('POST messages，带 x-api-key / authorization / anthropic-version 与必填 max_tokens', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init: init! })
      return ANTHROPIC_REPLY([{ type: 'text', text: '当调试棘手故障时使用。' }])
    }
    const text = await translateWithCustomEndpoint(
      { baseURL: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-x', model: 'claude-x', protocol: 'anthropic' },
      'Use when debugging tricky failures.', fetcher)
    expect(text).toBe('当调试棘手故障时使用。')
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(calls[0]!.init.headers).toMatchObject({
      'x-api-key': 'sk-ant-x',
      authorization: 'Bearer sk-ant-x',
      'anthropic-version': '2023-06-01',
    })
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.model).toBe('claude-x')
    expect(typeof body.max_tokens).toBe('number')
    expect(body.system).toContain('简体中文')
    expect(body.messages[0].content[0]).toMatchObject({ type: 'text' })
    expect(body.messages[0].content[0].text).toContain('Use when debugging tricky failures.')
  })

  it('base 末尾的斜杠不会造成双斜杠', async () => {
    const calls: string[] = []
    const fetcher = async (url: string | URL): Promise<Response> => {
      calls.push(String(url))
      return ANTHROPIC_REPLY([{ type: 'text', text: '译文。' }])
    }
    await translateWithCustomEndpoint({ baseURL: 'http://x/v1///', apiKey: 'k', model: 'm', protocol: 'anthropic' }, 'x', fetcher)
    expect(calls[0]).toBe('http://x/v1/messages')
  })

  it('拼接全部 text 块，忽略非 text 块', async () => {
    const fetcher = async () => ANTHROPIC_REPLY([
      { type: 'text', text: '当调试' },
      { type: 'tool_use', id: 't1', name: 'x' },
      { type: 'text', text: '棘手故障时使用。' },
    ])
    const text = await translateWithCustomEndpoint({ baseURL: 'http://x/v1', apiKey: 'k', model: 'm', protocol: 'anthropic' }, 'x', fetcher)
    expect(text).toBe('当调试棘手故障时使用。')
  })

  it('没有 text 块视为空译文', async () => {
    const fetcher = async () => ANTHROPIC_REPLY([{ type: 'tool_use', id: 't1', name: 'x' }])
    await expect(translateWithCustomEndpoint({ baseURL: 'http://x/v1', apiKey: 'k', model: 'm', protocol: 'anthropic' }, 'x', fetcher))
      .rejects.toThrowError(/skill2cn\/empty-translation/)
  })

  it('非 2xx：status 为准，detail 三种形状都要能取到', async () => {
    const route = { baseURL: 'http://x/v1', apiKey: 'k', model: 'm', protocol: 'anthropic' as const }
    const cases: Array<[Response, RegExp]> = [
      [new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 529 }), /HTTP 529: overloaded/],
      [new Response(JSON.stringify({ error: 'bad key' }), { status: 401 }), /HTTP 401: bad key/],
      [new Response('gateway timeout', { status: 504 }), /HTTP 504: gateway timeout/],
    ]
    for (const [response, expected] of cases) {
      await expect(translateWithCustomEndpoint(route, 'x', async () => response)).rejects.toThrowError(expected)
    }
  })

  it('非 2xx 且 body 为空/非 JSON 时优雅降级为只有状态码', async () => {
    const route = { baseURL: 'http://x/v1', apiKey: 'k', model: 'm', protocol: 'anthropic' as const }
    await expect(translateWithCustomEndpoint(route, 'x', async () => new Response('', { status: 500 })))
      .rejects.toThrowError(/skill2cn\/llm-http — HTTP 500$/)
    await expect(translateWithCustomEndpoint(route, 'x', async () => new Response('{oops', { status: 500 })))
      .rejects.toThrowError(/skill2cn\/llm-http — HTTP 500: \{oops/)
  })
})

describe('cleanTranslation（决策 D7）', () => {
  it('去 trim 与成对引号', () => {
    expect(cleanTranslation('  译文。  ')).toBe('译文。')
    expect(cleanTranslation('"译文。"')).toBe('译文。')
    expect(cleanTranslation('「译文。」')).toBe('「译文。」')
  })
})
