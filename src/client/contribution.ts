import { z } from 'zod'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { batchSummary, pendingSkillView, progressView, skillEntryView, testRouteResult } from '../shared/wire.ts'

const PKG = 'dsh-plugin-skill2cn'

const strict = (typeSymbol: string, schema: z.ZodType) =>
  ({ mode: 'strict', typeSymbol, schema }) as const

const jsonParam = (name: string, schema: z.ZodType) =>
  ({ name, wire: name, source: 'json', codec: strict(`${PKG}#skill2cn:${name}`, schema) }) as const

const ok = z.object({ ok: z.literal(true) })

export const skill2cnRemote: TypertRemoteContribution = {
  package: PKG,
  descriptors: [
    {
      id: `${PKG}#skill2cn/list`, service: 'skill2cn', namespace: 'skill2cn', method: 'list',
      invocation: { kind: 'direct' }, parameters: [],
      result: strict(`${PKG}#skill2cn/list:result`, z.array(skillEntryView)),
    },
    {
      id: `${PKG}#skill2cn/translate`, service: 'skill2cn', namespace: 'skill2cn', method: 'translate',
      invocation: { kind: 'direct' }, parameters: [jsonParam('path', z.string())],
      result: strict(`${PKG}#skill2cn/translate:result`, skillEntryView),
    },
    {
      id: `${PKG}#skill2cn/restore`, service: 'skill2cn', namespace: 'skill2cn', method: 'restore',
      invocation: { kind: 'direct' }, parameters: [jsonParam('path', z.string())],
      result: strict(`${PKG}#skill2cn/restore:result`, ok),
    },
    {
      id: `${PKG}#skill2cn/translateAll`, service: 'skill2cn', namespace: 'skill2cn', method: 'translateAll',
      invocation: { kind: 'direct' }, parameters: [],
      result: strict(`${PKG}#skill2cn/translateAll:result`, batchSummary),
    },
    {
      id: `${PKG}#skill2cn/restoreAll`, service: 'skill2cn', namespace: 'skill2cn', method: 'restoreAll',
      invocation: { kind: 'direct' }, parameters: [],
      result: strict(`${PKG}#skill2cn/restoreAll:result`, batchSummary),
    },
    {
      id: `${PKG}#skill2cn/status`, service: 'skill2cn', namespace: 'skill2cn', method: 'status',
      invocation: { kind: 'direct' }, parameters: [],
      result: strict(`${PKG}#skill2cn/status:result`, progressView),
    },
    {
      id: `${PKG}#skill2cn/pending`, service: 'skill2cn', namespace: 'skill2cn', method: 'pending',
      invocation: { kind: 'direct' }, parameters: [],
      result: strict(`${PKG}#skill2cn/pending:result`, z.array(pendingSkillView)),
    },
    {
      id: `${PKG}#skill2cn/dismissNewcomers`, service: 'skill2cn', namespace: 'skill2cn', method: 'dismissNewcomers',
      invocation: { kind: 'direct' }, parameters: [jsonParam('names', z.array(z.string()))],
      result: strict(`${PKG}#skill2cn/dismissNewcomers:result`, ok),
    },
    {
      id: `${PKG}#skill2cn/translateMany`, service: 'skill2cn', namespace: 'skill2cn', method: 'translateMany',
      invocation: { kind: 'direct' }, parameters: [jsonParam('paths', z.array(z.string()))],
      result: strict(`${PKG}#skill2cn/translateMany:result`, batchSummary),
    },
    {
      id: `${PKG}#skill2cn/testRoute`, service: 'skill2cn', namespace: 'skill2cn', method: 'testRoute',
      invocation: { kind: 'direct' }, parameters: [],
      result: strict(`${PKG}#skill2cn/testRoute:result`, testRouteResult),
    },
  ],
}
export default skill2cnRemote
