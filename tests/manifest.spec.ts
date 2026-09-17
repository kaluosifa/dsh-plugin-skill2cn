import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ManifestStore, type ManifestEntry } from '../src/core/manifest.ts'

const ENTRY: ManifestEntry = {
  skillPath: '/repo/.dsh/skills/pdf/SKILL.md',
  name: 'pdf-tools',
  group: 'workspace',
  original: 'Use when debugging tricky failures.',
  translated: '当调试棘手故障时使用。',
  translatedAt: '2026-09-17T02:00:00.000Z',
  route: { provider: 'deepseek', model: 'deepseek-chat' },
}

describe('ManifestStore', () => {
  let dir: string
  let store: ManifestStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skill2cn-'))
    store = new ManifestStore(join(dir, 'manifest.json'))
    await store.load()
  })
  afterEach(async () => rm(dir, { recursive: true, force: true }))

  it('starts empty when the file does not exist', () => {
    expect(store.all()).toEqual([])
  })

  it('sets and gets an entry, persisting to disk', async () => {
    await store.set(ENTRY)
    expect(store.get(ENTRY.skillPath)).toEqual(ENTRY)
    const raw = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
    expect(raw.version).toBe(1)
    expect(raw.entries[ENTRY.skillPath].original).toBe(ENTRY.original)
  })

  it('survives a reload (round-trip)', async () => {
    await store.set(ENTRY)
    const again = new ManifestStore(join(dir, 'manifest.json'))
    await again.load()
    expect(again.get(ENTRY.skillPath)).toEqual(ENTRY)
  })

  it('deletes an entry and persists the deletion', async () => {
    await store.set(ENTRY)
    await store.delete(ENTRY.skillPath)
    expect(store.get(ENTRY.skillPath)).toBeUndefined()
    const again = new ManifestStore(join(dir, 'manifest.json'))
    await again.load()
    expect(again.all()).toEqual([])
  })

  it('delete of an unknown path is a no-op', async () => {
    await store.delete('/nope')
    expect(store.all()).toEqual([])
  })

  it('creates the data directory on first save', async () => {
    const nested = new ManifestStore(join(dir, 'a/b/manifest.json'))
    await nested.load()
    await nested.set(ENTRY)
    expect(JSON.parse(await readFile(join(dir, 'a/b/manifest.json'), 'utf8')).version).toBe(1)
  })

  it('rejects a corrupt file with a manifest/corrupt error', async () => {
    await store.set(ENTRY)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, 'manifest.json'), '{not json', 'utf8')
    const broken = new ManifestStore(join(dir, 'manifest.json'))
    await expect(broken.load()).rejects.toThrowError(/manifest\/corrupt/)
  })

  // 回归：批量翻译并发上限 3，三条 lane 会同时 set()；固定 tmp 名的 rename 互相踩踏
  // 会让其中一次 save 抛错（批量把成功计成失败），也可能丢记录
  it('survives concurrent writes from parallel lanes', async () => {
    const entries: ManifestEntry[] = Array.from({ length: 24 }, (_, i) => ({
      ...ENTRY,
      skillPath: `/repo/.dsh/skills/s${i}/SKILL.md`,
      name: `s${i}`,
    }))
    await Promise.all(entries.map((entry) => store.set(entry)))
    const again = new ManifestStore(join(dir, 'manifest.json'))
    await again.load()
    expect(again.all()).toHaveLength(24)
    expect(again.all().map((e) => e.name).sort()).toEqual(entries.map((e) => e.name).sort())
  })
})
