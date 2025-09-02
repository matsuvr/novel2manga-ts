export function getMissingAuthEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const required = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'AUTH_SECRET'] as const
  const missing: string[] = []
  for (const key of required) {
    const val = env[key]
    if (!val || String(val).trim() === '') missing.push(key)
  }
  return missing
}
