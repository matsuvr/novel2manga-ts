/**
 * Authentication に必須な環境変数が存在するかを検証する。
 *
 * @param env - 検証対象の環境変数オブジェクト。省略時は `process.env` を使用する。
 *              ただし、OpenNext + Cloudflare 環境では `getCloudflareContext().env` を明示的に渡すことを推奨します。
 * @returns 値が未設定または空文字の環境変数名の配列。
 */
export function getMissingAuthEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const required = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'AUTH_SECRET'] as const
  return required.filter((key) => {
    const val = env[key]
    return !val || String(val).trim() === ''
  })
}
