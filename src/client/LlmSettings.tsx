import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { llmApi, skill2cnApi, type ConfigurableProvider, type DiscoveredModel } from './api.ts'

type T = (key: string, params?: Record<string, string | number>) => string

/** host 侧 settings 命名空间 skill2cn 的存储形状（与 src/index.ts 的 Schema 一一对应） */
interface SettingsValue {
  routeMode?: string
  provider?: string
  model?: string
  customBaseURL?: string
  customModel?: string
  /** 'openai' | 'anthropic'：自定义端点的兼容协议 */
  customProtocol?: string
}

/**
 * 镜像视图：`getSnapshot()` 返回的是**同步状态包装**（`status`/`value`/`user`/`writable`），
 * 不是设置对象本身 —— 0.1.7 起契约见 `@deepseek-ai/dsh-client-ui-settings/client` 的
 * `ConfigFormSnapshot`（`ctx.configForms.get(entryId)`）。`value` 是组合后的有效值
 * （用户层覆盖组合层再覆盖默认值）。
 */
interface ScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value?: SettingsValue
  user?: Record<string, unknown>
  writable: boolean
}

const DEFAULTS: Required<SettingsValue> = {
  routeMode: 'follow',
  provider: '',
  model: '',
  customBaseURL: '',
  customModel: '',
  customProtocol: 'openai',
}

/**
 * 测试结果：判决行 + 明细行。
 * 刻意「判决在前」——测试是**校验配置**的动作，第一眼要回答「配好了没」，
 * 译文/耗时/模型名是证据，降级到第二行。措辞与配色对齐 DSH 家规：
 * 判决短语短、无感叹号（先例「连接成功」「已保存 {provider}。」），
 * 需要弱化只用 opacity，文字不背自设底色。
 */
interface TestOutcome {
  readonly ok: boolean
  readonly verdict: string
  readonly detail: string
}

export function LlmSettings({ ctx, t }: { ctx: ClientContext; t: T }) {
  const scope = useMemo(() => ctx.configForms.get<SettingsValue>('skill2cn'), [ctx])
  const [snapshot, setSnapshot] = useState<ScopeSnapshot>(() => scope.getSnapshot())
  const [providers, setProviders] = useState<readonly ConfigurableProvider[]>([])
  const [models, setModels] = useState<readonly DiscoveredModel[]>([])
  const [discoverError, setDiscoverError] = useState<string | undefined>()
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  // secret 不回传明文，镜像里也无法可靠判断「是否已设置」；改由本次会话内的写入结果作答
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testOutcome, setTestOutcome] = useState<TestOutcome | undefined>()

  useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])

  useEffect(() => {
    void (async () => {
      const res = await llmApi(ctx).listConfigurableProviders()
      if (res.ok) setProviders(res.value)
    })()
  }, [ctx])

  const value: Required<SettingsValue> = { ...DEFAULTS, ...(snapshot.value ?? {}) }

  const protocol = value.customProtocol === 'anthropic' ? 'anthropic' : 'openai'
  const routeSummary = value.routeMode === 'custom'
    ? `${t('llm.mode.custom')} · ${protocol} · ${value.customBaseURL || '—'} · ${value.customModel || '—'}`
    : value.routeMode === 'preset'
      ? `${t('llm.mode.preset')} · ${value.provider || '—'} / ${value.model || '—'}`
      : t('llm.mode.follow')

  const discover = async (): Promise<void> => {
    setDiscoverError(undefined)
    const entry = providers.find((p) => p.provider === value.provider)
    if (entry === undefined) return
    const res = await llmApi(ctx).discoverModels(entry.settingsNs, { provider: entry.provider })
    if (res.ok) setModels(res.value)
    else setDiscoverError(res.error.message)
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTestOutcome(undefined)
    try {
      const res = await skill2cnApi(ctx).testRoute()
      setTestOutcome(res.ok
        ? {
            ok: true,
            verdict: t('llm.test.ok'),
            detail: t('llm.test.okDetail', {
              translation: res.value.translation,
              durationMs: res.value.durationMs,
              provider: res.value.provider,
              model: res.value.model,
            }),
          }
        : {
            ok: false,
            verdict: t('llm.test.failed'),
            // 判决行已经说了失败，明细直接给宿主原因；无路由时换成可执行的指引
            detail: res.error.message.includes('skill2cn/no-route') ? t('llm.noRoute') : res.error.message,
          })
    } finally {
      setTesting(false)
    }
  }

  const save = useCallback(
    (field: string, v: unknown) => { void scope.set(field, v) },
    [scope],
  )

  const set = (field: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    save(field, event.target.value)

  return (
    <div className="skill2cn-llm">
      {snapshot.status === 'unavailable' && <p className="skill2cn-error">{t('llm.unavailable')}</p>}

      <div className="skill2cn-field">
        <label htmlFor="skill2cn-route-mode">{t('llm.mode')}</label>
        <select id="skill2cn-route-mode" value={value.routeMode} onChange={set('routeMode')}>
          <option value="follow">{t('llm.mode.follow')}</option>
          <option value="preset">{t('llm.mode.preset')}</option>
          <option value="custom">{t('llm.mode.custom')}</option>
        </select>
        <p className="skill2cn-hint">
          {value.routeMode === 'follow' ? t('llm.hint.follow')
            : value.routeMode === 'preset' ? t('llm.hint.preset')
              : t('llm.hint.custom')}
        </p>
      </div>

      {value.routeMode === 'preset' && (
        <>
          <div className="skill2cn-field">
            <label htmlFor="skill2cn-provider">{t('llm.provider')}</label>
            <select id="skill2cn-provider" value={value.provider} onChange={set('provider')}>
              <option value="">—</option>
              {providers.map((p) => <option key={p.provider} value={p.provider}>{p.displayName}（{p.provider}）</option>)}
            </select>
          </div>
          <div className="skill2cn-field">
            <label htmlFor="skill2cn-model">{t('llm.model')}</label>
            <input id="skill2cn-model" value={value.model} onChange={set('model')} list="skill2cn-models" />
            <datalist id="skill2cn-models">
              {models.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.id}</option>)}
            </datalist>
          </div>
          <div>
            <button onClick={() => void discover()}>{t('llm.model.discover')}</button>
          </div>
          {discoverError !== undefined && <p className="skill2cn-error">{t('llm.model.discover.fail', { message: discoverError })}</p>}
        </>
      )}

      {value.routeMode === 'custom' && (
        <fieldset>
          <legend>{t('llm.advanced')}</legend>
          <div className="skill2cn-field">
            <label htmlFor="skill2cn-base-url">{t('llm.custom.baseURL')}</label>
            <input id="skill2cn-base-url" value={value.customBaseURL} onChange={set('customBaseURL')}
                   placeholder={protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.deepseek.com/v1'} />
          </div>
          <div className="skill2cn-field">
            <label htmlFor="skill2cn-protocol">{t('llm.custom.protocol')}</label>
            <select id="skill2cn-protocol" value={protocol} onChange={set('customProtocol')}>
              <option value="openai">{t('llm.custom.protocol.openai')}</option>
              <option value="anthropic">{t('llm.custom.protocol.anthropic')}</option>
            </select>
          </div>
          <div className="skill2cn-field">
            <label htmlFor="skill2cn-api-key">
              {t('llm.custom.apiKey')}{apiKeySaved && <span className="skill2cn-state"> {t('llm.custom.apiKey.set')}</span>}
            </label>
            <input id="skill2cn-api-key" type="password" value={apiKeyDraft}
                   onChange={(e) => setApiKeyDraft(e.target.value)}
                   onBlur={() => {
                     if (apiKeyDraft.length === 0) return
                     save('customApiKey', apiKeyDraft)
                     setApiKeyDraft('')
                     setApiKeySaved(true)
                   }} />
            <p className="skill2cn-hint">{t('llm.custom.apiKey.hint')}</p>
          </div>
          <div className="skill2cn-field">
            <label htmlFor="skill2cn-custom-model">{t('llm.custom.model')}</label>
            <input id="skill2cn-custom-model" value={value.customModel} onChange={set('customModel')} />
          </div>
        </fieldset>
      )}

      <p className="skill2cn-effective">{t('llm.effective', { route: routeSummary })}</p>

      <div>
        <button disabled={testing} onClick={() => void runTest()}>{testing ? t('llm.test.running') : t('llm.test')}</button>
      </div>
      {testOutcome !== undefined && (
        <div className="skill2cn-test-result" data-kind={testOutcome.ok ? 'ok' : 'failed'} role="status" aria-live="polite">
          <span className="skill2cn-test-verdict">{testOutcome.verdict}</span>
          <span className="skill2cn-test-detail">{testOutcome.detail}</span>
        </div>
      )}
    </div>
  )
}
