/**
 * 本插件样式。
 *
 * 主题适配规则（血泪）：DSH 用 `--dsw-alias-*` 设计 token（`--dsw-alias-bg-layer-2`、
 * `--dsw-alias-border-l2`、`--dsw-alias-state-error-primary` …）。**不要**猜别的前缀：
 * 早期版本写 `var(--color-bg, #fff)`，该变量不存在 → 暗色主题下按钮落到白底兜底，
 * 而文字继承主题的浅色 → 白底白字，整排按钮「看不见文字」。
 * 因此这里的铁律是：
 *   1. 文字**永不**背自设背景；按钮/面板底色一律用真实 token，兜底用 `transparent`；
 *   2. 边框兜底用 `currentColor`（任何主题下都与文字同色，必然可见）；
 *   3. 需要弱化只用 `opacity`，不用浅灰文字色。
 */
const CSS = `
.skill2cn-section { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; color: inherit; }
.skill2cn-head { display: flex; flex-direction: column; gap: 4px; margin-bottom: 2px; }
.skill2cn-head-line { display: flex; align-items: center; gap: 6px; }
.skill2cn-intro { margin: 0; font-size: 12px; opacity: .75; }
.skill2cn-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
.skill2cn-head svg { opacity: .85; flex: 0 0 auto; }
.skill2cn-tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--dsw-alias-separator-primary, currentColor); }
.skill2cn-tabs button { border: 0; background: none; color: inherit; padding: 8px 12px; cursor: pointer; font: inherit; font-size: 14px; opacity: .7; }
.skill2cn-tabs button:hover { opacity: 1; }
.skill2cn-tabs button[data-active="true"] { opacity: 1; font-weight: 600; border-bottom: 2px solid currentColor; }
.skill2cn-toolbar { display: flex; justify-content: center; align-items: center; gap: 12px; min-height: 32px; }
.skill2cn-filter { font: inherit; font-size: 12px; padding: 4px 8px; width: 100%; border-radius: 6px; color: inherit; background: var(--dsw-alias-bg-layer-2, transparent); border: 1px solid var(--dsw-alias-border-l2, currentColor); }
.skill2cn-group > h3 {
  font-size: 12px; font-weight: 600; opacity: .9;
  margin: 0 0 6px; padding: 4px 8px; border-radius: 6px;
  display: flex; align-items: center; gap: 6px;
  /* 备选方案（色带式）：表头做成整块色带并吸顶 —— 长列表滚动时始终知道自己在哪一类。
     --dsw-alias-bg-layer-1 是 DSH 里实测存在的底色调；若未定义则回落 transparent（退化为纯文字表头，不会变白底白字）。 */
  background: var(--dsw-alias-bg-layer-1, transparent);
  position: sticky; top: 0; z-index: 1;
}
/* 类别之间的分隔：一条横向分隔线 + 更大的上留白，让「全局 / 插件包 / 工作区」一眼分开。
   注意 --dsw-alias-border-subtle 与 --dsw-alias-separator-primary 在 DSH 里**未定义**
   （一直回落透明，等于没有分隔线），所以这里一律用实测存在的 --dsw-alias-border-l1/l2/l3。 */
.skill2cn-group + .skill2cn-group { margin-top: 8px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-border-l2, currentColor); }
.skill2cn-group-count { font-size: 11px; font-weight: 400; opacity: .7; border: 1px solid var(--dsw-alias-border-l3, currentColor); border-radius: 999px; padding: 0 6px; }
/* 密排行：一行一个 skill（名称 · 徽章 · 状态 · 描述 · 操作） */
.skill2cn-rows { display: flex; flex-direction: column; }
.skill2cn-item { border-bottom: 1px solid var(--dsw-alias-border-l1, transparent); }
.skill2cn-item:last-child { border-bottom: 0; }
.skill2cn-item:hover { background: var(--dsw-alias-interactive-bg-hover, transparent); }
.skill2cn-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; min-height: 26px; }
.skill2cn-row-name { flex: 0 0 180px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill2cn-row-desc { flex: 1 1 auto; min-width: 0; font-size: 12px; opacity: .85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.skill2cn-row-desc[data-open="true"] { opacity: .95; }
.skill2cn-row-error { flex: 0 1 auto; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill2cn-row-actions { flex: 0 0 auto; display: flex; gap: 6px; margin-left: auto; }
.skill2cn-desc-full { font-size: 12px; opacity: .9; white-space: pre-wrap; padding: 2px 6px 8px 12px; }
.skill2cn-badge { font-size: 11px; border: 1px solid var(--dsw-alias-border-l3, currentColor); border-radius: 999px; padding: 0 8px; opacity: .85; white-space: nowrap; flex: 0 0 auto; }
.skill2cn-badge[data-warn="true"] { color: var(--dsw-alias-state-warn-primary, #d9820b); border-color: currentColor; }
.skill2cn-state { font-size: 11px; opacity: .8; flex: 0 0 auto; }
.skill2cn-state[data-kind="failed"] { color: var(--dsw-alias-state-error-primary, #e5484d); opacity: 1; }
.skill2cn-state[data-kind="stale"] { color: var(--dsw-alias-state-warn-primary, #d9820b); opacity: 1; }
.skill2cn-original { font-size: 12px; color: inherit; background: var(--dsw-alias-bg-layer-2, transparent); border: 1px solid var(--dsw-alias-border-subtle, transparent); border-radius: 6px; padding: 6px 8px; margin: 0 6px 8px 12px; white-space: pre-wrap; }
.skill2cn-card-foot button, .skill2cn-toolbar button, .skill2cn-llm button, .skill2cn-row-actions button {
  font: inherit; font-size: 12px; padding: 2px 10px; border-radius: 6px; cursor: pointer;
  color: inherit; background: var(--dsw-alias-button-ghost-active-fill, transparent);
  border: 1px solid var(--dsw-alias-border-l2, currentColor);
}
.skill2cn-row-actions button:hover, .skill2cn-toolbar button:hover:not(:disabled), .skill2cn-llm button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2, transparent));
}
.skill2cn-toolbar button:disabled { opacity: .5; cursor: default; }
.skill2cn-spinner { width: 12px; height: 12px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: skill2cn-spin .8s linear infinite; display: inline-block; opacity: .7; }
@keyframes skill2cn-spin { to { transform: rotate(360deg); } }
.skill2cn-error { color: var(--dsw-alias-state-error-primary, #e5484d); font-size: 12px; }
.skill2cn-hint { font-size: 11px; opacity: .75; margin: 2px 0 0; }
.skill2cn-llm { display: flex; flex-direction: column; gap: 12px; max-width: 560px; }
.skill2cn-field { display: flex; flex-direction: column; gap: 4px; }
.skill2cn-field > label { font-size: 12px; opacity: .85; }
.skill2cn-llm input, .skill2cn-llm select {
  font: inherit; font-size: 13px; padding: 5px 8px; border-radius: 6px;
  color: inherit; background: var(--dsw-alias-bg-layer-2, transparent);
  border: 1px solid var(--dsw-alias-border-l2, currentColor);
}
.skill2cn-llm fieldset { border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 10px; }
.skill2cn-llm legend { font-size: 12px; opacity: .8; padding: 0 4px; }
.skill2cn-effective { font-size: 12px; opacity: .85; }
/* 测试结果：判决行 + 明细行。
   容器用 white-space: normal —— 结构化子元素配 pre-wrap 会把 JSX 标签之间的空白渲染成可见空行；
   明细行自己保留 pre-wrap（宿主原因可能带换行）。
   判决行用已核实的 token：--dsw-alias-state-success-primary / -error-primary 是 DSH 文档化的状态文字色，
   只作 color 用（文字不背自设底色）。顺带把原来那个永远不可见的边框换掉：
   --dsw-alias-border-subtle 在 DSH 里未定义，一直回落 transparent。 */
.skill2cn-test-result { font-size: 12px; color: inherit; background: var(--dsw-alias-bg-layer-2, transparent); border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 6px; padding: 8px 10px; white-space: normal; display: flex; flex-direction: column; gap: 2px; }
.skill2cn-test-verdict { font-weight: 600; color: var(--dsw-alias-state-success-primary, #12a150); }
.skill2cn-test-result[data-kind="failed"] .skill2cn-test-verdict { color: var(--dsw-alias-state-error-primary, #e5484d); }
.skill2cn-test-detail { opacity: .85; white-space: pre-wrap; }
/* 新增 skill 提示：挂在 shell.overlay 的框架级浮层里，自己定位到右下角 */
.skill2cn-prompt { position: fixed; right: 20px; bottom: 20px; z-index: 30; width: 300px; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 10px; color: inherit; background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #2c2c2e)); border: 1px solid var(--dsw-alias-border-l2, currentColor); box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-2, rgba(0, 0, 0, .28)); }
.skill2cn-prompt-head { display: flex; align-items: center; gap: 6px; }
.skill2cn-prompt-head svg { opacity: .85; flex: 0 0 auto; }
.skill2cn-prompt-head b { font-size: 13px; }
.skill2cn-prompt-list { margin: 0; padding-left: 16px; font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 2px; max-height: 168px; overflow: auto; }
.skill2cn-prompt-list li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill2cn-prompt-more { opacity: .7; }
.skill2cn-prompt-actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
.skill2cn-prompt-actions .skill2cn-spinner[data-hidden="true"] { visibility: hidden; }
.skill2cn-prompt-actions button {
  font: inherit; font-size: 12px; padding: 3px 12px; border-radius: 6px; cursor: pointer;
  color: inherit; background: var(--dsw-alias-button-ghost-active-fill, transparent);
  border: 1px solid var(--dsw-alias-border-l2, currentColor);
}
.skill2cn-prompt-actions button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-1, transparent)); }
.skill2cn-prompt-actions button:disabled { opacity: .5; cursor: default; }
`

export function injectStyles(): void {
  if (document.getElementById('skill2cn-styles') !== null) return
  const style = document.createElement('style')
  style.id = 'skill2cn-styles'
  style.textContent = CSS
  document.head.appendChild(style)
}
