import { isChineseDescription } from './language.ts'

export interface PendingInput<S> {
  readonly summaries: readonly S[]
  /** `prompted.json` 里「已经问过」的 skill 名 */
  readonly seen: ReadonlySet<string>
  /** manifest 里有记录的 skill 名（译过或已过期）：已经处理过，无需再问 */
  readonly translated: ReadonlySet<string>
}

/**
 * 需要弹窗问「要不要翻译」的 skill（原样返回入参对象，附带的字段如 `source` 会保留）。
 *
 * 判定是**纯谓词**而不是「与上次目录做差分」：产品选择是「首次运行连存量一起问一次」，
 * 于是不需要基线快照、不需要工作区切换时的静默播种——三条同时成立即可提示：
 *
 *   1. 没被问过（`seen`）；
 *   2. 没有备份记录（`translated`）；
 *   3. 描述本来不是中文（复用 SPEC §3.4 的「无需翻译」启发式）。
 *
 * `seen` 只增不减，「一次性」是它的天然结果。直接推论：换到另一个工作区时，那个项目里
 * 未处理过的未翻译 skill 会再问一次——这是同一规则的一致行为。
 */
export function pendingNewcomers<S extends { readonly name: string; readonly description: string }>(
  input: PendingInput<S>,
): S[] {
  return input.summaries.filter((skill) =>
    !input.seen.has(skill.name)
    && !input.translated.has(skill.name)
    && !isChineseDescription(skill.description))
}
