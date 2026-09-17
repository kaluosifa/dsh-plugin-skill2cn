import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteErrorCode } from '@deepseek-ai/dsh-typert-protocol'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import '@deepseek-ai/dsh-skill'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { readDescription, rewriteDescription } from './core/frontmatter.ts'
import { isChineseDescription } from './core/language.ts'
import { ManifestStore, type ManifestEntry } from './core/manifest.ts'
import { pendingNewcomers } from './core/pending.ts'
import { PromptedStore } from './core/prompted.ts'
import { reconcileEntry } from './core/reconcile.ts'
import { RouteResolver, type RouteSettings } from './core/route.ts'
import { classifyPath, findProjectRoot, readSummaries, scanSkills, type ScanRoots, type SkillsRegistryLike } from './core/scanner.ts'
import { runPool } from './core/tasks.ts'
import { translateWithCustomEndpoint, translateWithDshLlm, type DshLlmStream } from './core/translator.ts'
import type { BatchSummary, PendingSkillView, ProgressView, SkillEntryView, TestRouteResult } from './shared/wire.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'skill2cn/busy': {}
    'skill2cn/not-translated': {}
    'skill2cn/no-description': {}
    'skill2cn/no-need': {}
    'skill2cn/rewrite-refused': {}
    'skill2cn/no-route': {}
    'skill2cn/route-incomplete': {}
    'skill2cn/llm-error': {}
    'skill2cn/llm-http': {}
    'skill2cn/empty-translation': {}
    'skill2cn/internal': {}
  }
}

export interface Skill2CnConfig {
  readonly dataDir: string
}

const SETTINGS_NS = 'skill2cn'

export class Skill2CnService extends TypertRemoteService {
  static inject = ['skills', 'llm', 'settings', 'sessions', 'agentPresets']

  private readonly store: ManifestStore
  /** 「已经问过用户」的 skill 名（提示节流，与翻译状态无关） */
  private readonly prompted: PromptedStore
  private readonly resolver = new RouteResolver()
  private readonly busy = new Set<string>()
  /** 卡片的错误态（SPEC §2.4/§3.5：失败卡片标错误 + 「重试」）；仅内存态，不持久化 */
  private readonly failures = new Map<string, string>()
  private batch: ProgressView = { running: false, total: 0, completed: 0, succeeded: 0, failed: 0, busyPaths: [] }
  /** 目录可能变了（`skills/change` 或我们自己的写盘），下次 pending() 需重算 */
  private catalogDirty = true
  /** 上次算出的待提示列表；命中缓存时轮询零成本 */
  private pendingCache: PendingSkillView[] | undefined
  private readonly dshHome: string
  private readonly agentsHome: string
  /**
   * 最近一次会话的工作目录。工作区组必须以**会话 workspace** 为项目根，不能用
   * `process.cwd()`：从 DSH 检出目录启动时 cwd 就是检出本身，面板会把 DSH 自己的
   * 项目 skill 当成翻译目标（实测踩过一次：11 个检出自带 skill 被「全部翻译」改写）。
   * 这也顺手消掉了计划 R6 的限制。
   */
  private sessionCwd: string | undefined

  constructor(ctx: Context, config: Skill2CnConfig) {
    super(ctx, 'skill2cn')
    this.store = new ManifestStore(join(config.dataDir, 'manifest.json'))
    this.prompted = new PromptedStore(join(config.dataDir, 'prompted.json'))
    this.dshHome = resolveDshHome()
    this.agentsHome = resolveAgentsHome()
    ctx.effect(() => {
      void this.store.load()
      void this.prompted.load()
      return () => {}
    }, 'skill2cn: load manifest')

    // 调研修正 5：根层订阅收全部会话事件；request/header 携带主请求路由，header.cwd 是会话 workspace
    ctx.on('session/event', (session, event) => {
      const cwd = (session as unknown as { header?: { cwd?: unknown } }).header?.cwd
      if (typeof cwd === 'string' && cwd.length > 0) this.sessionCwd = cwd
      if (event.type === 'request/header') {
        const header = event.data.header
        this.resolver.observeSessionRoute({ provider: header.config.provider, model: header.config.model })
      }
    })

    // 目录失效通知（无载荷、不过滤，根层订阅可收）：只是「可能变了」的提示，
    // 真正的判定在 pending() 里用 snapshot() 重算（保留 complete:false 时的上次结果）
    ctx.on('skills/change', () => { this.catalogDirty = true })
  }

  /**
   * 当前生效的工作目录；**没有活跃会话时返回 undefined**（而不是退回进程 cwd）。
   *
   * 为什么不能退回 `process.cwd()`：从 DSH 检出目录启动时，cwd 就是检出本身，
   * 工作区轴会把 DSH 自带的项目 skill 当成用户的项目——实测被「全部翻译」改写过一次。
   * 不传 cwd 时 registry 的项目轴干脆不存在（provider 要求 `cwd !== undefined` 才扫项目根），
   * 工作区组为空，宁缺毋滥。
   */
  private activeCwd(): string | undefined {
    if (this.sessionCwd === undefined) this.seedSessionCwd()
    return this.sessionCwd
  }

  /**
   * 兜底：重启后还没收到 session/event 时，从最近一个有 header 的会话里取工作目录，
   * 免得「先开面板」时工作区组为空（没有活跃会话时本就应该为空，见 {@link activeCwd}）。
   */
  private seedSessionCwd(): void {
    try {
      const sessions = (this.ctx as unknown as { sessions?: { list(): readonly unknown[] } }).sessions?.list() ?? []
      for (let i = sessions.length - 1; i >= 0; i -= 1) {
        const cwd = (sessions[i] as { header?: { cwd?: unknown } })?.header?.cwd
        if (typeof cwd === 'string' && cwd.length > 0) {
          this.sessionCwd = cwd
          return
        }
      }
    } catch {
      // 会话服务不可用（或返回形状变化）时保持「无工作区」
    }
  }

  /** 每次读取都按当前工作目录重算项目根（会话可切换工作区） */
  private get roots(): ScanRoots {
    const cwd = this.activeCwd()
    return {
      projectRoot: cwd === undefined ? '' : findProjectRoot(cwd),
      dshHome: this.dshHome,
      agentsHome: this.agentsHome,
    }
  }

  /* ---------- 面板数据 ---------- */

  /**
   * 诊断修正 D12：web 应用的 bundle 禁用了宿主机 `skill-filesystem` 行，本地发现
   * （项目根 + 用户根）由 agent preset 的 standing mount 拥有，因此宿主侧读取必须带
   * preset 的 standing scope key，否则只读到全局层（看不到 `~/.dsh/skills` 与项目 skill）。
   * 契约见 `@deepseek-ai/dsh-agent-presets` 的 `standingKeyFor`（专为「无 agent 的宿主读取」而设）。
   * 该服务缺失或组合不可用时不带 scope 继续（退化为全局层 + 插件包，不阻断面板）。
   */
  private async standingScope(): Promise<unknown> {
    const presets = (this.ctx as unknown as {
      agentPresets?: { standingKeyFor(id?: string): Promise<unknown> }
    }).agentPresets
    if (presets === undefined) return undefined
    try {
      return await presets.standingKeyFor()
    } catch {
      return undefined
    }
  }

  /** 列出全部卡片；每次调用先做升级对账（SPEC §3.4：面板打开时自动校验） */
  @Remote
  async list(): Promise<SkillEntryView[]> {
    const cwd = this.activeCwd()
    const scope = await this.standingScope()
    const skills = await scanSkills(this.ctx.skills as unknown as SkillsRegistryLike, cwd, this.roots, scope)
    const views: SkillEntryView[] = []
    const seen = new Set<string>()
    for (const skill of skills) {
      seen.add(skill.path)
      // 对账必须比对**磁盘**（SPEC §3.4「manifest 与磁盘文件一致性」）：registry 的描述
      // 落后于 chokidar 失效，若拿它当判据，刚写盘的中文会被读成「文件已回退英文」而
      // 误触发 clear-record 静默删记录。磁盘读不到时退回 registry 值。
      const disk = await this.diskDescription(skill.path)
      views.push(await this.viewOf(skill.path, skill.name, skill.group, disk ?? skill.description))
    }
    // manifest 里有、磁盘枚举里消失的（skill 已卸载/文件缺失）→ stale/missing，仍可移除记录
    for (const record of this.store.all()) {
      if (seen.has(record.skillPath)) continue
      views.push({
        path: record.skillPath, name: record.name, description: record.translated,
        group: record.group, state: 'stale', staleReason: 'missing', original: record.original,
      })
    }
    return views
  }

  /** 磁盘上的 description（对账真源）；文件缺失或不可解析 → undefined */
  private async diskDescription(path: string): Promise<string | undefined> {
    try {
      return readDescription(await readFile(path, 'utf8'))
    } catch {
      return undefined
    }
  }

  private async viewOf(path: string, name: string, group: SkillEntryView['group'], description: string): Promise<SkillEntryView> {
    const record = this.store.get(path)
    const result = reconcileEntry({ current: description, record })
    if (result.kind === 'clear-record') await this.store.delete(path) // 静默清除，归入「未翻译」
    if (this.busy.has(path)) {
      return { path, name, description, group, state: 'translating', ...(record ? { original: record.original } : {}) }
    }
    switch (result.kind) {
      case 'clear-record':
      case 'untranslated': {
        const failure = this.failures.get(path)
        if (failure !== undefined) return { path, name, description, group, state: 'failed', error: failure }
        return { path, name, description, group, state: isChineseDescription(description) ? 'no-need' : 'untranslated' }
      }
      case 'no-need':
        this.failures.delete(path)
        return { path, name, description, group, state: 'no-need' }
      case 'translated':
        this.failures.delete(path)
        return { path, name, description, group, state: 'translated', original: result.record.original }
      case 'stale': {
        const failure = this.failures.get(path)
        if (failure !== undefined) {
          return {
            path, name, description, group, state: 'failed', error: failure,
            staleReason: result.reason, original: result.record.original,
          }
        }
        return {
          path, name, description, group, state: 'stale',
          staleReason: result.reason, original: result.record.original,
        }
      }
    }
  }

  /* ---------- 翻译 / 还原 ---------- */

  @Remote
  async translate(path: string): Promise<SkillEntryView> {
    return this.translateOne(path)
  }

  @Remote
  async restore(path: string): Promise<{ ok: true }> {
    await this.restoreOne(path)
    return { ok: true }
  }

  /** 批量翻译（SPEC §3.5：并发上限 3、失败跳过、结束汇总）；Remote 调用阻塞至结束，进度经 status() 轮询 */
  @Remote
  async translateAll(): Promise<BatchSummary> {
    const all = await this.list()
    const targets = all.filter((v) => v.state === 'untranslated')
    const skipped = all.filter((v) => v.state === 'no-need').length
    const result = await runPool(targets, 3, async (target) => { await this.translateOne(target.path) }, (p) => {
      this.batch = { ...p, busyPaths: [...this.busy] }
    })
    return { succeeded: result.succeeded, failed: result.failed, skipped }
  }

  @Remote
  async restoreAll(): Promise<BatchSummary> {
    const all = await this.list()
    // 只还原有备份记录的卡片：failed 无记录时还原会报 not-translated
    const targets = all.filter((v) => v.state === 'translated' || v.state === 'stale')
    const result = await runPool(targets, 3, async (target) => { await this.restoreOne(target.path) }, (p) => {
      this.batch = { ...p, busyPaths: [...this.busy] }
    })
    return { succeeded: result.succeeded, failed: result.failed, skipped: 0 }
  }

  @Remote
  async status(): Promise<ProgressView> {
    return { ...this.batch, busyPaths: [...this.busy] }
  }

  /* ---------- 新 skill 提示（浮层卡片） ---------- */

  /**
   * 还没被问过、也没有译文的 skill；客户端每 5 秒轮询。
   *
   * 目录没变时直接回内存缓存（**零读盘**）；变了才用 registry 的 `snapshot()` 重算
   * （摘要在 registry 侧有 collect 缓存）。`complete: false` 表示发现过程被打断，
   * 本轮保留上次结果并让 dirty 保持为真，下一轮重试。
   */
  @Remote
  async pending(): Promise<PendingSkillView[]> {
    if (this.catalogDirty || this.pendingCache === undefined) await this.recomputePending()
    return this.pendingCache ?? []
  }

  /** 「忽略」：记入已见集合并持久化，之后不再提示（面板里那条仍在「未翻译」） */
  @Remote
  async dismissNewcomers(names: string[]): Promise<{ ok: true }> {
    await this.prompted.remember(names)
    this.catalogDirty = true
    return { ok: true }
  }

  /** 浮层卡片上的「翻译」：只翻这一批（复用批量池与进度），不动面板的其余条目 */
  @Remote
  async translateMany(paths: string[]): Promise<BatchSummary> {
    const targets = paths.map((path) => ({ path }))
    const result = await runPool(targets, 3, async (target) => { await this.translateOne(target.path) }, (p) => {
      this.batch = { ...p, busyPaths: [...this.busy] }
    })
    this.catalogDirty = true
    return { succeeded: result.succeeded, failed: result.failed, skipped: 0 }
  }

  private async recomputePending(): Promise<void> {
    const cwd = this.activeCwd()
    const scope = await this.standingScope()
    const registry = this.ctx.skills as unknown as SkillsRegistryLike
    const { skills, complete } = await readSummaries(registry, cwd, this.roots, scope)
    if (!complete) return // 目录可能不全：保留上次结果，dirty 不清，下轮重试

    const translated = new Set(this.store.all().map((entry) => entry.name))
    const seen = new Set(this.prompted.names())
    const newcomers = pendingNewcomers({ summaries: skills, seen, translated })

    const views: PendingSkillView[] = []
    for (const skill of newcomers) {
      const definition = await registry.get(skill.name, {
        ...cwd === undefined ? {} : { cwd },
        ...scope === undefined ? {} : { scope },
      })
      const path = definition?.path
      if (typeof path !== 'string' || path.length === 0) continue
      // 摘要没有路径，`group` 只是按 source 的临时归类；拿到路径后用路径重新归类
      views.push({ name: skill.name, path, description: skill.description, group: classifyPath(path, this.roots, skill.source) })
    }
    this.pendingCache = views
    this.catalogDirty = false
  }

  /* ---------- 模型设置 ---------- */

  /** 用当前选定路由做一次真实小翻译（SPEC §2.3：译文 + 耗时 + 实际模型名） */
  @Remote
  async testRoute(): Promise<TestRouteResult> {
    // SPEC §2.3 的句子是举例（原文写作「如 "Use when debugging tricky failures."」）。
    // 换成插件自述句：测试结果本身就说明「这套配置能翻好我要翻的东西」；
    // 句中的 `skill` 标识符顺带验证内置 prompt 的「标识符不译」规则。
    const sample = 'Use when translating skill descriptions into Simplified Chinese.'
    const route = this.resolveRoute()
    const started = Date.now()
    const translation = await this.translateText(route, sample)
    return {
      translation,
      durationMs: Date.now() - started,
      provider: route.kind === 'dsh' ? route.provider : 'custom',
      model: route.model,
    }
  }

  /* ---------- 内部 ---------- */

  private readSettings(): RouteSettings {
    const value = this.ctx.settings.get(SETTINGS_NS) as RouteSettings
    return value
  }

  private resolveRoute() {
    try {
      return this.resolver.resolve(this.readSettings())
    } catch (error) {
      throw toRemoteError(error)
    }
  }

  private async translateText(route: ReturnType<Skill2CnService['resolveRoute']>, description: string): Promise<string> {
    try {
      if (route.kind === 'dsh') {
        // 装配胶：真实 ctx.llm.stream 要求 `Message[]`，用 createUserMessage 构造
        // （范式见 <DSH>/packages/session/session-title-llm/src/index.ts L247-250）
        return await translateWithDshLlm(this.dshLlm(), route, description)
      }
      return await translateWithCustomEndpoint(route, description)
    } catch (error) {
      throw toRemoteError(error)
    }
  }

  /** 把真实 `ctx.llm` 适配成 translator 的结构化接口（唯一装配点） */
  private dshLlm(): DshLlmStream {
    const llm = this.ctx.llm as unknown as {
      stream(options: { messages: readonly unknown[] } & Record<string, unknown>): AsyncIterable<unknown>
    }
    return {
      stream: (options) => llm.stream({
        ...options,
        messages: options.messages.map((message) => {
          const raw = message as { role?: string; content?: readonly { type: string; text: string }[] }
          if (raw.role !== 'user' || raw.content === undefined) return message
          return createUserMessage({
            content: raw.content.map((block) => ({ type: 'text' as const, text: block.text })),
            source: { kind: 'plugin' as const, plugin: 'dsh-plugin-skill2cn' },
          })
        }),
      }) as AsyncIterable<never>,
    } as DshLlmStream
  }

  private async translateOne(path: string): Promise<SkillEntryView> {
    if (this.busy.has(path)) throw new RemoteError('skill2cn/busy', `翻译进行中：${path}`, {})
    this.busy.add(path)
    try {
      const raw = await readFile(path, 'utf8')
      const original = readDescription(raw)
      if (original === undefined) throw new Error('skill2cn/no-description — 文件缺少可用的 frontmatter description')
      if (isChineseDescription(original)) throw new Error('skill2cn/no-need — 描述已是中文，无需翻译')
      const route = this.resolveRoute()
      const translated = await this.translateText(route, original)
      const next = rewriteDescription(raw, translated)
      if (next === undefined) throw new Error('skill2cn/rewrite-refused — frontmatter 不可保真改写')
      await writeFile(path, next, 'utf8')
      const group = await this.groupOf(path)
      const entry: ManifestEntry = {
        skillPath: path,
        name: basename(dirname(path)),
        group,
        original,
        translated,
        translatedAt: new Date().toISOString(),
        ...(route.kind === 'dsh' ? { route: { provider: route.provider, model: route.model } } : {}),
      }
      await this.store.set(entry)
      this.failures.delete(path)
      // 用户已经对这个 skill 做过决定（翻译），浮层不再问他
      await this.prompted.remember([entry.name])
      this.catalogDirty = true
      return this.viewOf(path, entry.name, group, translated)
    } catch (error) {
      const remoteError = toRemoteError(error)
      // SPEC §3.5：失败卡片标错误态 + 「重试」；写盘失败时磁盘未被改动，故可安全重试
      this.failures.set(path, remoteError.message)
      throw remoteError
    } finally {
      this.busy.delete(path)
    }
  }

  private async restoreOne(path: string): Promise<void> {
    const record = this.store.get(path)
    if (record === undefined) throw new RemoteError('skill2cn/not-translated', `无备份记录：${path}`, {})
    try {
      const raw = await readFile(path, 'utf8')
      const next = rewriteDescription(raw, record.original)
      if (next !== undefined) await writeFile(path, next, 'utf8')
      // 文件已无法保真改写（如已被破坏）也照常删除记录——对账已把差异暴露给用户
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw toRemoteError(error)
      // 文件缺失：直接删除记录（对账页标记 stale/missing 的移除路径）
    }
    await this.store.delete(path)
    // 还原同样是「用户已对该 skill 做过决定」：别在还原之后又弹窗问他
    await this.prompted.remember([record.name])
    this.catalogDirty = true
  }

  private async groupOf(path: string): Promise<SkillEntryView['group']> {
    const { classifyPath } = await import('./core/scanner.js')
    return classifyPath(path, this.roots, '')
  }
}

function resolveAgentsHome(): string {
  const fromEnv = process.env.DSH_AGENTS_HOME
  return fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.agents')
}

function basename(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function dirname(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  return index < 0 ? path : normalized.slice(0, index)
}

function toRemoteError(error: unknown): RemoteError {
  if (error instanceof RemoteError) return error
  const message = error instanceof Error ? error.message : String(error)
  const slash = message.indexOf(' — ')
  const code: RemoteErrorCode = slash > 0 && message.startsWith('skill2cn/')
    ? (message.slice(0, slash) as RemoteErrorCode)
    : 'skill2cn/internal'
  return new RemoteError(code, message, {})
}
