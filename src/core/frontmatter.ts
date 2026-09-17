import { parseDocument } from 'yaml'

/** 复刻 skill-filesystem 的围栏规则（其 parseFrontmatter L909-935）：首行恰为 ---（去 \r），关闭行独占一行。 */
export interface FrontmatterBlock {
  /** YAML 区段起始偏移（首行 --- 之后） */
  readonly yamlStart: number
  /** 关闭 fence 行起始偏移 */
  readonly fenceStart: number
  /** YAML 区段文本（不含两道 fence） */
  readonly yamlText: string
}

export function locateFrontmatter(raw: string): FrontmatterBlock | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const yamlStart = firstLineEnd + 1
  let offset = yamlStart
  while (offset <= raw.length) {
    const lineEnd = raw.indexOf('\n', offset)
    const end = lineEnd < 0 ? raw.length : lineEnd
    if (raw.slice(offset, end).replace(/\r$/, '') === '---') {
      return { yamlStart, fenceStart: offset, yamlText: raw.slice(yamlStart, offset) }
    }
    if (lineEnd < 0) return undefined
    offset = lineEnd + 1
  }
  return undefined
}

export function readDescription(raw: string): string | undefined {
  const block = locateFrontmatter(raw)
  if (block === undefined) return undefined
  const doc = parseDocument(block.yamlText)
  if (doc.errors.length > 0) return undefined
  const value = doc.get('description')
  return typeof value === 'string' ? value : undefined
}

/**
 * 用 yaml Document 保真改写 description 值：
 * 其余键/注释由 Document 保留；正文（关闭 fence 起）逐字节保留。
 * 返回 undefined 表示该文件不可改写（调用方按失败处理，绝不写盘）。
 */
export function rewriteDescription(raw: string, next: string): string | undefined {
  const block = locateFrontmatter(raw)
  if (block === undefined) return undefined
  const doc = parseDocument(block.yamlText)
  if (doc.errors.length > 0) return undefined
  if (typeof doc.get('description') !== 'string') return undefined
  doc.set('description', next)
  // lineWidth: 0 关闭 YAML 默认的 80 列折行：长描述折行后「还原」写回的不是原文（SPEC §3.3）
  let yamlOut = doc.toString({ lineWidth: 0 })
  if (!yamlOut.endsWith('\n')) yamlOut += '\n'
  return raw.slice(0, block.yamlStart) + yamlOut + raw.slice(block.fenceStart)
}
