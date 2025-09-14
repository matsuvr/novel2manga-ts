/**
 * Authentication に必須な環境変数が存在するかを検証する。
 *
 * @param env - 検証対象の環境変数オブジェクト。省略時は `process.env` を使用する。
 * @returns 値が未設定または空文字の環境変数名の配列。
 */
export function getMissingAuthEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  // AUTH_SECRET is supported, but NextAuth also accepts NEXTAUTH_SECRET.
  // Consider the secret present if either environment variable is set.
  const required = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'] as const

  const missing = required.filter((key) => {
    const val = env[key]
    return !val || String(val).trim() === ''
  })

  // If neither AUTH_SECRET nor NEXTAUTH_SECRET is provided, report the missing secret.
  const hasAuthSecret = Boolean(env.AUTH_SECRET && String(env.AUTH_SECRET).trim() !== '')
  const hasNextAuthSecret = Boolean(env.NEXTAUTH_SECRET && String(env.NEXTAUTH_SECRET).trim() !== '')
  if (!hasAuthSecret && !hasNextAuthSecret) {
    // Report the canonical variable name used in the app (AUTH_SECRET) for clarity,
    // but also accept NEXTAUTH_SECRET as valid at runtime.
    return [...missing, 'AUTH_SECRET']
  }

  return missing
}
