import { describe, expect, it } from 'vitest'
import { classifyPath, scanSkills, type SkillsRegistryLike } from '../src/core/scanner.ts'

const ROOTS = {
  projectRoot: '/repo',
  dshHome: '/home/u/.dsh',
  agentsHome: '/home/u/.agents',
}

describe('classifyPath', () => {
  it('classifies workspace skills', () => {
    expect(classifyPath('/repo/.dsh/skills/a/SKILL.md', ROOTS, 'project-dsh')).toBe('workspace')
    expect(classifyPath('/repo/.agents/skills/a/SKILL.md', ROOTS, 'project-agents')).toBe('workspace')
  })

  it('classifies global skills', () => {
    expect(classifyPath('/home/u/.dsh/skills/a/SKILL.md', ROOTS, 'user-dsh')).toBe('global')
    expect(classifyPath('/home/u/.agents/skills/a/SKILL.md', ROOTS, 'user-agents')).toBe('global')
  })

  it('classifies package skills inside profile node_modules', () => {
    expect(classifyPath('/home/u/.dsh/profiles/dev/node_modules/pkg/skills/a/SKILL.md', ROOTS, 'bundled')).toBe('package')
  })

  it('classifies custom dirs by location (SPEC §4 附注)', () => {
    expect(classifyPath('/repo/vendor/skills/a/SKILL.md', ROOTS, 'custom')).toBe('workspace')
    expect(classifyPath('/home/u/shared-skills/a/SKILL.md', ROOTS, 'custom')).toBe('global')
  })

  it('falls back to the source string when the path matches no root', () => {
    expect(classifyPath('/opt/bundled/a/SKILL.md', ROOTS, 'bundled')).toBe('package')
    expect(classifyPath('/opt/x/a/SKILL.md', ROOTS, 'something-else')).toBe('global')
  })

  it('handles Windows separators and case', () => {
    const winRoots = { projectRoot: 'D:\\repo', dshHome: 'C:\\Users\\u\\.dsh', agentsHome: 'C:\\Users\\u\\.agents' }
    expect(classifyPath('d:\\repo\\.dsh\\skills\\a\\SKILL.md', winRoots, 'project-dsh')).toBe('workspace')
    expect(classifyPath('C:\\Users\\u\\.dsh\\profiles\\dev\\node_modules\\p\\skills\\a\\SKILL.md', winRoots, 'bundled')).toBe('package')
  })
})

describe('scanSkills', () => {
  it('merges list() with get() paths and classifies groups', async () => {
    const registry: SkillsRegistryLike = {
      list: async () => [
        { name: 'a', description: 'Use a.', source: 'project-dsh' },
        { name: 'b', description: 'Use b.', source: 'user-dsh' },
        { name: 'c', description: '已是中文描述无需翻译', source: 'bundled' },
      ],
      get: async (name) => ({
        a: { path: '/repo/.dsh/skills/a/SKILL.md' },
        b: { path: '/home/u/.dsh/skills/b/SKILL.md' },
        c: {},
      })[name as 'a' | 'b' | 'c'],
    }
    const skills = await scanSkills(registry, '/repo', ROOTS)
    // c 无磁盘路径（内存 provider）→ 不进入面板（决策 D1 已知限制）
    expect(skills.map((s) => [s.name, s.group])).toEqual([['a', 'workspace'], ['b', 'global']])
    expect(skills[0]).toMatchObject({ description: 'Use a.', path: '/repo/.dsh/skills/a/SKILL.md' })
  })

  // 诊断修正 D12：不带 scope 只读到全局层，本地（项目/用户根）skill 全丢
  it('forwards the preset standing scope to both list() and get()', async () => {
    const scope = { agentPreset: 'standard' }
    const seen: unknown[] = []
    const registry: SkillsRegistryLike = {
      list: async (options) => {
        seen.push(options)
        return [{ name: 'a', description: 'Use a.', source: 'user-dsh' }]
      },
      get: async (_name, options) => {
        seen.push(options)
        return { path: '/home/u/.dsh/skills/a/SKILL.md' }
      },
    }
    const skills = await scanSkills(registry, '/repo', ROOTS, scope)
    expect(seen).toEqual([{ cwd: '/repo', scope }, { cwd: '/repo', scope }])
    expect(skills.map((s) => [s.name, s.group])).toEqual([['a', 'global']])
  })

  it('omits scope entirely when none is available', async () => {
    const seen: unknown[] = []
    const registry: SkillsRegistryLike = {
      list: async (options) => {
        seen.push(options)
        return []
      },
      get: async () => undefined,
    }
    await scanSkills(registry, '/repo', ROOTS, undefined)
    expect(seen).toEqual([{ cwd: '/repo' }])
  })
})
