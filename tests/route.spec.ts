import { describe, expect, it } from 'vitest'
import { RouteResolver, type RouteSettings } from '../src/core/route.ts'

const base: RouteSettings = {
  routeMode: 'follow', provider: '', model: '',
  customBaseURL: '', customApiKey: '', customModel: '', customProtocol: 'openai',
}

describe('RouteResolver', () => {
  it('follow 模式使用最近捕获的会话路由', () => {
    const r = new RouteResolver()
    r.observeSessionRoute({ provider: 'deepseek', model: 'deepseek-chat' })
    expect(r.resolve(base)).toEqual({ kind: 'dsh', provider: 'deepseek', model: 'deepseek-chat' })
  })

  it('follow 模式无记录时抛 skill2cn/no-route', () => {
    const r = new RouteResolver()
    expect(() => r.resolve(base)).toThrowError(/skill2cn\/no-route/)
  })

  it('preset 模式要求 provider+model 成对', () => {
    const r = new RouteResolver()
    expect(r.resolve({ ...base, routeMode: 'preset', provider: 'deepseek', model: 'deepseek-reasoner' }))
      .toEqual({ kind: 'dsh', provider: 'deepseek', model: 'deepseek-reasoner' })
    expect(() => r.resolve({ ...base, routeMode: 'preset', provider: 'deepseek' })).toThrowError(/skill2cn\/route-incomplete/)
  })

  it('custom 模式要求三项齐全', () => {
    const r = new RouteResolver()
    expect(r.resolve({ ...base, routeMode: 'custom', customBaseURL: 'http://localhost:8317/v1', customApiKey: 'k', customModel: 'qwen' }))
      .toEqual({ kind: 'custom', baseURL: 'http://localhost:8317/v1', apiKey: 'k', model: 'qwen', protocol: 'openai' })
    expect(() => r.resolve({ ...base, routeMode: 'custom', customBaseURL: 'http://x/v1', customModel: 'm' })).toThrowError(/skill2cn\/route-incomplete/)
  })

  // 用户要求自定义端点不再局限于 OpenAI 兼容
  it('custom 模式带出所选协议', () => {
    const r = new RouteResolver()
    const custom = { ...base, routeMode: 'custom', customBaseURL: 'https://api.anthropic.com/v1', customApiKey: 'k', customModel: 'claude-x' }
    expect(r.resolve({ ...custom, customProtocol: 'anthropic' }))
      .toEqual({ kind: 'custom', baseURL: 'https://api.anthropic.com/v1', apiKey: 'k', model: 'claude-x', protocol: 'anthropic' })
    expect(r.resolve({ ...custom, customProtocol: 'openai' })).toMatchObject({ protocol: 'openai' })
  })

  it('未知/缺失的协议一律归 openai（防御旧配置）', () => {
    const r = new RouteResolver()
    const custom = { ...base, routeMode: 'custom', customBaseURL: 'http://x/v1', customApiKey: 'k', customModel: 'm' }
    expect(r.resolve({ ...custom, customProtocol: '' })).toMatchObject({ protocol: 'openai' })
    expect(r.resolve({ ...custom, customProtocol: 'gemini' })).toMatchObject({ protocol: 'openai' })
  })
})
