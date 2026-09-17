import { existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { SkillGroup } from './manifest.ts'

/** ctx.skills 的最小依赖面（结构化类型，host 传入真实 registry，测试传 fake） */
export interface SkillSummaryLike {
  readonly name: string
  readonly description: string
  readonly source: string
}

/** registry 读取选项：`cwd` 选项目根；`scope` 选并入的层链（省略只读全局层，见诊断修正 D12） */
export interface SkillReadOptions {
  readonly cwd?: string
  readonly scope?: unknown
}

export interface SkillsRegistryLike {
  list(options?: SkillReadOptions): Promise<readonly SkillSummaryLike[]>
  get(name: string, options?: SkillReadOptions): Promise<{ readonly path?: string } | undefined>
  /** registry 的 `snapshot()`（比 `list()` 多一个 `complete` 位）；测试 fake 可省略 */
  snapshot?(options?: SkillReadOptions): Promise<{ readonly skills: readonly SkillSummaryLike[]; readonly complete: boolean }>
}

export interface ScanRoots {
  readonly projectRoot: string
  readonly dshHome: string
  readonly agentsHome: string
}

export interface ScannedSkill {
  readonly name: string
  readonly description: string
  readonly path: string
  readonly group: SkillGroup
  readonly source: string
}

/** 只读摘要：带 source（供拿到路径后重新归类），group 只是按 source 的临时归类 */
export interface CatalogSummarySkill {
  readonly name: string
  readonly description: string
  readonly group: SkillGroup
  readonly source: string
}

/** 归一化为小写正斜杠路径，供前缀比较（Windows 大小写不敏感） */
function normalize(path: string): string {
  return resolve(path).replaceAll(sep, '/').toLowerCase()
}

function isInside(path: string, dir: string): boolean {
  const p = normalize(path)
  const d = normalize(dir)
  return p === d || p.startsWith(d + '/')
}

/**
 * 决策 D2 的 fallback 映射：没有磁盘路径时（例如 registry 摘要）只按 source 归类。
 * 注意 `custom` 只能判成 global —— 真实位置要靠路径才知道（插件包的 custom dir 在
 * profile 的 node_modules 下，应归 package），所以拿到路径的调用方要用 classifyPath 覆盖。
 */
export function groupFromSource(source: string): SkillGroup {
  if (source === 'project-dsh' || source === 'project-agents') return 'workspace'
  if (source === 'user-dsh' || source === 'user-agents' || source === 'custom') return 'global'
  if (source === 'bundled') return 'package'
  return 'global'
}

/** 决策 D2：按路径前缀归类，fallback 到 source 字符串映射 */
export function classifyPath(skillPath: string, roots: ScanRoots, source: string): SkillGroup {
  if (isInside(skillPath, join(roots.dshHome, 'profiles'))) return 'package'
  if (isInside(skillPath, roots.projectRoot)) return 'workspace'
  if (isInside(skillPath, roots.dshHome) || isInside(skillPath, roots.agentsHome)) return 'global'
  return groupFromSource(source)
}

/** 复刻 skill-filesystem findProjectRoot（L937-947）：向上找 .git，找不到退回 cwd */
export function findProjectRoot(cwd: string): string {
  let current = resolve(cwd)
  for (;;) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

/**
 * 决策 D1：枚举 = registry 胜者集合；path 经 get() 补齐。
 * 无磁盘 path 的 skill（内存 provider）不进入面板（已知限制 R4）。
 * `scope` 为 agent preset 的 standing scope key：web 应用把本地发现移入 preset 层，
 * 不带 scope 只读到全局层（诊断修正 D12）。
 */
export async function scanSkills(
  registry: SkillsRegistryLike,
  cwd: string | undefined,
  roots: ScanRoots,
  scope?: unknown,
): Promise<ScannedSkill[]> {
  const options = readOptions(cwd, scope)
  const summaries = await registry.list(options)
  const out: ScannedSkill[] = []
  for (const summary of summaries) {
    const definition = await registry.get(summary.name, options)
    const path = definition?.path
    if (typeof path !== 'string' || path.length === 0) continue
    out.push({ name: summary.name, description: summary.description, path, group: classifyPath(path, roots, summary.source), source: summary.source })
  }
  return out
}

/**
 * 只读摘要（轮询专用）：**不 `get()`、不读盘**，成本在 registry 的 collect 缓存上。
 *
 * `complete: false` 表示发现过程被并发 revision 打断（provider 抛错、watcher 起不来、
 * 两次尝试间 revision 又变），此时目录可能不全——调用方必须保留上次结果、下轮重试，
 * 否则会把「暂时看不见」误当成变化。
 *
 * 摘要不带路径，故 `group` 只是按 source 的临时归类；拿到路径后要用
 * {@link classifyPath} 覆盖（插件包的 custom dir 在 profile 的 node_modules 下）。
 */
export async function readSummaries(
  registry: SkillsRegistryLike,
  cwd: string | undefined,
  _roots: ScanRoots,
  scope?: unknown,
): Promise<{ skills: CatalogSummarySkill[]; complete: boolean }> {
  const options = readOptions(cwd, scope)
  if (registry.snapshot !== undefined) {
    const snapshot = await registry.snapshot(options)
    return { skills: snapshot.skills.map((summary) => toPending(summary)), complete: snapshot.complete }
  }
  const summaries = await registry.list(options)
  return { skills: summaries.map((summary) => toPending(summary)), complete: true }
}

/**
 * 读取选项：`cwd` 省略时 registry 的**项目轴不存在**（provider 只在 `cwd !== undefined`
 * 时扫项目根），这正是「还不知道用户在哪个工作区」时想要的——宁可不列，也不要把
 * 启动目录当成用户项目。
 */
function readOptions(cwd: string | undefined, scope: unknown): SkillReadOptions {
  return {
    ...cwd === undefined ? {} : { cwd },
    ...scope === undefined ? {} : { scope },
  }
}

function toPending(summary: SkillSummaryLike): CatalogSummarySkill {
  return {
    name: summary.name,
    description: summary.description,
    group: groupFromSource(summary.source),
    source: summary.source,
  }
}
