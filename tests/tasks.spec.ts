import { describe, expect, it } from 'vitest'
import { runPool } from '../src/core/tasks.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('runPool', () => {
  it('runs every item and reports the summary', async () => {
    const done: number[] = []
    const result = await runPool([1, 2, 3, 4], 3, async (n) => { await sleep(5); done.push(n) })
    expect(done.sort()).toEqual([1, 2, 3, 4])
    expect(result).toMatchObject({ total: 4, succeeded: 4, failed: 0 })
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      active += 1
      peak = Math.max(peak, active)
      await sleep(10)
      active -= 1
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('skips failures, keeps going, and collects errors', async () => {
    const done: number[] = []
    const result = await runPool([1, 2, 3, 4], 2, async (n) => {
      if (n === 2 || n === 4) throw new Error(`boom-${n}`)
      done.push(n)
    })
    expect(done.sort()).toEqual([1, 3])
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(2)
    expect(result.errors.map((e) => e.message).sort()).toEqual(['boom-2', 'boom-4'])
    expect(result.errors.map((e) => e.item).sort()).toEqual([2, 4])
  })

  it('reports progress snapshots ending in running=false', async () => {
    const snapshots: Array<{ total: number; completed: number; running: boolean }> = []
    await runPool([1, 2, 3], 2, async () => { await sleep(2) }, (p) => snapshots.push({ ...p }))
    expect(snapshots[snapshots.length - 1]).toMatchObject({ total: 3, completed: 3, running: false })
    for (const s of snapshots) expect(s.completed).toBeLessThanOrEqual(3)
  })

  it('handles an empty list', async () => {
    const result = await runPool([], 3, async () => {})
    expect(result).toMatchObject({ total: 0, succeeded: 0, failed: 0 })
  })
})
