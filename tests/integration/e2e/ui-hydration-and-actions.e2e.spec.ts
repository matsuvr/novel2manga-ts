import { expect, test } from '@playwright/test'

// このE2Eは以下を検証します:
// - 初期表示が一定時間内に完了する（フォント取得でSSRがブロックされない）
// - クライアントハイドレーションにより [HomeClient]/[TextInputArea] の console が出力される
// - サンプルボタン押下でテキストが投入され、送信ボタンが有効になる
// - 「マンガに変換」押下で進捗ビューに遷移し、処理中文言が表示される（demo=1）
// - 外部フォントへのリクエストが発生しない（fonts.googleapis.com / fonts.gstatic.com）

test.describe('UI hydration and actions (demo mode)', () => {
  test('home hydrates quickly and buttons respond', async ({ page }) => {
    // 1) 監視: console / request
    const consoleMessages: string[] = []
    const externalFontRequests: string[] = []

    page.on('console', (msg) => {
      const text = msg.text()
      consoleMessages.push(text)
    })
    page.on('request', (req) => {
      try {
        const url = new URL(req.url())
        if (
          url.hostname.includes('fonts.googleapis.com') ||
          url.hostname.includes('fonts.gstatic.com')
        ) {
          externalFontRequests.push(req.url())
        }
      } catch {
        // ignore malformed URL
      }
    })

    // 2) 初期表示: demo=1 で高速化
    const start = Date.now()
    await page.goto('/?demo=1', { waitUntil: 'domcontentloaded' })
    const loadMs = Date.now() - start

    // フォント取得タイムアウト(60秒超)などが発生していないことを確認
    // 環境差を考慮して閾値は 20s
    expect(loadMs).toBeLessThan(20_000)

    // UI要素の初期可視性
    await expect(page.getByText('小説テキスト入力')).toBeVisible()

    // 3) ハイドレーション確認: クライアントログが数秒内に出る
    await expect
      .poll(() => consoleMessages.some((m) => m.includes('[HomeClient] render')), {
        timeout: 5_000,
      })
      .toBeTruthy()
    await expect
      .poll(() => consoleMessages.some((m) => m.includes('[TextInputArea] render')), {
        timeout: 5_000,
      })
      .toBeTruthy()

    // 4) サンプル読込 → テキスト投入 → 送信ボタン活性化
    const textarea = page.locator('textarea').first()
    // 任意のサンプルボタン（ラベル一致）
    await page.getByRole('button', { name: /最後の一葉/ }).click()

    await expect
      .poll(async () => (await textarea.inputValue()).length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0)

    const submitButton = page.getByRole('button', { name: /マンガに変換/ })
    await expect(submitButton).toBeEnabled()

    // 5) 送信押下 → クリックログ → 進捗ビューへ
    const beforeClickLogs = consoleMessages.length
    await submitButton.click()

    // クリックハンドラのログ
    await expect
      .poll(
        () =>
          consoleMessages
            .slice(beforeClickLogs)
            .some((m) => m.includes('[TextInputArea] click submit button')),
        { timeout: 5_000 },
      )
      .toBeTruthy()

    // 進捗UI（AI処理中）が表示されること
    await expect(page.getByText('AI処理中')).toBeVisible({ timeout: 30_000 })

    // 6) 外部フォントへのアクセスが無いこと
    expect(externalFontRequests, 'No external Google Fonts requests expected').toHaveLength(0)
  })
})
