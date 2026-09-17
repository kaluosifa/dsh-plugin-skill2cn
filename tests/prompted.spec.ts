import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PromptedStore } from '../src/core/prompted.ts'

describe('PromptedStore', () => {
  let dir: string
  let file: string
  let store: PromptedStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill2cn-prompted-'))
    file = join(dir, 'prompted.json')
    store = new PromptedStore(file)
    await store.load()
  })
  afterEach(async () => rm(dir, { recursive: true, force: true }))

  it('starts empty when the file does not exist', () => {
    expect(store.names()).toEqual([])
    expect(store.has('anything')).toBe(false)
  })

  it('remembers names and persists them', async () => {
    await store.remember(['a', 'b'])
    expect(store.has('a')).toBe(true)
    expect(store.has('c')).toBe(false)
    const raw = JSON.parse(await readFile(file, 'utf8'))
    expect(raw.version).toBe(1)
    expect(raw.seen.sort()).toEqual(['a', 'b'])
  })

  it('survives a reload (round-trip)', async () => {
    await store.remember(['a'])
    const again = new PromptedStore(file)
    await again.load()
    expect(again.names()).toEqual(['a'])
  })

  it('de-duplicates and appends across calls', async () => {
    await store.remember(['a', 'b'])
    await store.remember(['b', 'c'])
    expect(store.names().sort()).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op for an empty list', async () => {
    await store.remember([])
    await expect(readFile(file, 'utf8')).rejects.toThrowError(/ENOENT/)
  })

  // 批量翻译成功后会逐条 remember，必须扛得住并发
  it('survives concurrent remembers', async () => {
    await Promise.all(Array.from({ length: 24 }, (_, i) => store.remember([`s${i}`])))
    const again = new PromptedStore(file)
    await again.load()
    expect(again.names()).toHaveLength(24)
  })

  it('rejects a corrupt file with a prompted/corrupt error', async () => {
    await writeFile(file, '{not json', 'utf8')
    const broken = new PromptedStore(file)
    await expect(broken.load()).rejects.toThrowError(/prompted\/corrupt/)
  })
})
