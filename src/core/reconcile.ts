import type { ManifestEntry } from './manifest.ts'
import { isChineseDescription } from './language.ts'

export interface ReconcileInput {
  /** 磁盘当前的 description；undefined = 文件缺失或无法解析 */
  readonly current: string | undefined
  readonly record: ManifestEntry | undefined
}

export type ReconcileResult =
  | { readonly kind: 'untranslated' }
  | { readonly kind: 'no-need' }
  | { readonly kind: 'translated'; readonly record: ManifestEntry }
  /** clear-record：包升级把文件覆盖回备份原文 → 静默清除记录，归入「未翻译」（SPEC §3.4） */
  | { readonly kind: 'clear-record' }
  /** stale：上游改了描述（或文件缺失）→ 标「已过期」，保留原文备份供查看 */
  | { readonly kind: 'stale'; readonly reason: 'upstream-changed' | 'missing'; readonly record: ManifestEntry }

/** SPEC §3.4 对账状态机（纯函数；副作用由调用方执行） */
export function reconcileEntry(input: ReconcileInput): ReconcileResult {
  const { current, record } = input
  if (record === undefined) {
    if (current !== undefined && isChineseDescription(current)) return { kind: 'no-need' }
    return { kind: 'untranslated' }
  }
  if (current === undefined) return { kind: 'stale', reason: 'missing', record }
  if (current === record.original) return { kind: 'clear-record' }
  if (current === record.translated) return { kind: 'translated', record }
  return { kind: 'stale', reason: 'upstream-changed', record }
}
