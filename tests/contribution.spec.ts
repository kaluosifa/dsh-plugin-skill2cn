import { describe, expect, it } from 'vitest'
import { skill2cnRemote } from '../src/client/contribution.ts'

/**
 * 破坏点 ① 回归防线：DSH ≥ 0.1.6-alpha.2 起 strict codec 是
 * `{ mode, typeSymbol, create: () => schema }` —— registry validateInvocation /
 * 客户端 requireStrictCodec / 宿主网关 decode 都要求 `typeof create === 'function'`，
 * 旧的 `{ schema }` 形状会在挂载或解码期直接抛错。
 */
interface StrictCodecLike {
  mode: string
  typeSymbol?: string
  create?: () => { parse(value: unknown): unknown }
}

function allCodecs(): StrictCodecLike[] {
  const codecs: StrictCodecLike[] = []
  for (const descriptor of skill2cnRemote.descriptors) {
    codecs.push(descriptor.result as unknown as StrictCodecLike)
    for (const parameter of descriptor.parameters) {
      codecs.push((parameter as { codec: unknown }).codec as StrictCodecLike)
    }
  }
  return codecs
}

describe('skill2cn remote contribution', () => {
  it('exposes all 10 method descriptors', () => {
    expect(skill2cnRemote.descriptors).toHaveLength(10)
  })

  it('every strict codec exposes a create() factory (DSH ≥ 0.1.6-alpha.2)', () => {
    const codecs = allCodecs()
    expect(codecs.length).toBeGreaterThan(0)
    for (const codec of codecs) {
      expect(codec.mode).toBe('strict')
      expect(typeof codec.typeSymbol).toBe('string')
      expect(typeof codec.create).toBe('function')
      expect(typeof codec.create!().parse).toBe('function')
    }
  })
})
