import React from 'react'

/**
 * 本插件自己的图标。
 *
 * 为什么不 import `@deepseek-ai/dsh-client-ui-primitives` 的图标：
 *   1. 计划决策 D8 明确「client 不依赖 ui-primitives 的 API 面」；
 *   2. 该图标集里**没有**翻译/语言类字形（最接近的是地球），
 *   3. 自带 SVG 零运行时依赖，不会因为宿主模块表变化而拖垮整个 client 半身。
 *
 * 为什么是地球：它是 i18n / 语言转换的通用隐喻，在 16px 下比「文↔A」这类双字符
 * 象形更清晰、更不易糊。`currentColor` + 描边，随主题自动适配，与 DSH 单色描边风格一致。
 */
export function TranslateIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.9" ry="6.3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.9 5.6h12.2M1.9 10.4h12.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
