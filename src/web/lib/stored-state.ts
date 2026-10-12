import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Map<string, Set<() => void>>()
const memory = new Map<string, string>()

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return memory.get(key) ?? null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  }
  catch {
    memory.set(key, value)
  }
  listeners.get(key)?.forEach(listener => listener())
}

function subscribe(key: string, listener: () => void) {
  const set = listeners.get(key) ?? new Set()
  set.add(listener)
  listeners.set(key, set)
  const onStorage = (event: StorageEvent) => {
    if (event.key === key)
      listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    set.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function readStoredValue<T>(key: string): T | undefined {
  const raw = read(key)
  if (raw === null)
    return undefined
  try {
    return JSON.parse(raw) as T
  }
  catch {
    return undefined
  }
}

export function writeStoredValue(key: string, value: unknown) {
  write(key, JSON.stringify(value))
}

export function useStoredState<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    useCallback(listener => subscribe(key, listener), [key]),
    () => read(key),
  )
  let value = fallback
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T
    }
    catch {}
  }
  const setValue = useCallback((next: T) => write(key, JSON.stringify(next)), [key])
  return [value, setValue]
}
