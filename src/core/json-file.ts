import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 一个 JSON 文档的形状契约：fallback 给初值，decode 负责校验，corrupt 给用户可读的错误 */
export interface JsonCodec<T> {
  /** 文件尚不存在时的初始值 */
  fallback(): T
  /** 校验并收窄解析结果；形状不对请抛错 */
  decode(raw: unknown): T
  /** 损坏时的错误（自带错误码，便于上层与用户区分） */
  corrupt(file: string): Error
}

/**
 * 原子 JSON 文档：读盘 + **串行化写**。
 *
 * 写盘必须串行：批量翻译并发 3 条 lane 会同时落盘，固定 tmp 名的 rename 会互相踩踏
 * （先 rename 的一方把文件搬走，后一方 ENOENT），既会把成功计成失败，也可能丢数据。
 * 串行化后每次写都落到最新内存值上（顺带合并中间态），tmp 名再加 pid + 序号避免撞名。
 */
export class JsonFile<T> {
  private data: T
  private writing: Promise<void> = Promise.resolve()
  private seq = 0

  constructor(private readonly file: string, private readonly codec: JsonCodec<T>) {
    this.data = codec.fallback()
  }

  async load(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    try {
      this.data = this.codec.decode(JSON.parse(text))
    } catch {
      throw this.codec.corrupt(this.file)
    }
  }

  current(): T {
    return this.data
  }

  /** 只改内存；落盘由 {@link save} 负责 */
  update(next: T): void {
    this.data = next
  }

  save(): Promise<void> {
    const next = this.writing.then(
      () => this.writeNow(),
      () => this.writeNow(),
    )
    this.writing = next.then(() => undefined, () => undefined)
    return next
  }

  private async writeNow(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.${this.seq++}.tmp`
    await writeFile(tmp, JSON.stringify(this.data, null, 2) + '\n', 'utf8')
    await rename(tmp, this.file)
  }
}
