import { JsonFile, type JsonCodec } from './json-file.ts'

export type SkillGroup = 'workspace' | 'global' | 'package'

/** manifest 条目（SPEC §3.2：路径 + 英文原文 + 必要元信息；translated 属对账必需的元信息，见决策 D4） */
export interface ManifestEntry {
  readonly skillPath: string
  readonly name: string
  readonly group: SkillGroup
  readonly original: string
  readonly translated: string
  readonly translatedAt: string
  readonly route?: { readonly provider: string; readonly model: string }
}

interface ManifestFile {
  readonly version: 1
  readonly entries: Record<string, ManifestEntry>
}

const CODEC: JsonCodec<ManifestFile> = {
  fallback: () => ({ version: 1, entries: {} }),
  decode: (raw) => {
    const doc = raw as ManifestFile
    if (doc === null || typeof doc !== 'object' || doc.version !== 1
      || typeof doc.entries !== 'object' || doc.entries === null) {
      throw new Error('bad shape')
    }
    return doc
  },
  corrupt: (file) => new Error(`skill2cn: manifest/corrupt — ${file} 不是有效的备份清单`),
}

/** 备份清单存储。落盘细节（串行化原子写）见 {@link JsonFile}。 */
export class ManifestStore {
  private readonly file: JsonFile<ManifestFile>

  constructor(path: string) {
    this.file = new JsonFile(path, CODEC)
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  all(): ManifestEntry[] {
    return Object.values(this.file.current().entries)
  }

  get(skillPath: string): ManifestEntry | undefined {
    return this.file.current().entries[skillPath]
  }

  async set(entry: ManifestEntry): Promise<void> {
    const current = this.file.current()
    this.file.update({ ...current, entries: { ...current.entries, [entry.skillPath]: entry } })
    await this.file.save()
  }

  async delete(skillPath: string): Promise<void> {
    const current = this.file.current()
    if (!(skillPath in current.entries)) return
    const entries = { ...current.entries }
    delete entries[skillPath]
    this.file.update({ ...current, entries })
    await this.file.save()
  }
}
