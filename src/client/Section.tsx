import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { skill2cnApi } from './api.ts'
import { GroupedCards } from './cards.tsx'
import { TranslateIcon } from './icons.tsx'
import { LlmSettings } from './LlmSettings.tsx'
import type { ProgressView, SkillEntryView } from '../shared/wire.ts'

type Tab = 'untranslated' | 'translated' | 'llm'
type T = (key: string, params?: Record<string, string | number>) => string

/**
 * 标签页归属。「已翻译」页收三类：有备份记录的（translated）、上游改过的（stale）、
 * 以及描述本来就是中文的（no-need）——后者没有备份记录，所以卡片上**没有**「还原」「查看原文」，
 * 这是对的：没有英文原文可还原/对照。产品要求把 no-need 从「未翻译」挪走，
 * 「未翻译」页从此只列需要动手的条目。
 */
const TRANSLATED_STATES = new Set(['translated', 'stale', 'no-need'])

export function Skill2CnSection({ ctx, t }: { ctx: ClientContext; t: T }) {
  const [tab, setTab] = useState<Tab>('untranslated')
  const [entries, setEntries] = useState<readonly SkillEntryView[]>([])
  const [progress, setProgress] = useState<ProgressView | undefined>()
  const [banner, setBanner] = useState<string | undefined>()
  const [filter, setFilter] = useState('')
  const poller = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await skill2cnApi(ctx).list()
      if (res.ok) setEntries(res.value)
      else setBanner(t('error.generic', { message: res.error.message }))
    } catch (e) {
      setBanner(String(e))
    }
  }, [ctx, t])

  useEffect(() => { void refresh() }, [refresh]) // 面板打开：list() 内部先对账（SPEC §3.4）

  const stopPolling = (): void => { if (poller.current !== undefined) { clearInterval(poller.current); poller.current = undefined } }
  const startPolling = useCallback((): void => {
    stopPolling()
    poller.current = setInterval(() => {
      void (async () => {
        const s = await skill2cnApi(ctx).status()
        if (!s.ok) return
        setProgress(s.value)
        if (s.value.busyPaths.length > 0) await refresh()
        if (!s.value.running) { stopPolling(); await refresh() }
      })()
    }, 1000)
  }, [ctx, refresh])
  useEffect(() => stopPolling, [])

  const act = async (call: () => Promise<{ ok: boolean; error?: { message: string } }>): Promise<void> => {
    setBanner(undefined)
    const res = await call()
    if (!res.ok) {
      setBanner(res.error !== undefined && res.error.message.includes('skill2cn/no-route') ? t('llm.noRoute') : t('error.generic', { message: res.error?.message ?? 'unknown' }))
    }
    await refresh()
  }

  const callbacks = {
    onTranslate: (path: string) => { void act(() => skill2cnApi(ctx).translate(path)) },
    onRestore: (path: string) => { void act(() => skill2cnApi(ctx).restore(path)) },
  }

  const runBatch = async (kind: 'translateAll' | 'restoreAll'): Promise<void> => {
    setBanner(undefined)
    startPolling()
    const res = await skill2cnApi(ctx)[kind]()
    stopPolling()
    // 批处理返回即停轮询，但可能在途的最后一次 status() 仍是 running=true；
    // 不清零会让 busy 永久为真（两个批量按钮永久禁用、进度条停在旧值）
    setProgress(undefined)
    if (res.ok) {
      setBanner(kind === 'translateAll'
        ? t('summary.skipped', res.value)
        : t('summary', res.value))
    } else {
      setBanner(t('error.generic', { message: res.error.message }))
    }
    await refresh()
  }

  const query = filter.trim().toLowerCase()
  const matches = (e: SkillEntryView): boolean =>
    query.length === 0
    || e.name.toLowerCase().includes(query)
    || e.description.toLowerCase().includes(query)
  const untranslated = entries.filter((e) => !TRANSLATED_STATES.has(e.state)).filter(matches)
  const translated = entries.filter((e) => TRANSLATED_STATES.has(e.state)).filter(matches)
  const noNeed = entries.filter((e) => e.state === 'no-need').length
  const busy = progress?.running === true
  const emptyKey = (tab: 'untranslated' | 'translated'): string =>
    query.length > 0 ? 'empty.filter' : tab === 'untranslated' ? 'empty.untranslated' : 'empty.translated'

  return (
    <div className="skill2cn-section">
      <header className="skill2cn-head">
        <div className="skill2cn-head-line">
          <TranslateIcon size={16} />
          <h2>{t('nav')}</h2>
        </div>
        <p className="skill2cn-intro">{t('intro')}</p>
      </header>
      <nav className="skill2cn-tabs">
        {(['untranslated', 'translated', 'llm'] as const).map((key) => (
          <button key={key} data-active={tab === key} onClick={() => setTab(key)}>{t(`tab.${key}`)}</button>
        ))}
      </nav>
      {banner !== undefined && <p className="skill2cn-state">{banner}</p>}
      {tab === 'untranslated' && (
        <>
          <div className="skill2cn-toolbar">
            <button disabled={busy} onClick={() => void runBatch('translateAll')}>{t('all.translate')}</button>
            {busy
              ? <span className="skill2cn-state">{t('progress', { done: progress!.completed, total: progress!.total })}</span>
              : <span className="skill2cn-hint">{t('count.untranslated', { count: untranslated.filter((e) => e.state !== 'failed').length })}</span>}
          </div>
          <input className="skill2cn-filter" type="search" value={filter}
                 onChange={(e) => setFilter(e.target.value)} placeholder={t('filter.placeholder')} />
          <GroupedCards entries={untranslated} t={t} callbacks={callbacks} empty={t(emptyKey('untranslated'))} />
        </>
      )}
      {tab === 'translated' && (
        <>
          <div className="skill2cn-toolbar">
            <button disabled={busy} onClick={() => void runBatch('restoreAll')}>{t('all.restore')}</button>
            {busy
              ? <span className="skill2cn-state">{t('progress', { done: progress!.completed, total: progress!.total })}</span>
              : <span className="skill2cn-hint">{t('count.translated', { count: translated.filter((e) => e.state !== 'no-need').length, noNeed })}</span>}
          </div>
          <input className="skill2cn-filter" type="search" value={filter}
                 onChange={(e) => setFilter(e.target.value)} placeholder={t('filter.placeholder')} />
          {noNeed > 0 && <p className="skill2cn-hint">{t('hint.noNeed')}</p>}
          <GroupedCards entries={translated} t={t} callbacks={callbacks} empty={t(emptyKey('translated'))} />
        </>
      )}
      {tab === 'llm' && <LlmSettings ctx={ctx} t={t} />}
    </div>
  )
}
