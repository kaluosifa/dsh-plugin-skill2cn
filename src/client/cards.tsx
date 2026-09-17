import React, { useState } from 'react'
import type { SkillEntryView } from '../shared/wire.ts'

export interface CardCallbacks {
  onTranslate(path: string): void
  onRestore(path: string): void
}

type T = (key: string, params?: Record<string, string | number>) => string

const GROUPS = ['workspace', 'global', 'package'] as const

/**
 * 高密度列表：一行一个 skill，按来源分小节。
 *
 * 为什么不是卡片网格：卡片一行只有 2 张、每张约 120px 高，165 个 skill 要滚十几屏。
 * 密排行把名称/徽章/状态/描述/操作压成一行（约 30px），一屏能管约 4 倍数量；
 * 描述默认单行省略，点击展开全文（SPEC §2.4 的「截断 + 点击展开」仍在）。
 */
export function GroupedCards(props: {
  entries: readonly SkillEntryView[]
  t: T
  callbacks: CardCallbacks
  empty: string
}) {
  const groups = GROUPS
    .map((key) => ({ key, items: props.entries.filter((e) => e.group === key) }))
    .filter((group) => group.items.length > 0)

  if (groups.length === 0) return <p className="skill2cn-hint">{props.empty}</p>

  return (
    <>
      {groups.map((group) => (
        <section className="skill2cn-group" key={group.key}>
          <h3>
            {props.t(`badge.${group.key}`)}
            <span className="skill2cn-group-count">{group.items.length}</span>
          </h3>
          <div className="skill2cn-rows">
            {group.items.map((entry) => (
              <SkillRow key={entry.path} entry={entry} t={props.t} callbacks={props.callbacks} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function SkillRow({ entry, t, callbacks }: { entry: SkillEntryView; t: T; callbacks: CardCallbacks }) {
  const [expanded, setExpanded] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const busy = entry.state === 'translating'
  const canViewOriginal = entry.original !== undefined && (entry.state === 'translated' || entry.state === 'stale')

  return (
    <div className="skill2cn-item">
      <div className="skill2cn-row">
        <b className="skill2cn-row-name" title={entry.path}>{entry.name}</b>
        <span className="skill2cn-badge" data-warn={entry.group === 'package'}
              title={entry.group === 'package' ? t('badge.package.warn') : undefined}>
          {t(`badge.${entry.group}`)}{entry.group === 'package' ? ' ⚠️' : ''}
        </span>
        {busy && <span className="skill2cn-spinner" />}
        {entry.state === 'no-need' && <span className="skill2cn-state">{t('card.noNeed')}</span>}
        {entry.state === 'stale' && (
          <span className="skill2cn-state" data-kind="stale">
            {t('card.stale')}{entry.staleReason === 'missing' ? ` · ${t('card.stale.missing')}` : ''}
          </span>
        )}
        {entry.state === 'failed' && (
          <span className="skill2cn-state skill2cn-row-error" data-kind="failed" title={entry.error}>
            {entry.error}
          </span>
        )}
        <span className="skill2cn-row-desc" data-open={expanded}
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? t('card.collapse') : entry.description}>
          {entry.description}
        </span>
        <span className="skill2cn-row-actions">
          {!busy && entry.state === 'untranslated' && <button onClick={() => callbacks.onTranslate(entry.path)}>{t('card.translate')}</button>}
          {!busy && entry.state === 'failed' && <button onClick={() => callbacks.onTranslate(entry.path)}>{t('card.retry')}</button>}
          {!busy && entry.state === 'stale' && entry.staleReason !== 'missing' && (
            <button onClick={() => callbacks.onTranslate(entry.path)}>{t('card.retranslate')}</button>
          )}
          {!busy && (entry.state === 'translated' || entry.state === 'stale') && (
            <button onClick={() => callbacks.onRestore(entry.path)}>
              {entry.state === 'stale' ? t('card.removeRecord') : t('card.restore')}
            </button>
          )}
          {canViewOriginal && (
            <button onClick={() => setShowOriginal((v) => !v)}>
              {showOriginal ? t('card.hideOriginal') : t('card.viewOriginal')}
            </button>
          )}
        </span>
      </div>
      {expanded && <div className="skill2cn-desc-full">{entry.description}</div>}
      {showOriginal && entry.original !== undefined && <div className="skill2cn-original">{entry.original}</div>}
    </div>
  )
}
