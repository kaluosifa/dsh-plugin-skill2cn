import { describe, expect, it } from 'vitest'
import { pendingNewcomers } from '../src/core/pending.ts'

const s = (name: string, description: string, group: 'workspace' | 'global' | 'package' = 'global') => ({ name, description, group })

const NO_SEEN: ReadonlySet<string> = new Set()
const NO_TRANSLATED: ReadonlySet<string> = new Set()

describe('pendingNewcomers', () => {
  it('reports an untranslated English skill that was never seen', () => {
    const out = pendingNewcomers({
      summaries: [s('fresh', 'Use when a new skill appears.')],
      seen: NO_SEEN,
      translated: NO_TRANSLATED,
    })
    expect(out).toEqual([{ name: 'fresh', description: 'Use when a new skill appears.', group: 'global' }])
  })

  it('skips a skill the user already answered about', () => {
    expect(pendingNewcomers({
      summaries: [s('fresh', 'Use when a new skill appears.')],
      seen: new Set(['fresh']),
      translated: NO_TRANSLATED,
    })).toEqual([])
  })

  it('skips a skill that already has a manifest record', () => {
    expect(pendingNewcomers({
      summaries: [s('done', 'Use when a new skill appears.')],
      seen: NO_SEEN,
      translated: new Set(['done']),
    })).toEqual([])
  })

  it('skips a description that is already Chinese (核心诉求：无需翻译的不提示)', () => {
    expect(pendingNewcomers({
      summaries: [s('zh', '当需要演示中文描述时使用。')],
      seen: NO_SEEN,
      translated: NO_TRANSLATED,
    })).toEqual([])
  })

  it('skips identifier-dense Chinese descriptions too', () => {
    expect(pendingNewcomers({
      summaries: [s('dingtalk', '钉钉群聊与消息。Use when 发消息、单聊/群聊、建群、群设置/成员、机器人/Webhook。DING 走 dingtalk-misc。')],
      seen: NO_SEEN,
      translated: NO_TRANSLATED,
    })).toEqual([])
  })

  it('returns an empty list for an empty catalog', () => {
    expect(pendingNewcomers({ summaries: [], seen: NO_SEEN, translated: NO_TRANSLATED })).toEqual([])
  })

  it('keeps catalog order and preserves each group', () => {
    const out = pendingNewcomers({
      summaries: [
        s('a', 'Use when a.', 'workspace'),
        s('zh', '已经是中文描述无需翻译', 'global'),
        s('b', 'Use when b.', 'package'),
      ],
      seen: NO_SEEN,
      translated: NO_TRANSLATED,
    })
    expect(out.map((p) => [p.name, p.group])).toEqual([['a', 'workspace'], ['b', 'package']])
  })

  it('treats a name present in both sets as answered', () => {
    expect(pendingNewcomers({
      summaries: [s('x', 'Use when x.')],
      seen: new Set(['x']),
      translated: new Set(['x']),
    })).toEqual([])
  })
})
