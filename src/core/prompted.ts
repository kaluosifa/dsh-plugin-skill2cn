import { JsonFile, type JsonCodec } from './json-file.ts'

interface PromptedFile {
  readonly version: 1
  readonly seen: string[]
}

const CODEC: JsonCodec<PromptedFile> = {
  fallback: () => ({ version: 1, seen: [] }),
  decode: (raw) => {
    const doc = raw as PromptedFile
    if (doc === null || typeof doc !== 'object' || doc.version !== 1 || !Array.isArray(doc.seen)) {
      throw new Error('bad shape')
    }
    return { version: 1, seen: doc.seen.filter((name): name is string => typeof name === 'string') }
  },
  corrupt: (file) => new Error(`skill2cn: prompted/corrupt — ${file} 不是有效的提示记录`),
}

/**
 * 「已经问过用户」的 skill 名集合。
 *
 * 按 frontmatter `name` 记（skill 的身份是 name，不是路径），只增不减：用户对某个 skill
 * 做过决定（点「翻译」/「忽略」/「还原」）之后就不再打扰他。
 *
 * 为什么与备份清单分开存：manifest 是「已翻译 / 未翻译」的唯一事实源（SPEC §3.2），
 * 这里纯粹是提示节流状态，混在一起会让两件事互相污染。
 */
export class PromptedStore {
  private readonly file: JsonFile<PromptedFile>

  constructor(path: string) {
    this.file = new JsonFile(path, CODEC)
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  has(name: string): boolean {
    return this.file.current().seen.includes(name)
  }

  names(): string[] {
    return [...this.file.current().seen]
  }

  async remember(names: readonly string[]): Promise<void> {
    const fresh = names.filter((name) => name.length > 0 && !this.has(name))
    if (fresh.length === 0) return
    const current = this.file.current()
    this.file.update({ version: 1, seen: [...current.seen, ...fresh] })
    await this.file.save()
  }
}
