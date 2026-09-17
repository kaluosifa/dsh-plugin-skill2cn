export interface PoolProgress {
  readonly total: number
  readonly completed: number
  readonly succeeded: number
  readonly failed: number
  readonly running: boolean
}

export interface PoolError<T> {
  readonly item: T
  readonly message: string
}

export interface PoolResult<T> extends PoolProgress {
  readonly running: false
  readonly errors: PoolError<T>[]
}

/** 固定并发上限的异步池（SPEC §3.5：上限 3；失败跳过并继续，结束汇总）。 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  onProgress?: (progress: PoolProgress) => void,
): Promise<PoolResult<T>> {
  const state = { total: items.length, completed: 0, succeeded: 0, failed: 0, running: true }
  const errors: PoolError<T>[] = []
  const emit = (): void => onProgress?.({ ...state })
  emit()
  let index = 0
  const lane = async (): Promise<void> => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      try {
        await worker(item)
        state.succeeded += 1
      } catch (error) {
        state.failed += 1
        errors.push({ item, message: error instanceof Error ? error.message : String(error) })
      }
      state.completed += 1
      emit()
    }
  }
  await Promise.all(Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, () => lane()))
  state.running = false
  emit()
  return { ...state, running: false, errors }
}
