import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonFile, type JsonCodec } from '../src/core/json-file.ts'

interface Doc {
  readonly version: 1
  readonly items: string[]
}

const CODEC: JsonCodec<Doc> = {
  fallback: () => ({ version: 1, items: [] }),
  decode: (raw) => {
    const doc = raw as Doc
    if (doc === null || typeof doc !== 'object' || doc.version !== 1 || !Array.isArray(doc.items)) {
      throw new Error('bad shape')
    }
    return doc
  },
  corrupt: (file) => new Error(`demo/corrupt — ${file} 不是有效文件`),
}

describe('JsonFile', () => {
  let dir: string
  let path: string
  let file: JsonFile<Doc>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill2cn-json-'))
    path = join(dir, 'doc.json')
    file = new JsonFile(path, CODEC)
  })
  afterEach(async () => rm(dir, { recursive: true, force: true }))

  it('starts from the fallback when the file does not exist', async () => {
    await file.load()
    expect(file.current()).toEqual({ version: 1, items: [] })
  })

  it('loads a valid file', async () => {
    await writeFile(path, JSON.stringify({ version: 1, items: ['a'] }), 'utf8')
    await file.load()
    expect(file.current().items).toEqual(['a'])
  })

  it('creates the parent directory on first save', async () => {
    const nested = new JsonFile<Doc>(join(dir, 'a/b/doc.json'), CODEC)
    await nested.load()
    nested.update({ version: 1, items: ['x'] })
    await nested.save()
    expect(JSON.parse(await readFile(join(dir, 'a/b/doc.json'), 'utf8')).items).toEqual(['x'])
  })

  it('rejects unparseable content with the codec corrupt error', async () => {
    await writeFile(path, '{not json', 'utf8')
    await expect(file.load()).rejects.toThrowError(/demo\/corrupt/)
  })

  it('rejects a well-formed but wrong-shaped document', async () => {
    await writeFile(path, JSON.stringify({ version: 2, items: [] }), 'utf8')
    await expect(file.load()).rejects.toThrowError(/demo\/corrupt/)
  })

  it('round-trips through save and load', async () => {
    await file.load()
    file.update({ version: 1, items: ['a', 'b'] })
    await file.save()
    const again = new JsonFile(path, CODEC)
    await again.load()
    expect(again.current().items).toEqual(['a', 'b'])
  })

  // 回归：批量翻译 3 条 lane 会并发写；固定 tmp 名的 rename 互相踩踏（ENOENT）会丢数据
  it('survives concurrent saves', async () => {
    await file.load()
    await Promise.all(Array.from({ length: 24 }, (_, i) => {
      file.update({ version: 1, items: [`i${i}`] })
      return file.save()
    }))
    const again = new JsonFile(path, CODEC)
    await again.load()
    expect(again.current().version).toBe(1)
    expect(again.current().items).toHaveLength(1)
    expect(await readFile(path, 'utf8')).toContain('"version": 1')
  })
})
