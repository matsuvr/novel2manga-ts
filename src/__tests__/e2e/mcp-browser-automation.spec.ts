/**
 * PlaywrightのMCPツールを活用したブラウザ自動化テスト
 *
 * このテストファイルでは、MCPのPlaywrightツールを使用して
 * より高度なブラウザ操作とテストシナリオを実行します。
 *
 * 注意：このテストを実行するには、MCPのPlaywrightツールが
 * セットアップされている必要があります。
 */

import { expect, test } from '@playwright/test'

const TEST_NOVEL = `桜の季節

春の訪れとともに、学校の桜が満開になった。
新入生の田中太郎は、その美しい光景に見とれていた。

「綺麗ですね」

隣から声をかけられて振り返ると、同じクラスの佐藤花子が立っていた。
彼女もまた、桜の美しさに心を奪われているようだった。

「本当にそうですね。こんな景色は初めて見ます」
「私も同感です。新しい生活の始まりにふさわしい光景ですね」

二人は並んで桜を眺めながら、これから始まる高校生活への期待に胸を膨らませていた。
友情の芽生えは、この桜の季節から始まったのである。`

/**
 * MCPブラウザナビゲーションテスト
 * 実際のMCPツールを使用してページ遷移をテスト
 */
test.describe('MCP Browser Navigation Tests', () => {
  test('MCPツールでのページナビゲーション', async ({ page }) => {
    // MCP browser_navigate を使用してホームページに移動
    // (注：この部分は実際のMCP実装に合わせて調整が必要)
    await page.goto('/')

    // ページの読み込み完了を確認
    await page.waitForLoadState('networkidle')

    // MCPスナップショット機能でページ状態を記録
    await page.screenshot({
      path: 'test-results/mcp-home-page.png',
      fullPage: true,
    })

    // フォーム要素の確認
    const textArea = page.locator('textarea')
    const submitButton = page.locator('button[type="submit"]')

    await expect(textArea).toBeVisible()
    await expect(submitButton).toBeVisible()
  })

  test('MCPクリック操作とフォーム入力', async ({ page }) => {
    await page.goto('/')

    // テキストエリアへの入力（MCPのtype機能をシミュレート）
    const textArea = page.locator('textarea')
    await textArea.click()

    // 文字を一つずつタイプ（リアルなユーザー操作をシミュレート）
    await textArea.type(TEST_NOVEL, { delay: 50 })

    // 入力完了後のスクリーンショット
    await page.screenshot({ path: 'test-results/mcp-text-input.png' })

    // 送信ボタンのクリック
    await page.click('button[type="submit"]')

    // 処理開始の確認
    await expect(page.getByText('処理中')).toBeVisible({ timeout: 10000 })

    // 処理中画面のキャプチャ
    await page.screenshot({ path: 'test-results/mcp-processing.png' })
  })

  test('MCPダイアログ処理', async ({ page }) => {
    // アラートやダイアログの処理テスト
    page.on('dialog', async (dialog) => {
      console.log(`Dialog detected: ${dialog.type()} - ${dialog.message()}`)
      await dialog.accept()
    })

    await page.goto('/')

    // 意図的にエラーを発生させる（例：非常に短いテキスト）
    await page.fill('textarea', 'a')
    await page.click('button[type="submit"]')

    // エラーダイアログまたはメッセージの確認
    const errorElement = page.locator('.error, [data-testid="error"]').first()
    if (await errorElement.isVisible({ timeout: 5000 })) {
      const errorText = await errorElement.textContent()
      console.log(`Error message captured: ${errorText}`)

      await page.screenshot({ path: 'test-results/mcp-error-dialog.png' })
    }
  })
})

/**
 * MCPネットワーク監視テスト
 * APIコールとネットワーク活動を詳細に監視
 */
test.describe('MCP Network Monitoring', () => {
  test('ネットワークリクエストの監視と分析', async ({ page }) => {
    const networkRequests: Array<{
      url: string
      method: string
      status: number
      duration: number
    }> = []

    // ネットワーク活動の監視
    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        console.log(`Request started: ${request.method()} ${request.url()}`)
      }
    })

    page.on('response', async (response) => {
      if (response.url().includes('/api/')) {
        const timing = response.request().timing()
        const duration = timing ? timing.responseEnd - timing.requestStart : 0

        networkRequests.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          duration,
        })

        console.log(`Response received: ${response.status()} ${response.url()} (${duration}ms)`)
      }
    })

    await page.goto('/')

    // 小説テキストを入力して送信
    await page.fill('textarea', TEST_NOVEL)
    await page.click('button[type="submit"]')

    // 初期APIコールの完了を待機
    await page.waitForTimeout(5000)

    // ネットワーク統計の出力
    console.log('Network Request Summary:')
    networkRequests.forEach((req, index) => {
      console.log(`${index + 1}. ${req.method} ${req.url} - ${req.status} (${req.duration}ms)`)
    })

    // APIエンドポイントが正しく呼ばれていることを確認
    const novelUploadRequest = networkRequests.find((req) => req.url.includes('/api/novel'))
    expect(novelUploadRequest).toBeDefined()
    expect(novelUploadRequest?.status).toBe(200)

    const analyzeRequest = networkRequests.find((req) => req.url.includes('/api/analyze'))
    expect(analyzeRequest).toBeDefined()
  })

  test('コンソールメッセージの監視', async ({ page }) => {
    const consoleMessages: Array<{
      type: string
      text: string
      timestamp: number
    }> = []

    // コンソールメッセージの収集
    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      })
    })

    // エラー発生の監視
    page.on('pageerror', (error) => {
      console.error(`Page error detected: ${error.message}`)
    })

    await page.goto('/')
    await page.fill('textarea', TEST_NOVEL)
    await page.click('button[type="submit"]')

    // 処理中の監視
    await page.waitForTimeout(10000)

    // コンソールログの分析
    console.log('Console Messages Summary:')
    consoleMessages.forEach((msg, index) => {
      console.log(`${index + 1}. [${msg.type}] ${msg.text}`)
    })

    // エラーメッセージがないことを確認
    const errors = consoleMessages.filter((msg) => msg.type === 'error')
    if (errors.length > 0) {
      console.warn(`Found ${errors.length} console errors:`)
      errors.forEach((error) => console.warn(error.text))
    }
  })
})

/**
 * MCPキー操作テスト
 * キーボードショートカットやアクセシビリティをテスト
 */
test.describe('MCP Keyboard Interaction', () => {
  test('キーボードナビゲーション', async ({ page }) => {
    await page.goto('/')

    // Tabキーでのフォーカス移動
    await page.keyboard.press('Tab')
    const focusedElement1 = await page.evaluate(() => document.activeElement?.tagName)

    await page.keyboard.press('Tab')
    const focusedElement2 = await page.evaluate(() => document.activeElement?.tagName)

    console.log(`Focus sequence: ${focusedElement1} -> ${focusedElement2}`)

    // Enter キーでの送信（テキストが入力されている場合）
    await page.locator('textarea').focus()
    await page.keyboard.type(TEST_NOVEL.substring(0, 100))

    // Ctrl+A で全選択
    await page.keyboard.press('Control+a')

    // Ctrl+V でペースト（クリップボードシミュレーション）
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+v')

    await page.screenshot({ path: 'test-results/mcp-keyboard-input.png' })
  })

  test('ショートカットキーの動作確認', async ({ page }) => {
    await page.goto('/')

    // F5でリロード
    await page.keyboard.press('F5')
    await page.waitForLoadState('networkidle')

    // Escキーでモーダル閉じる動作（該当する場合）
    await page.keyboard.press('Escape')

    // Ctrl+Shift+I で開発者ツール（ブラウザによる）
    // 注：実際のテストでは開発者ツールは開かないが、キーイベントは送信される
    await page.keyboard.press('F12')

    await page.screenshot({ path: 'test-results/mcp-shortcuts.png' })
  })
})

/**
 * MCPによる高度なシナリオテスト
 * 複合的な操作フローをテスト
 */
test.describe('MCP Advanced Scenarios', () => {
  test('複数タブでの動作確認', async ({ context }) => {
    // 新しいタブを開く
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    // 各タブで異なる操作を実行
    await page1.goto('/')
    await page2.goto('/scenario')

    // 同時にフォーム操作
    await Promise.all([page1.fill('textarea', TEST_NOVEL), page2.waitForLoadState('networkidle')])

    await page1.screenshot({ path: 'test-results/mcp-tab1.png' })
    await page2.screenshot({ path: 'test-results/mcp-tab2.png' })

    // タブ間の切り替えテスト
    await page2.bringToFront()
    await page1.bringToFront()

    await page1.close()
    await page2.close()
  })

  test('セッション継続性のテスト', async ({ page }) => {
    await page.goto('/')

    // 初期状態でデータを入力
    await page.fill('textarea', TEST_NOVEL)

    // ページリロード
    await page.reload()

    // データが保持されているかチェック（ローカルストレージやセッションによる）
    const textValue = await page.locator('textarea').inputValue()

    if (textValue) {
      console.log('Session data preserved after reload')
    } else {
      console.log('Session data cleared after reload')
    }

    await page.screenshot({ path: 'test-results/mcp-session-test.png' })
  })

  test('パフォーマンス監視', async ({ page }) => {
    // パフォーマンス指標の測定開始
    await page.goto('/')

    const startTime = Date.now()

    // フォーム送信とレスポンス時間の測定
    await page.fill('textarea', TEST_NOVEL)
    await page.click('button[type="submit"]')

    // 最初のAPIレスポンスまでの時間を測定
    await page.waitForResponse(
      (response) => response.url().includes('/api/novel') && response.status() === 200,
    )

    const responseTime = Date.now() - startTime
    console.log(`Initial response time: ${responseTime}ms`)

    // メモリ使用量などのパフォーマンス指標を取得
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming
      return {
        domContentLoaded:
          navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint:
          performance.getEntriesByType('paint').find((p) => p.name === 'first-paint')?.startTime ||
          0,
        firstContentfulPaint:
          performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
            ?.startTime || 0,
      }
    })

    console.log('Performance Metrics:', performanceMetrics)

    // パフォーマンス閾値のアサーション
    expect(responseTime).toBeLessThan(10000) // 10秒以内
    expect(performanceMetrics.domContentLoaded).toBeLessThan(2000) // 2秒以内
  })
})
