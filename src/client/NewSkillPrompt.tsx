import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { skill2cnApi } from './api.ts'
import { TranslateIcon } from './icons.tsx'
import type { PendingSkillView } from '../shared/wire.ts'

type T = (key: string, params?: Record<string, string | number>) => string

/** 轮询间隔：宿主答案在内存里（目录没变时零读盘），5 秒对本用途足够 */
const POLL_MS = 5000
/** 卡片里最多列几个名字，超出用「等 N 个」带过 */
const MAX_LISTED = 8

/**
 * 「发现未翻译的 skill，要不要翻译」浮层卡片。
 *
 * 挂在 `shell.overlay`（框架级浮层、点击穿透，条目自己 opt-in 指针事件），固定右下角，
 * 任何页面都看得见。判定完全在宿主侧（`pending()`）：没被问过 + 没有译文 + 描述不是中文；
 * 这里只负责展示与两个动作。
 *
 * 轮询在页面隐藏时暂停，`visibilitychange` 时立刻补一次——避免后台标签页白跑。
 */
export function NewSkillPrompt({ ctx, t }: { ctx: ClientContext; t: T }) {
  const [items, setItems] = useState<readonly PendingSkillView[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>()
  const [error, setError] = useState<string | undefined>()
  const disposed = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    const res = await skill2cnApi(ctx).pending()
    if (disposed.current) return
    if (res.ok) setItems(res.value)
  }, [ctx])

  useEffect(() => {
    disposed.current = false
    void refresh()
    const timer = setInterval(() => {
      if (document.hidden) return
      void refresh()
    }, POLL_MS)
    const onVisible = (): void => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed.current = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const translate = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    setProgress({ done: 0, total: items.length })
    const ticker = setInterval(() => {
      void (async () => {
        const s = await skill2cnApi(ctx).status()
        if (s.ok && disposed.current === false) setProgress({ done: s.value.completed, total: s.value.total })
      })()
    }, 1000)
    try {
      const res = await skill2cnApi(ctx).translateMany(items.map((item) => item.path))
      if (!res.ok) setError(res.error.message)
      // 失败的条目会留在待提示列表里（没有记入已见），但用户得知道「刚才那次没成」
      else if (res.value.failed > 0) setError(t('prompt.partial', { succeeded: res.value.succeeded, failed: res.value.failed }))
    } finally {
      clearInterval(ticker)
      setBusy(false)
      setProgress(undefined)
      await refresh()
    }
  }

  const ignore = async (): Promise<void> => {
    setBusy(true)
    try {
      await skill2cnApi(ctx).dismissNewcomers(items.map((item) => item.name))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) return null
  const listed = items.slice(0, MAX_LISTED)

  return (
    <div className="skill2cn-prompt">
      <div className="skill2cn-prompt-head">
        <TranslateIcon size={16} />
        <b>{t('prompt.title', { count: items.length })}</b>
      </div>
      <ul className="skill2cn-prompt-list">
        {listed.map((item) => (
          <li key={item.path} title={item.description}>{item.name}</li>
        ))}
        {items.length > listed.length && (
          <li className="skill2cn-prompt-more">{t('prompt.more', { count: items.length - listed.length })}</li>
        )}
      </ul>
      {progress !== undefined && (
        <p className="skill2cn-hint">{t('prompt.progress', { done: progress.done, total: progress.total })}</p>
      )}
      {error !== undefined && <p className="skill2cn-error">{t('error.generic', { message: error })}</p>}
      <div className="skill2cn-prompt-actions">
        <span className="skill2cn-spinner" data-hidden={busy === false} />
        <button disabled={busy} onClick={() => void translate()}>{t('prompt.translate')}</button>
        <button disabled={busy} onClick={() => void ignore()}>{t('prompt.ignore')}</button>
      </div>
    </div>
  )
}
