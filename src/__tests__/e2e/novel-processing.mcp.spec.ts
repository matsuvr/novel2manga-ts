import { expect, test } from '@playwright/test'

/**
 * PlaywrightのMCP機能を活用したE2Eテスト
 * 実際のブラウザ操作を通じてWebサービスの機能を検証
 */

const SAMPLE_NOVEL = `第一章　出会い

桜が舞い散る春の日、田中太郎は新しい高校の校門をくぐった。
「今日から新しい生活が始まるんだな」
そう呟きながら、彼は校舎を見上げた。

教室に向かう途中、廊下で一人の少女とぶつかってしまった。
「すみません！」
太郎が慌てて謝ると、少女は微笑んで答えた。
「いえいえ、大丈夫です。私も急いでいたので」

その少女の名前は佐藤花子といった。
彼女の優しい笑顔に、太郎の心は温かくなった。

「君も新入生？」
「はい、1年A組です」
「僕も同じクラスだ。よろしくお願いします」

こうして二人の高校生活が始まった。`

test.describe('Novel Processing with MCP Browser Automation', () => {
  test('完全な小説処理ワークフローの自動化', async ({ page }) => {
    // ページに移動
    await page.goto('/')

    // スクリーンショットを撮影してUI状態を記録
    await page.screenshot({ path: 'test-results/01-initial-page.png' })

    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle')

    // メインフォームの要素を特定
    const textArea = page.locator('textarea').first()
    const submitButton = page.locator('button[type="submit"]').first()

    // 要素が表示されていることを確認
    await expect(textArea).toBeVisible()
    await expect(submitButton).toBeVisible()

    // テキストエリアに小説を入力
    await textArea.click()
    await textArea.fill(SAMPLE_NOVEL)

    // 入力後のスクリーンショット
    await page.screenshot({ path: 'test-results/02-text-input.png' })

    // 送信ボタンをクリック
    await submitButton.click()

    // 処理開始の確認
    await expect(page.getByText('処理中')).toBeVisible({ timeout: 10000 })

    // 処理中画面のスクリーンショット
    await page.screenshot({ path: 'test-results/03-processing.png' })

    // プログレスインジケーターの監視
    const progressElement = page
      .locator('[data-testid="processing-progress"], .progress, .spinner')
      .first()
    if (await progressElement.isVisible()) {
      // プログレス要素が見つかった場合の処理
      console.log('Processing progress element found')
    }

    // ネットワーク活動の監視
    let apiCalls = 0
    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        apiCalls++
        console.log(`API call ${apiCalls}: ${response.url()} - ${response.status()}`)
      }
    })

    // 処理完了まで待機（長時間処理の可能性があるため）
    try {
      // 結果画面または完了メッセージを待機
      await Promise.race([
        page.waitForSelector('[data-testid="episode-list"]', { timeout: 180000 }),
        page.waitForSelector(':text("分析完了")', { timeout: 180000 }),
        page.waitForSelector(':text("エピソード")', { timeout: 180000 }),
      ])

      // 完了後のスクリーンショット
      await page.screenshot({ path: 'test-results/04-completed.png' })

      console.log(`Total API calls during processing: ${apiCalls}`)
    } catch (error) {
      // タイムアウト時のスクリーンショット
      await page.screenshot({ path: 'test-results/04-timeout.png' })

      // エラー状態の確認
      const errorElement = page.locator('.error, [data-testid="error"], :text("エラー")').first()
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent()
        console.log(`Error found: ${errorText}`)
      }

      throw error
    }
  })

  test('リアルタイム処理監視とインタラクション', async ({ page }) => {
    // コンソールログの監視
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      consoleLogs.push(`${msg.type()}: ${msg.text()}`)
    })

    // ネットワークエラーの監視
    const networkErrors: string[] = []
    page.on('response', (response) => {
      if (!response.ok()) {
        networkErrors.push(`${response.url()}: ${response.status()}`)
      }
    })

    await page.goto('/?demo=1') // デモモードで高速化

    // フォーム入力
    await page.fill('textarea', SAMPLE_NOVEL)
    await page.click('button[type="submit"]')

    // 処理中の状態変化を監視
    let stateChanges = 0
    const stateObserver = setInterval(async () => {
      try {
        const currentState = await page.evaluate(() => {
          // DOM状態の取得
          const processingElement = document.querySelector('[data-testid="processing-progress"]')
          const resultElement = document.querySelector('[data-testid="episode-list"]')

          return {
            hasProcessing: !!processingElement,
            hasResults: !!resultElement,
            url: window.location.href,
          }
        })

        console.log(`State check ${++stateChanges}:`, currentState)

        if (currentState.hasResults) {
          clearInterval(stateObserver)
        }
      } catch (error) {
        // ページが遷移中などでエラーが発生する可能性
        console.log('State check failed:', error)
      }
    }, 2000)

    // 最大2分間待機
    await page.waitForTimeout(120000)
    clearInterval(stateObserver)

    // テスト結果の出力
    console.log('Console logs:', consoleLogs)
    console.log('Network errors:', networkErrors)
    console.log('State changes monitored:', stateChanges)

    // 最終スクリーンショット
    await page.screenshot({ path: 'test-results/realtime-monitoring-final.png' })
  })

  test('エラーシナリオとリカバリー', async ({ page }) => {
    await page.goto('/')

    // 異常に長いテキストでのテスト
    const longText = SAMPLE_NOVEL.repeat(100) // 非常に長いテキスト

    await page.fill('textarea', longText)
    await page.click('button[type="submit"]')

    // エラー処理の確認
    const errorSelector = '.error, [data-testid="error"], :text("エラー")'
    const timeoutPromise = page.waitForTimeout(30000) // 30秒でタイムアウト
    const errorPromise = page.waitForSelector(errorSelector, { timeout: 30000 })

    const result = await Promise.race([
      errorPromise.then(() => 'error'),
      timeoutPromise.then(() => 'timeout'),
    ])

    if (result === 'error') {
      await page.screenshot({ path: 'test-results/error-scenario.png' })

      // エラーメッセージの内容を確認
      const errorText = await page.textContent(errorSelector)
      console.log('Error message:', errorText)
    }

    // リセット機能のテスト
    const resetButton = page.locator(
      'button:has-text("リセット"), button:has-text("戻る"), button:has-text("最初から")',
    )
    if (await resetButton.first().isVisible()) {
      await resetButton.first().click()

      // 初期状態に戻ったことを確認
      await expect(page.locator('textarea')).toBeEmpty()
    }
  })

  test('レスポンシブデザインのテスト', async ({ page }) => {
    // デスクトップサイズでの表示確認
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/')
    await page.screenshot({ path: 'test-results/desktop-view.png' })

    // タブレットサイズでの表示確認
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.reload()
    await page.screenshot({ path: 'test-results/tablet-view.png' })

    // モバイルサイズでの表示確認
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.screenshot({ path: 'test-results/mobile-view.png' })

    // モバイル環境でのフォーム操作テスト
    await page.fill('textarea', SAMPLE_NOVEL.substring(0, 500))
    await page.tap('button[type="submit"]')

    // モバイルでの処理開始確認
    await expect(page.getByText('処理中')).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'test-results/mobile-processing.png' })
  })
})

test.describe('Advanced API Testing with MCP', () => {
  test('API レスポンス時間の測定', async ({ request }) => {
    const startTime = Date.now()

    const response = await request.post('/api/novel', {
      data: { text: SAMPLE_NOVEL },
    })

    const uploadTime = Date.now() - startTime
    console.log(`Novel upload time: ${uploadTime}ms`)

    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data).toHaveProperty('uuid')

    // 分析APIの実行時間測定
    const analyzeStartTime = Date.now()
    const analyzeResponse = await request.post('/api/analyze?demo=1', {
      data: {
        novelId: data.uuid,
        chunkSize: 5000,
        overlapSize: 500,
        mode: 'demo',
      },
    })

    const analyzeTime = Date.now() - analyzeStartTime
    console.log(`Analysis API time: ${analyzeTime}ms`)

    expect(analyzeResponse.ok()).toBeTruthy()
  })

  test('同時複数リクエストの処理', async ({ request }) => {
    const requests = Array.from({ length: 3 }, (_, i) =>
      request.post('/api/novel', {
        data: { text: `${SAMPLE_NOVEL} - Request ${i + 1}` },
      }),
    )

    const responses = await Promise.all(requests)

    // すべてのリクエストが成功することを確認
    responses.forEach((response, index) => {
      expect(response.ok(), `Request ${index + 1} should succeed`).toBeTruthy()
    })

    console.log('All concurrent requests completed successfully')
  })
})
