// Environment helpers (no direct global casts; no any usage)

interface ProcessLike {
  env?: Record<string, string | undefined>
}

function getProcess(): ProcessLike | undefined {
  const g: unknown = globalThis
  if (typeof g === 'object' && g !== null && 'process' in g) {
    const proc = (g as { process?: unknown }).process
    if (proc && typeof proc === 'object') return proc as ProcessLike
  }
  return undefined
}

export function getEnvVar(name: string): string | undefined {
  return getProcess()?.env?.[name]
}

export function getNodeEnv(): string | undefined {
  return getEnvVar('NODE_ENV')
}

export function isTestEnv(): boolean {
  return getNodeEnv() === 'test'
}
