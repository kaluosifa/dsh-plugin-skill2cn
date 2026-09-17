import { describe, expect, it } from 'vitest'
import { locateFrontmatter, readDescription, rewriteDescription } from '../src/core/frontmatter.ts'

const SAMPLE = `---
name: pdf-tools
description: Use when debugging tricky failures. Supports /pdf and paths like src/a.ts.
license: MIT
---

# PDF Tools

Body stays byte-exact. 正文不动。
`

describe('locateFrontmatter', () => {
  it('finds a standard block', () => {
    const block = locateFrontmatter(SAMPLE)
    expect(block).toBeDefined()
    expect(block!.yamlText).toContain('name: pdf-tools')
  })

  it('returns undefined when the first line is not ---', () => {
    expect(locateFrontmatter('# no frontmatter\n')).toBeUndefined()
    expect(locateFrontmatter('x---\nname: a\n---\n')).toBeUndefined()
  })

  it('returns undefined when there is no closing fence', () => {
    expect(locateFrontmatter('---\nname: a\n')).toBeUndefined()
  })

  it('accepts CRLF fence lines', () => {
    expect(locateFrontmatter('---\r\nname: a\r\ndescription: hi\r\n---\r\nbody')).toBeDefined()
  })
})

describe('readDescription', () => {
  it('reads the description value', () => {
    expect(readDescription(SAMPLE)).toBe('Use when debugging tricky failures. Supports /pdf and paths like src/a.ts.')
  })

  it('returns undefined when description is missing or not a string', () => {
    expect(readDescription('---\nname: a\n---\nbody')).toBeUndefined()
    expect(readDescription('---\nname: a\ndescription: 42\n---\nbody')).toBeUndefined()
  })

  it('reads a multiline folded description', () => {
    const raw = '---\nname: a\ndescription: >-\n  Use when reading\n  big PDFs.\n---\nbody'
    expect(readDescription(raw)).toBe('Use when reading big PDFs.')
  })
})

describe('rewriteDescription', () => {
  it('replaces only the description value and keeps every other byte', () => {
    const next = rewriteDescription(SAMPLE, '当调试棘手故障时使用。')
    expect(next).toBeDefined()
    expect(readDescription(next!)).toBe('当调试棘手故障时使用。')
    // name 键不动
    expect(next!).toContain('name: pdf-tools')
    // 正文逐字节保留
    expect(next!.endsWith('\n# PDF Tools\n\nBody stays byte-exact. 正文不动。\n')).toBe(true)
  })

  it('round-trips back to the original', () => {
    const zh = rewriteDescription(SAMPLE, '当调试棘手故障时使用。')!
    expect(rewriteDescription(zh, readDescription(SAMPLE)!)).toBe(SAMPLE)
  })

  it('keeps the closing fence and does not duplicate it', () => {
    const next = rewriteDescription(SAMPLE, '译文')!
    expect(next!.split('\n').filter((line) => line === '---')).toHaveLength(2)
  })

  it('produces YAML-safe quoting for values containing colons', () => {
    const next = rewriteDescription(SAMPLE, '当输出包含「a: b」时使用。')!
    expect(readDescription(next)).toBe('当输出包含「a: b」时使用。')
  })

  it('returns undefined for files without a usable frontmatter/description', () => {
    expect(rewriteDescription('# plain\n', '译文')).toBeUndefined()
    expect(rewriteDescription('---\nname: a\n---\nbody', '译文')).toBeUndefined()
  })

  // 回归：真实夹具的描述常超 80 列，yaml 默认 lineWidth 会折行，
  // 使「还原」写回的不是原文（SPEC §3.3 要求写回英文原文）
  it('does not fold a description longer than the default line width', () => {
    const long = `${'Use when debugging tricky failures. '.repeat(3)}And more words to pass eighty columns.`
    const rawLong = `---\nname: a\ndescription: ${long}\n---\nbody\n`
    const zh = rewriteDescription(rawLong, '当调试棘手故障时使用。')!
    expect(readDescription(zh)).toBe('当调试棘手故障时使用。')
    // 原文与译文都必须留在单行 description 上
    expect(zh.split('\n').filter((line) => line.startsWith('description:'))).toHaveLength(1)
    expect(rewriteDescription(zh, long)).toBe(rawLong)
  })
})
