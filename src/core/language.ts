/**
 * 「无需翻译」启发式（SPEC §3.4）：描述已是中文。
 *
 * 规则：CJK 表意字符 ≥ 4，且不少于拉丁字母数的**一半**。
 *
 * 为什么是「一半」而不是「多于」：中文描述普遍夹带标识符与产品名（钉钉的
 * `dingtalk-*`/`Webhook`/`dws chat`、`Shadcn/ui`、`utility-first`、`spec`/`tickets`），
 * 按「多于」判定会把它们全判成待翻译，「全部翻译」于是用同义改写覆盖掉本来很好的中文
 * （用户实测反馈）。反过来，英文描述里冒出的零星中文（`汉化`、`会议记录`）仍因比例
 * 不足判为可翻译；`cjk ≥ 4` 这一步同时挡住「Use when debugging. 备注」这类噪声。
 */
export function isChineseDescription(text: string): boolean {
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return cjk >= 4 && cjk * 2 >= latin
}
