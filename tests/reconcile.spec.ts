import { describe, expect, it } from 'vitest'
import { reconcileEntry, type ReconcileInput } from '../src/core/reconcile.ts'

const RECORD = {
  skillPath: '/repo/.dsh/skills/a/SKILL.md',
  name: 'a',
  group: 'workspace' as const,
  original: 'Use when debugging tricky failures.',
  translated: '当调试棘手故障时使用。',
  translatedAt: '2026-09-17T02:00:00.000Z',
}

const input = (current: string | undefined, record = RECORD): ReconcileInput => ({ current, record })

describe('reconcileEntry（SPEC §3.4）', () => {
  it('no record + English → untranslated', () => {
    expect(reconcileEntry({ current: 'Use when debugging tricky failures.', record: undefined })).toEqual({ kind: 'untranslated' })
  })

  it('no record + Chinese → no-need（批量跳过）', () => {
    expect(reconcileEntry({ current: '当调试棘手故障时使用。', record: undefined })).toEqual({ kind: 'no-need' })
  })

  it('record + file back to original English → clear-record（包升级覆盖，静默清除）', () => {
    expect(reconcileEntry(input(RECORD.original))).toEqual({ kind: 'clear-record' })
  })

  it('record + translation intact → translated', () => {
    expect(reconcileEntry(input(RECORD.translated))).toEqual({ kind: 'translated', record: RECORD })
  })

  it('record + file changed to different English → stale/upstream-changed', () => {
    expect(reconcileEntry(input('Use when debugging very tricky failures.'))).toEqual({ kind: 'stale', reason: 'upstream-changed', record: RECORD })
  })

  it('record + file changed to a different Chinese → stale（用户手改了译文）', () => {
    expect(reconcileEntry(input('当处理棘手的调试问题时使用。'))).toEqual({ kind: 'stale', reason: 'upstream-changed', record: RECORD })
  })

  it('record + file missing → stale/missing', () => {
    expect(reconcileEntry({ current: undefined, record: RECORD })).toEqual({ kind: 'stale', reason: 'missing', record: RECORD })
  })
})
