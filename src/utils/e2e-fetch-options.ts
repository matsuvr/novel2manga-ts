/**
 * E2Eテスト用のfetchオプション生成ヘルパー
 *
 * ProcessingProgress.tsx等でE2E用のクエリパラメータとヘッダーが重複していたため、
 * 保守性向上のために共通化。
 */

export interface E2EFetchOptions {
  /** URL末尾に追加するクエリパラメータ（"?e2e=1" または ""） */
  urlSuffix: string
  /** fetchに追加するヘッダー */
  headers: Record<string, string> | undefined
}

/**
 * E2Eテスト用のfetchオプションを生成する
 *
 * @returns E2E環境の場合はクエリパラメータとヘッダーを含むオプション、通常環境では空のオプション
 */
export function getE2EFetchOptions(): E2EFetchOptions {
  const isE2E = process.env.NEXT_PUBLIC_E2E === '1'

  return {
    urlSuffix: isE2E ? '?e2e=1' : '',
    headers: isE2E ? { 'x-e2e-auth-bypass': '1' } : undefined,
  }
}

/**
 * E2E対応のfetch関数
 *
 * @param url ベースURL
 * @param init fetch初期化オプション
 * @returns Promise<Response>
 */
export async function fetchWithE2E(url: string, init?: RequestInit): Promise<Response> {
  const { urlSuffix, headers } = getE2EFetchOptions()

  const finalInit: RequestInit = {
    ...init,
    headers: {
      ...init?.headers,
      ...headers,
    },
  }

  return fetch(`${url}${urlSuffix}`, finalInit)
}

/**
 * E2E対応のEventSource URL生成
 *
 * @param baseUrl ベースURL
 * @returns E2E環境では?e2e=1が付与されたURL、通常環境ではそのままのURL
 */
export function getEventSourceURL(baseUrl: string): string {
  const { urlSuffix } = getE2EFetchOptions()
  return `${baseUrl}${urlSuffix}`
}